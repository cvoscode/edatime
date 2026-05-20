/**
 * ScatterChart — thin wrapper that bridges scatter domain state to ScatterChartView.
 *
 * Color-by-column reliability fixes:
 * 1. Numeric color: 64-bin bucketing with gradient colors. NaN/Infinity are
 *    skipped and do not appear in any bin.
 * 2. Categorical color: groups by normalized label, discrete palette colors.
 *    "Missing" labels get a neutral fallback color.
 * 3. Size column: symbol size scaled 2–20 px based on normalized value.
 */
import { Component, createMemo } from 'solid-js';
import { scatterStore } from '../../../stores/scatterStore';
import { uiStore } from '../../../stores/uiStore';
import {
  buildCategoricalColorGroups,
  getColorPalette,
  sampleGradient,
} from '../../../utils/colorScale';

interface ScatterChartProps {
  xAxisLabel?: string;
  yAxisLabel?: string;
  chartTitle?: string;
  renderMode?: 'scatter' | 'density';
  binSize?: number;
  densityNormalization?: 'linear' | 'sqrt' | 'log';
  onReady?: (updateFn: (options: any) => void) => void;
  onEngineReady?: (engineName: string) => void;
  onEngineChanged?: (engineName: string) => void;
  onZoom?: (start: number, end: number) => void;
}

const SIZE_MIN = 2;
const SIZE_MAX = 20;
const FALLBACK_COLOR = '#888888';

/** Normalize a categorical label for grouping */
function normLabel(label: unknown): string {
  if (label == null) return 'Missing';
  const t = String(label).trim();
  return t || 'Missing';
}

export const ScatterChart: Component<ScatterChartProps> = (props) => {
  const config = createMemo(() => scatterStore.state.config);
  const points = createMemo(() => scatterStore.state.scatterPoints);
  const colorVals = createMemo(() => scatterStore.state.colorValues);
  const colorLabels = createMemo(() => scatterStore.state.colorLabels);
  const colorMin = createMemo(() => scatterStore.state.colorMin);
  const colorMax = createMemo(() => scatterStore.state.colorMax);
  const sizeVals = createMemo(() => scatterStore.state.sizeValues);
  const sizeMin = createMemo(() => scatterStore.state.sizeMin);
  const sizeMax = createMemo(() => scatterStore.state.sizeMax);
  const renderMode = createMemo(() => props.renderMode ?? config().renderMode ?? 'scatter');
  const colorCol = createMemo(() => config().colorCol);
  const sizeCol = createMemo(() => config().sizeCol);
  const xCol = createMemo(() => config().xCol);
  const yCol = createMemo(() => config().yCol);

  const symbolSize = createMemo((): number | ((pt: number[]) => number) => {
    const sc = sizeCol();
    const sv = sizeVals();
    const sMn = sizeMin();
    const sMx = sizeMax();
    if (!sc || !sv || sMn === null || sMx === null) return 4;
    return (pt: number[]) => {
      const idx = colorVals() && colorVals()!.length > 0 ? 3 : 2;
      const v = pt[idx];
      if (typeof v !== 'number' || !Number.isFinite(v)) return SIZE_MIN;
      const span = (sMx - sMn) || 1;
      const t = Math.max(0, Math.min(1, (v - sMn) / span));
      return SIZE_MIN + t * (SIZE_MAX - SIZE_MIN);
    };
  });

  const series = createMemo(() => {
    const pts = points();
    const cv = colorVals();
    const cl = colorLabels();
    const cc = colorCol();
    const sc = sizeCol();
    const mode = renderMode();
    const isDensity = mode === 'density';
    const len = pts.length;

    if (isDensity || (!cc && !sc) || (!cv && !cl && !sizeVals())) {
      return [{
        type: 'scatter' as const,
        name: `${xCol()} vs ${yCol()}`,
        data: pts,
        symbolSize: symbolSize(),
      }];
    }

    if (cl) {
      const catGroups = buildCategoricalColorGroups(cl);
      if (catGroups) {
        return catGroups.categories
          .map((label) => {
            const data: number[][] = [];
            for (let i = 0; i < len; i++) {
              const lbl = cl[i];
              if (normLabel(lbl) !== label) continue;
              data.push(
                sizeVals()
                  ? [pts[i][0], pts[i][1], sizeVals()![i]]
                  : [pts[i][0], pts[i][1]]
              );
            }
            return {
              type: 'scatter' as const,
              name: label,
              data,
              symbolSize: symbolSize(),
              color: catGroups.colorByLabel.get(label) ?? FALLBACK_COLOR,
            };
          })
          .filter((s: any) => s.data.length > 0);
      }
    }

    if (cv && cv.length > 0) {
      const cMin = colorMin() ?? 0;
      const cMax = colorMax() ?? 1;
      const span = cMax - cMin || 1;
      const bins = 64;
      const palette = getColorPalette(uiStore.state.colorScale, bins);
      const grouped: number[][][] = Array.from({ length: bins }, () => []);

      for (let i = 0; i < len; i++) {
        const cVal = cv[i];
        if (typeof cVal !== 'number' || !Number.isFinite(cVal)) continue;
        let b = Math.floor(((cVal - cMin) / span) * bins);
        b = Math.max(0, Math.min(bins - 1, b));
        grouped[b].push(
          sizeVals()
            ? [pts[i][0], pts[i][1], sizeVals()![i]]
            : [pts[i][0], pts[i][1]]
        );
      }

      return grouped
        .map((data, b) => {
          if (data.length === 0) return null;
          return {
            type: 'scatter' as const,
            name: `bin-${b}`,
            data,
            symbolSize: symbolSize(),
            color: sampleGradient(palette, (b + 0.5) / bins),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
    }

    return [{
      type: 'scatter' as const,
      name: `${xCol()} vs ${yCol()}`,
      data: pts,
      symbolSize: symbolSize(),
      color: FALLBACK_COLOR,
    }];
  });

  const handleReady = (updateFn: (options: any) => void) => {
    updateFn({ series: series() });
    props.onReady?.(updateFn);
  };

  // ScatterChart doesn't render directly - it acts as a data bridge
  // The parent ScatterPage receives handleReady and uses the series data
  return null;
};

export default ScatterChart;
