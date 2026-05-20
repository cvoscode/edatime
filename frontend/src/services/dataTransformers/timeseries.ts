// services/dataTransformers/timeseries.ts
// Pure Arrow-to-timeseries transformation functions — NO SolidJS imports

import { tableFromIPC, type Table } from 'apache-arrow';
import { getColorPalette, type ColorScaleName } from '../../utils/colorScale';
import type { AdaptiveLineFilter } from '../../types';
import type { TimeseriesData } from '../../types/domains';

// Re-export TimeseriesData so callers can import from here
export type { TimeseriesData } from '../../types/domains';

// =============================================================================
// Shared types
// =============================================================================

export interface ColumnFilters {
  [column: string]: { min: number; max: number };
}

export interface ColorScaleInfo {
  isNumeric: boolean;
  min: number | null;
  max: number | null;
  categories: string[];
}

// =============================================================================
// Transform options
// =============================================================================

export interface TransformOptions {
  xAxisColumn: string;
  traceColumns: string[];
  colorColumn?: string | null;
}

export interface SeriesConfigOptions {
  colors: Record<string, string>;
  filters?: ColumnFilters;
  colorColumn?: string | null;
  showLines?: boolean;
  colorScale?: ColorScaleName;
  adaptiveFilters?: AdaptiveLineFilter[];
  showMarkers?: boolean;
}

export interface SeriesConfig {
  name: string;
  data: [number, number][];
  color: string;
  visible: boolean;
  showInLegend: boolean;
}

// =============================================================================
// Arrow decoding (async)
// =============================================================================

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const numericValue = typeof value === 'bigint' ? Number(value) : Number(value);
  const abs = Math.abs(numericValue);
  if (abs >= 1e17) return numericValue / 1e6;
  if (abs >= 1e14) return numericValue / 1e3;
  if (abs >= 1e11) return numericValue;
  return numericValue * 1e3;
}

/**
 * Parse an Arrow IPC buffer and extract timeseries data.
 * Returns xValues (timestamps) and series (numeric columns).
 * Pure async function — no SolidJS imports.
 */
export async function transformArrowToTimeseries(
  buffer: ArrayBuffer,
  options?: TransformOptions
): Promise<TimeseriesData> {
  const table: Table = tableFromIPC(buffer);

  const xAxisColumn = options?.xAxisColumn ?? '__time__';
  const traceColumns = options?.traceColumns ?? [];
  const colorColumn = options?.colorColumn ?? null;

  const xCol = table.getChild(xAxisColumn);
  const rawXValues = xCol ? Array.from(xCol) : [];
  const xValues = Float64Array.from(rawXValues, v => toEpochMs(v));

  const series: Record<string, Float64Array> = {};
  for (const col of traceColumns) {
    const c = table.getChild(col);
    if (c) {
      series[col] = Float64Array.from(Array.from(c), v => Number(v));
    }
  }

  let colorByColumn: Record<string, Float64Array> | undefined;
  if (colorColumn) {
    const cCol = table.getChild(colorColumn);
    if (cCol) {
      colorByColumn = {};
      colorByColumn[colorColumn] = Float64Array.from(Array.from(cCol), v => Number(v));
    }
  }

  return {
    xValues,
    series,
    returnedRows: table.numRows,
    downsampled: false,
    colorByColumn,
  };
}

// =============================================================================
// Column range filters
// =============================================================================

export function applyColumnRanges(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  filters: ColumnFilters
): { xValues: Float64Array; series: Record<string, Float64Array> } {
  if (Object.keys(filters).length === 0) {
    return { xValues, series };
  }

  const filteredTmpX: number[] = [];
  const filteredTmpSeries: Record<string, number[]> = {};

  for (const col of Object.keys(series)) {
    filteredTmpSeries[col] = [];
  }

  const maxLen = Math.min(xValues.length, ...Object.values(series).map(v => v.length));
  for (let i = 0; i < maxLen; i++) {
    let include = true;
    for (const [col, filter] of Object.entries(filters)) {
      const y = series[col]?.[i];
      if (y !== undefined && (y < filter.min || y > filter.max)) {
        include = false;
        break;
      }
    }
    if (include) {
      filteredTmpX.push(xValues[i]);
      for (const col of Object.keys(series)) {
        filteredTmpSeries[col].push(series[col][i]);
      }
    }
  }

  return {
    xValues: Float64Array.from(filteredTmpX),
    series: Object.fromEntries(
      Object.entries(filteredTmpSeries).map(([k, v]) => [k, Float64Array.from(v)])
    ),
  };
}

// =============================================================================
// Adaptive line filters
// =============================================================================

