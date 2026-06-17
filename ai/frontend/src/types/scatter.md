# ai/frontend/src/types/scatter.md
> Re-exports scatter plot and density visualization type definitions.

## Re-exports
- `DensityTooltipCache` [deps: [types.ts][1]] — `metrics` is now a structured object (`{ plotWidth, plotHeight, devicePixelRatio, plotLeftPx, plotTopPx, plotRightPx, plotBottomPx, exactLeftPx, exactTopPx, exactRightPx, exactBottomPx, binSizePx, binSizeCss, binCountX, binCountY }`) replacing the previous loose `{ width, height, grid, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight }`.
- `DensityTooltipMeta` [deps: [types.ts][1]]
- `MatrixCellData` [deps: [types.ts][1]]
- `ScatterDrag` [deps: [types.ts][1]]
- `ScatterFetchOptions` [deps: [types.ts][1]]
- `ScatterFilterSpec` [deps: [types.ts][1]]
- `ScatterLineFilterSpec` [deps: [types.ts][1]]
- `ScatterState` [deps: [types.ts][1]] — adds `lastQueryContextKey: string` (page-change handler short-circuits identical re-entries); `lastSuggestions` is `Array<{ x: string; y: string; correlation: number }>` (was `Array<{ column: string; pearson?: number | null; spearman?: number | null }>`).
- `ScatterView` [deps: [types.ts][1]]

---
[1]: ../../src/types.ts
