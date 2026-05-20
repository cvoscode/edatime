/**
 * DistributionCards — histogram / KDE / box plot for selected numeric columns.
 * Shows one card per column using column profiles from datasetStore.
 */
import { Component, createMemo, For, Show } from 'solid-js';
import { scatterStore } from '../../../stores/scatterStore';
import { datasetStore } from '../../../stores/datasetStore';
import styles from '../../../pages/ScatterPage.module.css';

function normalizeLabel(label: unknown): string {
  if (label == null) return 'Missing';
  const text = String(label).trim();
  return text || 'Missing';
}

function buildHistogramBins(min: number, max: number, bins = 20): number[] {
  const step = (max - min) / bins;
  return Array.from({ length: bins + 1 }, (_, i) => min + i * step);
}

function computeStd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeHistogram(values: number[], min: number, max: number, bins = 20): number[] {
  const step = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const idx = Math.floor((v - min) / step);
    const clamped = Math.max(0, Math.min(bins - 1, idx));
    counts[clamped]++;
  }
  return counts;
}

function computeKDE(values: number[], min: number, max: number, nPoints = 50): number[] {
  const bandwidth = 1.06 * computeStd(values) * Math.pow(values.length, -0.2);
  const step = (max - min) / nPoints;
  const density: number[] = [];
  for (let i = 0; i < nPoints; i++) {
    const x = min + (i + 0.5) * step;
    let sum = 0;
    for (const v of values) {
      const u = (x - v) / bandwidth;
      sum += Math.exp(-0.5 * u * u);
    }
    density.push(sum / (values.length * bandwidth * Math.sqrt(2 * Math.PI)));
  }
  return density;
}

function computeBox(values: number[]): { min: number; q1: number; median: number; q3: number; max: number } {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
  const q1Idx = Math.floor(sorted.length * 0.25);
  const medIdx = Math.floor(sorted.length * 0.5);
  const q3Idx = Math.floor(sorted.length * 0.75);
  return {
    min: sorted[0],
    q1: sorted[q1Idx],
    median: sorted[medIdx],
    q3: sorted[q3Idx],
    max: sorted[sorted.length - 1],
  };
}

function std(arr: number[]): number {
  const n = arr.length;
  if (n === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
}

interface DistributionCardProps {
  column: string;
  values: number[];
}

const DistributionCard: Component<DistributionCardProps> = (props) => {
  const { column, values } = props;

  const profile = createMemo(() => {
    const cols = datasetStore.state.columns;
    return cols.find((c) => c.name === column);
  });

  const min = createMemo(() => profile()?.min ?? Math.min(...values));
  const max = createMemo(() => profile()?.max ?? Math.max(...values));

  const histBins = createMemo(() => buildHistogramBins(min(), max()));
  const histCounts = createMemo(() => computeHistogram(values, min(), max()));
  const maxCount = createMemo(() => Math.max(...histCounts(), 1));

  const kdePoints = createMemo(() => computeKDE(values, min(), max()));
  const maxDensity = createMemo(() => Math.max(...kdePoints(), 1e-9));

  const box = createMemo(() => computeBox(values));

  const histPath = createMemo(() => {
    const bins = histBins();
    const counts = histCounts();
    const w = 100 / bins.length;
    let d = `M 0 100`;
    for (let i = 0; i < bins.length; i++) {
      const barH = (counts[i] / maxCount()) * 80;
      d += ` L ${(i / bins.length) * 100} ${100 - barH}`;
      d += ` L ${((i + 1) / bins.length) * 100} ${100 - barH}`;
    }
    d += ` L 100 100 Z`;
    return d;
  });

  const kdePath = createMemo(() => {
    const pts = kdePoints();
    const n = pts.length;
    if (n === 0) return '';
    let d = `M 0 100`;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 100;
      const y = 100 - (pts[i] / maxDensity()) * 80;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    d += ` L 100 100 Z`;
    return d;
  });

  const boxX = createMemo(() => {
    const b = box();
    const rng = max() - min() || 1;
    const toPct = (v: number) => ((v - min()) / rng) * 100;
    return {
      left: toPct(b.q1),
      mid: toPct(b.median),
      right: toPct(b.q3),
      whiskerL: toPct(b.min),
      whiskerR: toPct(b.max),
    };
  });

  return (
    <div class={styles.distCard}>
      <div class={styles.distCardTitle}>{column}</div>
      <svg viewBox="0 0 100 100" class={styles.distSvg} preserveAspectRatio="none">
        <path d={histPath()} fill="#4a9eff" opacity="0.4" />
        <path d={kdePath()} fill="#ff6b6b" opacity="0.6" />
        {/* Box */}
        <line
          x1={boxX().whiskerL}
          y1="50"
          x2={boxX().whiskerR}
          y2="50"
          stroke="#fff"
          stroke-width="0.8"
        />
        <rect
          x={boxX().left}
          y="30"
          width={boxX().right - boxX().left}
          height="40"
          fill="none"
          stroke="#fff"
          stroke-width="0.8"
        />
        <line
          x1={boxX().mid}
          y1="30"
          x2={boxX().mid}
          y2="70"
          stroke="#fff"
          stroke-width="1.5"
        />
        {/* Whiskers */}
        <line x1={boxX().whiskerL} y1="40" x2={boxX().whiskerL} y2="60" stroke="#fff" stroke-width="0.8" />
        <line x1={boxX().whiskerR} y1="40" x2={boxX().whiskerR} y2="60" stroke="#fff" stroke-width="0.8" />
      </svg>
    </div>
  );
};

interface DistributionCardsProps {
  /** Columns to show distribution cards for */
  columns: string[];
  /** Optional: values map keyed by column name (uses scatter color/size values if not provided) */
  valuesByColumn?: Record<string, number[]>;
}

export const DistributionCards: Component<DistributionCardsProps> = (props) => {
  const colorVals = createMemo(() => scatterStore.state.colorValues);
  const colorCol = createMemo(() => scatterStore.state.config.colorCol);
  const sizeVals = createMemo(() => scatterStore.state.sizeValues);
  const sizeCol = createMemo(() => scatterStore.state.config.sizeCol);
  const points = createMemo(() => scatterStore.state.scatterPoints);

  const getValuesForColumn = (colName: string): number[] => {
    if (props.valuesByColumn?.[colName]) return props.valuesByColumn[colName];

    // Extract from scatter points using color/size index
    const pts = points();
    const cv = colorVals();
    const sv = sizeVals();
    const n = pts.length;

    if (colName === colorCol() && cv && cv.length === n) {
      return cv as number[];
    }
    if (colName === sizeCol() && sv && sv.length === n) {
      return sv as number[];
    }
    return [];
  };

  return (
    <div class={styles.distCards}>
      <For each={props.columns}>
        {(col) => {
          const vals = createMemo(() => getValuesForColumn(col));
          return (
            <Show when={vals().length > 0}>
              <DistributionCard column={col} values={vals()} />
            </Show>
          );
        }}
      </For>
    </div>
  );
};