export function applyAdaptiveFilters(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  adaptiveFilters: AdaptiveLineFilter[]
): { xValues: Float64Array; series: Record<string, Float64Array> } {
  if (!adaptiveFilters || adaptiveFilters.length === 0) {
    return { xValues, series };
  }

  const filteredX: number[] = [];
  const filteredSeries: Record<string, number[]> = {};
  for (const col of Object.keys(series)) {
    filteredSeries[col] = [];
  }

  for (let i = 0; i < xValues.length; i++) {
    let passAdaptive = true;
    for (const f of adaptiveFilters) {
      const colSeries = series[f.column];
      if (!colSeries) continue;
      const y = colSeries[i];
      if (y === undefined) continue;
      const dx = f.x2 - f.x1;
      if (dx === 0) continue;
      const expectedY = f.y1 + (f.y2 - f.y1) * (xValues[i] - f.x1) / dx;
      if (f.keepAbove && y <= expectedY) { passAdaptive = false; break; }
      if (!f.keepAbove && y >= expectedY) { passAdaptive = false; break; }
    }
    if (passAdaptive) {
      filteredX.push(xValues[i]);
      for (const col of Object.keys(series)) {
        filteredSeries[col].push(series[col][i]);
      }
    }
  }

  return {
    xValues: Float64Array.from(filteredX),
    series: Object.fromEntries(
      Object.entries(filteredSeries).map(([k, v]) => [k, Float64Array.from(v)])
    ),
  };
}

// =============================================================================
// Color scale analysis
// =============================================================================

export function analyzeColorValues(values: unknown[]): ColorScaleInfo | null {
  if (!Array.isArray(values) || values.length === 0) return null;

  let numericCount = 0;
  let nonNumericCount = 0;
  const uniqueValues = new Set<string>();
  const sampleSize = Math.min(values.length, 1000);

  for (let i = 0; i < sampleSize; i++) {
    const raw = values[i];
    if (raw == null) continue;
    uniqueValues.add(String(raw));
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) numericCount += 1;
    else nonNumericCount += 1;
  }

  const isNumeric = numericCount > 0 && nonNumericCount === 0;
  if (isNumeric) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of values) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { isNumeric: true, min, max, categories: [] };
  }

  const categories: string[] = [];
  for (const v of uniqueValues) categories.push(v);
  return { isNumeric: false, min: null, max: null, categories };
}

// =============================================================================
// Color bucketing helpers (extracted from dataFetch.ts)
// =============================================================================

const COLOR_BUCKETS = 64;
const _bucketPalettes: Record<string, string[]> = {};

function getBucketPalette(scaleName: ColorScaleName): string[] {
  if (_bucketPalettes[scaleName]) return _bucketPalettes[scaleName];
  const colors = getColorPalette(scaleName, COLOR_BUCKETS);
  _bucketPalettes[scaleName] = colors;
  return colors;
}

function getInterpolatedColor(t: number, scaleName: ColorScaleName = 'viridis'): string {
  const palette = getBucketPalette(scaleName);
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (palette.length - 1);
  const lo = Math.floor(scaled);
  return palette[Math.min(lo, palette.length - 1)] as string;
}

function colorForScaleValue(
  rawValue: unknown,
  scaleInfo: ColorScaleInfo,
  scaleName: ColorScaleName = 'viridis'
): string | null {
  if (!scaleInfo) return null;
  if (scaleInfo.isNumeric) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) return null;
    const span = (scaleInfo.max as number) - (scaleInfo.min as number);
    const t = span > 0 ? (numeric - (scaleInfo.min as number)) / span : 0;
    return getInterpolatedColor(t, scaleName);
  }
  return null;
}

function categoryColorFor(label: string, categories: string[], baseIdx: number = 0): string {
  const index = categories.indexOf(label);
  const palette = getColorPalette('viridis', categories.length + 1);
  return palette[index >= 0 ? index : baseIdx] ?? '#888888';
}

// =============================================================================
// Colorized series builder
// =============================================================================

interface ColorizedSeriesResult {
  series: SeriesConfig[];
  annotations: any[];
}

