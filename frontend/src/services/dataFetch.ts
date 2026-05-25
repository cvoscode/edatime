import { tableFromIPC } from 'apache-arrow';
import { debugLog, debugLogOnce } from '../utils/debug';
import { getColorPalette, type ColorScaleName } from '../utils/colorScale';
import { fetchArrow } from './api';
import type { AdaptiveLineFilter } from '../types';

export interface ScatterDataResult {
  points: [number, number][];
  colorValues: number[] | null;
  colorLabels: (string | null)[] | null;
  colorMin: number | null;
  colorMax: number | null;
  colorKind: 'continuous' | 'categorical' | null;
  sizeValues: number[] | null;
  sizeMin: number | null;
  sizeMax: number | null;
  totalPoints: number;
  returnedPoints: number;
}

export interface TimeseriesData {
  xValues: Float64Array;
  series: Record<string, Float64Array>;
  returnedRows: number;
  downsampled: boolean;
  colorByColumn?: Record<string, Float64Array>;
}

export interface ColumnFilters {
  [column: string]: { min: number; max: number };
}

export interface ColorScaleInfo {
  isNumeric: boolean;
  min: number | null;
  max: number | null;
  categories: string[];
}

// Cached last fetch result for fast color-only updates.
// Cache is invalidated when dataset revision changes (see datasetStore.setMetadata).
class TimeseriesCache {
  xValues: Float64Array | null = null;
  series: Record<string, Float64Array> | null = null;

  clear(): void {
    this.xValues = null;
    this.series = null;
  }

  update(xValues: Float64Array, series: Record<string, Float64Array>): void {
    this.xValues = xValues;
    this.series = series;
  }
}

const _cache = new TimeseriesCache();

export function clearCache(): void {
  _cache.clear();
}

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

export function applyColumnRanges(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  filters: ColumnFilters,
  adaptiveFilters?: AdaptiveLineFilter[]
): { xValues: Float64Array; series: Record<string, Float64Array> } {
  let filteredX = xValues;
  let filteredSeries = series;

  if (Object.keys(filters).length > 0) {
    const filteredTmpX: number[] = [];
    const filteredTmpSeries: Record<string, number[]> = {};

    for (const col of Object.keys(filteredSeries)) {
      filteredTmpSeries[col] = [];
    }

    const maxLen = Math.min(filteredX.length, ...Object.values(filteredSeries).map(v => v.length));
    for (let i = 0; i < maxLen; i++) {
      let include = true;
      for (const [col, filter] of Object.entries(filters)) {
        const y = filteredSeries[col]?.[i];
        if (y !== undefined && (y < filter.min || y > filter.max)) {
          include = false;
          break;
        }
      }
      if (include) {
        filteredTmpX.push(filteredX[i]);
        for (const col of Object.keys(filteredSeries)) {
          filteredTmpSeries[col].push(filteredSeries[col][i]);
        }
      }
    }
    filteredX = Float64Array.from(filteredTmpX);
    filteredSeries = Object.fromEntries(
      Object.entries(filteredTmpSeries).map(([k, v]) => [k, Float64Array.from(v)])
    );
  }

  // Apply adaptive line filters if present
  if (adaptiveFilters && adaptiveFilters.length > 0) {
    const adaptiveFilteredX: number[] = [];
    const adaptiveFilteredSeries: Record<string, number[]> = {};
    for (const col of Object.keys(filteredSeries)) {
      adaptiveFilteredSeries[col] = [];
    }

    for (let i = 0; i < filteredX.length; i++) {
      let passAdaptive = true;
      for (const f of adaptiveFilters) {
        const colSeries = filteredSeries[f.column];
        if (!colSeries) continue;
        const y = colSeries[i];
        if (y === undefined) continue;
        // Calculate expected y on the line at this timestamp
        const dx = f.x2 - f.x1;
        if (dx === 0) continue;
        const expectedY = f.y1 + (f.y2 - f.y1) * (filteredX[i] - f.x1) / dx;
        if (f.keepAbove && y <= expectedY) { passAdaptive = false; break; }
        if (!f.keepAbove && y >= expectedY) { passAdaptive = false; break; }
      }
      if (passAdaptive) {
        adaptiveFilteredX.push(filteredX[i]);
        for (const col of Object.keys(filteredSeries)) {
          adaptiveFilteredSeries[col].push(filteredSeries[col][i]);
        }
      }
    }
    filteredX = Float64Array.from(adaptiveFilteredX);
    filteredSeries = Object.fromEntries(
      Object.entries(adaptiveFilteredSeries).map(([k, v]) => [k, Float64Array.from(v)])
    );
  }

  return {
    xValues: filteredX,
    series: filteredSeries,
  };
}

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const numericValue = typeof value === 'bigint' ? Number(value) : Number(value);
  const abs = Math.abs(numericValue);
  if (abs >= 1e17) return numericValue / 1e6;
  if (abs >= 1e14) return numericValue / 1e3;
  if (abs >= 1e11) return numericValue;
  return numericValue * 1e3;
}

