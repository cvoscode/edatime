# ai/frontend/src/pages/heatmapPage.md
> Correlation heatmap page with metric switching, optional clustering, persisted Auto-fit layout, and click-through navigation into Scatter.

## Interface `HeatmapPageDeps`
- `showPage: (pageName: string) => void`

## Functions
- `readHeatmapFitPref(): boolean`
  - Reads the persisted Auto-fit toggle from `localStorage`.
- `writeHeatmapFitPref(value: boolean): void`
  - Persists the Auto-fit toggle to `localStorage`.
- `updateRangeFill(input: HTMLInputElement | null): void`
  - Updates the slider track fill custom property for the heatmap cell-size control.
- `syncHeatmapEmptyState(message: string, visible: boolean, reason = ''): void`
  - Routes empty-state visibility through the shared analysis runtime.
- `buildHeatmapStatus(clusterCount: number | null): string`
  - Formats the status line for the current matrix layout.
- `initHeatmapPage(deps: HeatmapPageDeps): Promise<void>` [deps: [fetchCorrelationMatrix][1], [createAnalysisPageRuntime][2]]
  - Boots heatmap controls, reloads matrices by metric, toggles clustering and Auto-fit, and renders click-through cells that forward X/Y to the Scatter page.

---
[1]: ../services/api/analytics.md#fetchCorrelationMatrix
[2]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
