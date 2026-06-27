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

---
[1]: ./scatter/rendering.md
[2]: ./scatter/state.md
[3]: ./store/scatterState.md