export async function fetchTimeseriesData(
  start: string,
  end: string,
  width: number,
  xAxisColumn: string,
  traceColumns: string[],
  signal?: AbortSignal,
  colorColumn?: string | null
): Promise<TimeseriesData> {
  const params = new URLSearchParams({
    start,
    end,
    width: String(width),
    columns: traceColumns.join(','),
  });
  if (colorColumn) params.set('color_column', colorColumn);

  debugLogOnce('fetchTimeseriesData-request', 'fetchTimeseriesData request', { start, end, width, xAxisColumn, traceColumns });

  const res = await fetchArrow(`/api/data?${params.toString()}`, signal);
  if (!res.ok) throw new Error(`fetchTimeseriesData failed: ${res.status}`);

  const buffer = await res.arrayBuffer();
  const table = tableFromIPC(buffer);

  debugLogOnce('fetchTimeseriesData-columns', 'table columns', { actualColumns: table.schema.fields.map(f => f.name), xAxisColumn, traceColumns });

  const xCol = table.getChild(xAxisColumn);
  debugLogOnce('fetchTimeseriesData-xCol', 'xCol from table', {
    xAxisColumn,
    xColFound: xCol !== null,
    xColType: xCol ? xCol.type : 'null',
    xColNullCount: xCol ? xCol.nullCount : 'N/A',
  });

  if (!xCol) {
    debugLog('fetchTimeseriesData xCol is null - checking available columns:', table.schema.fields.map(f => f.name));
  }

  const rawXValues = xCol ? Array.from(xCol) : [];
  debugLogOnce('fetchTimeseriesData-rawX', 'raw x values before toEpochMs', {
    xAxisColumn,
    rawLen: rawXValues.length,
    rawSample: rawXValues.slice(0, 3),
    rawTypes: rawXValues.slice(0, 3).map(v => typeof v),
  });

  const xValues = Float64Array.from(
    rawXValues,
    v => toEpochMs(v)
  );

  debugLogOnce('fetchTimeseriesData-xValues', 'xValues after toEpochMs', {
    xValuesLen: xValues.length,
    xValuesSample: Array.from(xValues.slice(0, 3)),
    xValuesHasNaN: Array.from(xValues.slice(0, 100)).some(v => !Number.isFinite(v)),
    xValuesAllNaN: Array.from(xValues).every(v => !Number.isFinite(v)),
  });

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

  _cache.xValues = xValues;
  _cache.series = series;

  return {
    xValues,
    series,
    returnedRows: table.numRows,
    downsampled: res.headers.get('x-edatime-downsampled') === '1',
    colorByColumn,
  };
}

/**
 * Fetch scatter points data from Arrow IPC endpoint.
 * 
 * Backend returns:
 * - Arrow IPC binary with columns: [x, y, color] (or [x, y, color_label] for categorical)
 * - Headers: x-edatime-scatter-total, x-edatime-scatter-returned, 
 *            x-edatime-color-min, x-edatime-color-max, x-edatime-scatter-color (kind)
 */
