# ai/frontend/src/scatter/rendering.md
> Builds scatter series/options, keeps the stats/colorbar/marginals in sync, and owns scatter box-zoom/view updates.

## Functions
- `buildNormalScatterSeries(points: [number, number][], controls: ScatterControls): any[]`
- `scatterTooltipFormatterFactory(controls: ScatterControls): (params: any) => string`
- `updateColorbarUI(): void`
  - Refreshes the colorbar UI from scatter state, including backend color-cardinality bucketing.
- `setCorrelationOverlayText(pearson?: number | null, spearman?: number | null): void`
  - Compatibility seam for the old correlation overlay.
- `updateMarginalPlots(): void`
  - Re-renders histogram/KDE/boxplot diagonals and density-mode marginals for the current view.
- `buildOption(points: [number, number][], container: HTMLElement | null): any`
- `renderCurrentOption(): void`
- `applyView(nextView: ScatterView, pushHistory = false): void`
- `resetView(clearHistory = true): void`
- `updateBinnedReadout(): void`
- `updateCorrelationStats(): void`
  - Writes both Pearson and Spearman values from `appState.scatter.currentPairStats`, falling back to the active correlation map when needed.
- `initSelectionZoom(container: HTMLElement): void`
  - Wires scatter box zoom and density-mode 2D drag validation.
- `syncModeUI(): void`
  - Toggles single-plot vs matrix UI groups and refreshes toolbar overflow.

## Re-exports from `./export.js`
- `buildLinearTicks`
- `getScatterExportViewport`
- `drawScatterSeriesToCanvas`
- `renderScatterExportToCanvas`
- `buildVisibleScatterRows`
- `exportScatterData`
- `exportScatterPNG`
- `exportScatterSVG`
- `exportScatterHTML`
- `exportScatterParquet`

---
[1]: ../types.md#ScatterView
[2]: ./state.md#ScatterControls
