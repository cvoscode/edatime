# ai/frontend/src/types.md
> Shared TypeScript interfaces consumed by multiple frontend modules. Kept here as the canonical source so consumers stay in sync.

## DensityTooltipMeta
- `colorCenter: number`
- `colorLo: number`
- `colorHi: number`

## DensityTooltipCache
- `key: string`
- `binSize: number`
- `metrics`: `{ plotWidth, plotHeight, devicePixelRatio, plotLeftPx, plotTopPx, plotRightPx, plotBottomPx, exactLeftPx, exactTopPx, exactRightPx, exactBottomPx, binSizePx, binSizeCss, binCountX, binCountY }` — DPR-aware pixel grid plus pre-computed bin counts.
- `binsBySeriesIndex: Map<number, Map<string, number>>`
- `metaBySeriesIndex: Map<number, DensityTooltipMeta>`
- `marginalCountsX: number[] | null` — per-axis marginal density counts derived from `binsBySeriesIndex` for series index 0. Length matches `metrics.binCountX`.
- `marginalCountsY: number[] | null` — same shape as `marginalCountsX`, length matches `metrics.binCountY`.

## ScatterView
- `xMin: number; xMax: number; yMin: number; yMax: number`

## ScatterDrag
- `pointerId: number; startX: number; endX: number; startY: number; endY: number`

## MatrixCellData
- `totalPoints: number`
- `points: [number, number][]`
- `colorValues: number[] | null`
- `colorLabels: unknown[] | null`

## ScatterLineFilterSpec
- `column: string`
- `x1: number; y1: number; x2: number; y2: number`
- `keepAbove: boolean`

## ScatterFetchOptions
- `start?: number`
- `end?: number`
- `filters?: ScatterFilterSpec[]`
- `lineFilters?: ScatterLineFilterSpec[]`

## CorrelationItem
- `column: string; count: number; value: (number | null)` — One correlation entry for a column relative to the base.

## CorrelationSuggestion
- `x: string; y: string; correlation: number` — Base/partner pair with **signed** correlation; thresholding uses `abs(correlation)`.

## ScatterCorrelationsResponse
- `mode: CorrelationMetric (enum)` — PearsonRaw/SpearmanRaw/KendallRaw/PearsonDiff/SpearmanDiff/KendallDiff.
- `base_column: string`
- `threshold: number`
- `numeric_columns: string[]`
- `correlations: CorrelationItem[]` — Sorted by `abs(correlation)` descending.
- `suggestions: CorrelationSuggestion[]` — Pairs whose `|correlation| >= threshold`.
- `top_pairs?: TopPairItem[]` — Globally-ranked strongest pairs across the full matrix (independent of base/threshold). [new in refactor]

## TopPairItem
- `x: string; y: string; correlation: number; count: number` — Signed correlation, globally ranked by `|correlation|` descending. [new in refactor]

## ScatterState
- `selectedXColumn?: string; selectedYColumn?: string; selectedColorColumn?: string`
- `numericCols: string[]`
- `selectedCols: string[]`
- `viewMode: 'single' | 'matrix'`
- `scatterView: ScatterView` — Current scatter view bounds.
- `lineFilters: ScatterLineFilterSpec[]`
- `correlationMode: CorrelationMetric`
- `colorCardinality: ColorCardinality | null` [new in refactor]

## AppStateType (partial)
- `profileFilterCategory?: 'all' | 'numeric' | 'datetime'` — Column profile filter category. [new in refactor]

---
[1]: ./scatter/rendering.md
[2]: ./scatter/state.md
[3]: ./store/scatterState.md