export async function fetchScatterData(
  xCol: string,
  yCol: string,
  limit: number,
  colorCol?: string | null,
  sizeCol?: string | null,
  options?: {
    start?: number;
    end?: number;
    filters?: Array<{ column: string; min: number; max: number }>;
    line_filters?: Array<{ column: string; op: string; value: number }>;
  },
  signal?: AbortSignal
): Promise<ScatterDataResult> {
  const payload: Record<string, unknown> = {
    x: xCol,
    y: yCol,
    limit,
  };
  if (colorCol) payload.color = colorCol;
  if (sizeCol) payload.size = sizeCol;
  if (options?.start != null && options?.end != null) {
    payload.start = options.start;
    payload.end = options.end;
  }
  if (Array.isArray(options?.filters) && options.filters.length > 0) {
    payload.filters = JSON.stringify(options.filters);
  }
  if (Array.isArray(options?.line_filters) && options.line_filters.length > 0) {
    payload.line_filters = JSON.stringify(options.line_filters);
  }

  const url = '/api/scatter/points';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`fetchScatterData failed: ${res.status}`);

  // Extract metadata from headers BEFORE consuming body
  const scatterTotal = parseInt(res.headers.get('x-edatime-scatter-total') ?? '0', 10);
  const scatterReturned = parseInt(res.headers.get('x-edatime-scatter-returned') ?? '0', 10);
  const colorMin = res.headers.get('x-edatime-color-min');
  const colorMax = res.headers.get('x-edatime-color-max');
  const colorKind = res.headers.get('x-edatime-scatter-color-kind') as 'continuous' | 'categorical' | null;

  // Parse Arrow IPC body
  const buffer = await res.arrayBuffer();
  const table = tableFromIPC(buffer);

  const numRows = table.numRows;
  const columns = table.schema.fields.map(f => f.name);

  // Extract columns from Arrow table
  // Backend sends: [x, y, color_value_or_label]
  const xColumn = table.getChild(xCol);
  const yColumn = table.getChild(yCol);

  if (!xColumn || !yColumn) {
    throw new Error(`Missing x/y column in scatter response: ${columns.join(', ')}`);
  }

  // Extract color column if present
  let colorValues: number[] | null = null;
  let colorLabels: (string | null)[] | null = null;

  if (colorCol) {
    const colorColumn = table.getChild(colorCol);
    if (colorColumn) {
      if (colorKind === 'categorical') {
        // Categorical: extract as string labels
        colorLabels = Array.from(colorColumn).map(v => v == null ? null : String(v));
        colorValues = null;
      } else {
        // Continuous: extract as numbers
        colorValues = Array.from(colorColumn).map(v => {
          const n = Number(v);
          return Number.isFinite(n) ? n : NaN;
        });
        colorLabels = null;
      }
    }
  }

  // Extract x/y points as [number, number][] tuples
  const points: [number, number][] = [];
  const xData = Array.from(xColumn);
  const yData = Array.from(yColumn);
  for (let i = 0; i < Math.min(xData.length, yData.length); i++) {
    const x = Number(xData[i]);
    const y = Number(yData[i]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push([x, y]);
    }
  }

  // Extract size column if present
  let sizeValues: number[] | null = null;
  if (sizeCol) {
    const sizeColumn = table.getChild(sizeCol);
    if (sizeColumn) {
      sizeValues = Array.from(sizeColumn).map(v => {
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      });
    }
  }

  return {
    points,
    colorValues,
    colorLabels,
    colorMin: colorMin != null ? parseFloat(colorMin) : null,
    colorMax: colorMax != null ? parseFloat(colorMax) : null,
    colorKind: colorKind ?? null,
    sizeValues,
    sizeMin: sizeValues && sizeValues.length > 0 ? Math.min(...sizeValues.filter(Number.isFinite)) : null,
    sizeMax: sizeValues && sizeValues.length > 0 ? Math.max(...sizeValues.filter(Number.isFinite)) : null,
    totalPoints: scatterTotal,
    returnedPoints: scatterReturned,
  };
}

export function updateCachedColors(colors: Record<string, string>): any[] | null {
  console.debug('[updateCachedColors] cache:', { hasX: !!_cache.xValues, hasSeries: !!_cache.series });
  if (!_cache.xValues || !_cache.series) {
    console.debug('[updateCachedColors] cache MISS - returning null');
    return null;
  }
  const seriesConfig = buildSeriesConfig(_cache.xValues, _cache.series, colors);
  console.debug('[updateCachedColors] result:', seriesConfig ? `${seriesConfig.length} series` : 'null');
  return seriesConfig;
}

export function getCachedData(): { xValues: Float64Array; series: Record<string, Float64Array> } | null {
  if (!_cache.xValues || !_cache.series) return null;
  return { xValues: _cache.xValues, series: _cache.series };
}

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
  const hi = Math.min(palette.length - 1, lo + 1);
  const w = scaled - lo;
  return palette[lo] as string;
}