function buildColorizedSeries(
  colName: string,
  points: [number, number][],
  colorValues: unknown[],
  scaleInfo: ColorScaleInfo,
  visible: boolean,
  showMarkers: boolean,
  scaleName: ColorScaleName = 'viridis'
): ColorizedSeriesResult {
  const result: SeriesConfig[] = [];
  const annotations: any[] = [];

  if (!Array.isArray(points) || points.length === 0 || !Array.isArray(colorValues) || !scaleInfo) {
    return { series: result, annotations };
  }

  if (points.length === 1) {
    const pointColor = colorForScaleValue(colorValues[0], scaleInfo, scaleName) || '#888888';
    result.push({ name: colName, color: pointColor, visible, showInLegend: true, data: [points[0], points[0]] });
    if (showMarkers && visible) {
      annotations.push({ type: 'point', x: points[0][0], y: points[0][1], layer: 'aboveSeries', marker: { symbol: 'circle', size: 5, style: { color: pointColor } } });
    }
    return { series: result, annotations };
  }

  if (scaleInfo.isNumeric) {
    const min = scaleInfo.min as number;
    const span = (scaleInfo.max as number) - min;
    const buckets = new Uint8Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const v = Number(colorValues[i]);
      const t = span > 0 ? Math.max(0, Math.min(1, (v - min) / span)) : 0.5;
      buckets[i] = Math.max(0, Math.min(COLOR_BUCKETS - 1, Math.floor(t * (COLOR_BUCKETS - 1) + 0.5)));
    }

    const palette = getBucketPalette(scaleName);
    let segIdx = 0;
    let runStart = 0;
    while (runStart < points.length) {
      const bucket = buckets[runStart];
      let runEnd = runStart + 1;
      while (runEnd < points.length && buckets[runEnd] === bucket) runEnd++;

      const segEnd = Math.min(runEnd, points.length);
      const segData: [number, number][] = [];
      for (let j = runStart; j < segEnd; j++) segData.push(points[j]);
      if (segEnd < points.length) segData.push(points[segEnd]);

      const color = palette[bucket];
      result.push({
        name: segIdx === 0 ? colName : `__color_seg__${colName}::${segIdx}`,
        color,
        visible,
        showInLegend: segIdx === 0,
        data: segData,
      });
      segIdx++;
      runStart = runEnd;
    }
  } else {
    const labels = colorValues.map((v) => String(v ?? ''));
    let segIdx = 0;
    let runStart = 0;
    while (runStart < labels.length) {
      const label = labels[runStart];
      let runEnd = runStart + 1;
      while (runEnd < labels.length && labels[runEnd] === label) runEnd++;

      const segEnd = Math.min(runEnd, labels.length);
      const segData: [number, number][] = [];
      for (let j = runStart; j < segEnd; j++) segData.push(points[j]);
      if (segEnd < points.length) segData.push(points[segEnd]);

      const color = categoryColorFor(label, scaleInfo.categories, segIdx);
      result.push({
        name: segIdx === 0 ? colName : `__color_seg__${colName}::${segIdx}`,
        color,
        visible,
        showInLegend: segIdx === 0,
        data: segData,
      });
      segIdx++;
      runStart = runEnd;
    }
  }

  if (showMarkers && visible && points.length <= 500) {
    for (let i = 0; i < points.length; i++) {
      const pointColor = colorForScaleValue(colorValues[i], scaleInfo, scaleName) || '#888888';
      annotations.push({ type: 'point', x: points[i][0], y: points[i][1], layer: 'aboveSeries', marker: { symbol: 'circle', size: 5, style: { color: pointColor } } });
    }
  }

  return { series: result, annotations };
}

export function baseSeriesName(name: string): string {
  const text = String(name || '');
  if (!text) return '';
  if (text.endsWith('__markers')) return text.slice(0, -'__markers'.length);
  if (text.startsWith('__color_seg__')) {
    const body = text.slice('__color_seg__'.length);
    return body.split('::')[0] || '';
  }
  return text;
}

// =============================================================================
// SeriesConfig builder
// =============================================================================

export function buildSeriesConfig(
  tsData: TimeseriesData,
  options: SeriesConfigOptions
): SeriesConfig[] {
  const {
    colors,
    filters,
    colorColumn,
    showLines = true,
    colorScale = 'viridis',
    adaptiveFilters,
    showMarkers = false,
  } = options;

  let filteredX = tsData.xValues;
  let filteredSeries = tsData.series;

  if ((filters && Object.keys(filters).length > 0) || (adaptiveFilters && adaptiveFilters.length > 0)) {
    const combined = applyColumnRanges(tsData.xValues, tsData.series, filters ?? {});
    filteredX = combined.xValues;
    filteredSeries = combined.series;
    if (adaptiveFilters && adaptiveFilters.length > 0) {
      const adapted = applyAdaptiveFilters(filteredX, filteredSeries, adaptiveFilters);
      filteredX = adapted.xValues;
      filteredSeries = adapted.series;
    }
  }

  const resultSeries: SeriesConfig[] = [];

  for (const [colName, yValues] of Object.entries(filteredSeries)) {
    const points: [number, number][] = [];
    for (let i = 0; i < Math.min(filteredX.length, yValues.length); i++) {
      const x = filteredX[i];
      const y = yValues[i];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push([x, y]);
      }
    }

    if (points.length === 0) continue;

    const wantsColorBy =
      !!colorColumn &&
      tsData.colorByColumn &&
      tsData.colorByColumn[colorColumn] &&
      tsData.colorByColumn[colorColumn].length === points.length;

    if (wantsColorBy) {
      const colorValues = tsData.colorByColumn![colorColumn!];
      const displayedValues: unknown[] = [];
      for (let i = 0; i < points.length; i++) {
        displayedValues.push(i < colorValues.length ? colorValues[i] : null);
      }

      const sampleForAnalysis = displayedValues.slice(0, Math.min(displayedValues.length, 1000));
      const scaleInfo = analyzeColorValues(sampleForAnalysis);
      if (scaleInfo) {
        const colorized = buildColorizedSeries(colName, points, displayedValues, scaleInfo, true, showMarkers, colorScale);
        resultSeries.push(...colorized.series);
      } else {
        resultSeries.push({
          name: colName,
          data: points,
          color: colors[colName] ?? '#5470C6',
          visible: true,
          showInLegend: true,
        });
      }
    } else {
      resultSeries.push({
        name: colName,
        data: points,
        color: colors[colName] ?? '#5470C6',
        visible: true,
        showInLegend: true,
      });
    }
  }

  return resultSeries;
}