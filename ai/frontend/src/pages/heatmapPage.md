# ai/frontend/src/pages/heatmapPage.md
> Correlation heatmap page with metric switching, optional clustering, persisted Auto-fit layout, and click-through navigation into Scatter.

## Module-Scoped State
- `heatmapFitToScreen: boolean` — defaults `true` (matrix fills panel on first load).
- `heatmapResizeObserver: ResizeObserver | null` [new in refactor] — replaces the one-shot `resize` listener; observes the container and re-renders only when `heatmapFitToScreen` is active.

## Interface `HeatmapPageDeps`
- `showPage: (pageName: string) => void`

## Functions
- `readHeatmapFitPref(): boolean`
  - Reads from `localStorage`; returns `true` unless explicitly `"0"` (inverted default from previous `"1"`-only logic).
- `writeHeatmapFitPref(value: boolean): void`
  - Persists the Auto-fit toggle to `localStorage`.
- `updateRangeFill(input: HTMLInputElement | null): void`
  - Updates the slider track fill custom property for the heatmap cell-size control.
- `syncHeatmapEmptyState(message: string, visible: boolean, reason = ''): void`
  - Routes empty-state visibility through the shared analysis runtime.
- `buildHeatmapStatus(clusterCount: number | null): string`
  - Formats the status line for the current matrix layout.
- `initHeatmapPage(deps: HeatmapPageDeps): Promise<void>` [deps: [fetchCorrelationMatrix][1], [createAnalysisPageRuntime][2], [initHeatmapHelp][3]]
  - Boots heatmap controls, reloads matrices by metric, toggles clustering and Auto-fit, and renders click-through cells that forward X/Y to the Scatter page. Uses `ResizeObserver` to re-fit on container resize. Also wires the page-level `?` help button via `initHeatmapHelp`.

---
[1]: ../services/api/analytics.md#fetchCorrelationMatrix
[2]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
[3]: ./heatmapHelp.md#initHeatmapHelp