function colorForScaleValue(rawValue: unknown, scaleInfo: ColorScaleInfo, scaleName: ColorScaleName = 'viridis'): string | null {
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

export interface ColorizedResult {
  series: any[];
  annotations: any[];
}

export function buildColorizedSeries(
  colName: string,
  points: [number, number][],
  colorValues: unknown[],
  scaleInfo: ColorScaleInfo,
  visible: boolean,
  showMarkers: boolean,
  scaleName: ColorScaleName = 'viridis'
): ColorizedResult {
  const result: any[] = [];
  const annotations: any[] = [];
  if (!Array.isArray(points) || points.length === 0 || !Array.isArray(colorValues) || !scaleInfo) {
    return { series: result, annotations };
  }

  if (points.length === 1) {
    const pointColor = colorForScaleValue(colorValues[0], scaleInfo, scaleName) || '#888888';
    result.push({ type: 'line', name: colName, color: pointColor, visible, data: [points[0], points[0]] });
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
        type: 'line',
        name: segIdx === 0 ? colName : `__color_seg__${colName}::${segIdx}`,
        color,
        visible,
        showInLegend: false,
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
        type: 'line',
        name: segIdx === 0 ? colName : `__color_seg__${colName}::${segIdx}`,
        color,
        visible,
        showInLegend: false,
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

export function buildSeriesConfig(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  colors: Record<string, string>,
  filters?: ColumnFilters,
  colorByColumn?: Record<string, Float64Array> | null,
  colorColumn?: string | null,
  showMarkers: boolean = false,
  scaleName: ColorScaleName = 'viridis',
  adaptiveFilters?: AdaptiveLineFilter[]
): any[] {
  debugLogOnce('buildSeriesConfig-input', 'buildSeriesConfig called', {
    xValuesLen: xValues.length,
    seriesKeys: Object.keys(series),
    filters: filters ? Object.keys(filters) : 'none',
    colorColumn: colorColumn ?? 'none',
    adaptiveFilters: adaptiveFilters?.length ?? 0,
  });

  console.debug('[buildSeriesConfig] START', {
    xValuesLen: xValues.length,
    seriesCount: Object.keys(series).length,
    seriesKeys: Object.keys(series),
    filtersCount: filters ? Object.keys(filters).length : 0,
    colorColumn: colorColumn ?? 'none',
    adaptiveFiltersCount: adaptiveFilters?.length ?? 0,
  });

  let filteredX = xValues;
  let filteredSeries = series;
  if (filters && Object.keys(filters).length > 0 || adaptiveFilters?.length) {
    const result = applyColumnRanges(xValues, series, filters || {}, adaptiveFilters);
    filteredX = result.xValues;
    filteredSeries = result.series;
    console.debug('[buildSeriesConfig] after filter', { filteredXLen: filteredX.length });
  }

  const resultSeries: any[] = [];
  const resultAnnotations: any[] = [];

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

    const wantsColorBy = !!colorColumn && colorByColumn && colorByColumn[colorColumn] && colorByColumn[colorColumn].length === points.length;
    if (wantsColorBy) {
      const colorValues = colorByColumn![colorColumn!];
      const displayedValues = Array.from(colorValues).map((v, i) => {
        if (i < filteredX.length && filteredSeries[colName]) {
          return v;
        }
        return null;
      });

      const sampleForAnalysis = displayedValues.slice(0, Math.min(displayedValues.length, 1000));
      const scaleInfo = analyzeColorValues(sampleForAnalysis);
      if (scaleInfo) {
        const colorized = buildColorizedSeries(colName, points, displayedValues, scaleInfo, true, showMarkers, scaleName);
        resultSeries.push(...colorized.series);
        resultAnnotations.push(...colorized.annotations);
      } else {
        resultSeries.push({
          name: colName,
          type: 'line',
          color: colors[colName] ?? '#5470C6',
          data: points,
        });
      }
    } else {
      resultSeries.push({
        name: colName,
        type: 'line',
        color: colors[colName] ?? '#5470C6',
        data: points,
      });
    }
  }

  console.debug('[buildSeriesConfig] END', {
    resultSeriesCount: resultSeries.length,
    totalAnnotations: resultAnnotations.length,
  });
  if (resultSeries.length > 0) {
    console.debug('[buildSeriesConfig] first series name:', resultSeries[0].name, 'points:', resultSeries[0].data?.length ?? 0);
    if (resultSeries[0].data?.length > 0) {
      console.debug('[buildSeriesConfig] first 3 points:', JSON.stringify(resultSeries[0].data.slice(0, 3)));
    }
  }

  return resultSeries;
}