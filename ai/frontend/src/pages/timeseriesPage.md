# ai/frontend/src/pages/timeseriesPage.md
> Owns the Timeseries page controller for data fetch/render, empty-state policy, viewport updates, and analytics follow-up after successful renders.

## Interface: TimeseriesControllerDeps
- `fetchData: (startIso: string, endIso: string, width: number, cols: string, colorCol: string | null, signal: AbortSignal) => Promise<any>`
- `buildRangeControls: () => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
- `getCurrentView: () => any`
- `fetchAndRenderAnalytics: () => Promise<void>`

## State
- `timeseriesEmptyStateController: ReturnType<typeof createEmptyStateController> | null`

## Functions
- `getTimeseriesEmptyStateController(): ReturnType<typeof createEmptyStateController>` [deps: [createEmptyStateController][1]]
  - Lazily creates the Timeseries empty-state controller.
- `computeRenderedYDebugSnapshot(): { selectedCols: string[]; globalYMin: number | null; globalYMax: number | null; perSeries: Array<{ name: string; points: number; yMin: number | null; yMax: number | null }> } | null`
  - Builds a debug snapshot of the currently rendered Y-domain data.
- `createTimeseriesPageController(deps: TimeseriesControllerDeps): { emitChartRangeChange(sourceKind?: string): void; renderCurrentData(): void; fetchAndRender(): Promise<void>; onZoomRangeChange(newStart: number, newEnd: number, sourceKind?: string): void }` [deps: [applyColumnRanges][2], [ensureRangeStateFromData][2], [computeFrontendRollingBands][3]]
  - Creates the Timeseries page controller that owns render passes, fetch passes, and zoom-driven range updates.

## Controller Methods
- `emitChartRangeChange(sourceKind?: string): void`
  - Emits the current viewport as `edatime:chart-range-change`.
- `renderCurrentData(): void`
  - Applies column filters, resolves empty-state policy, updates chart data, and refreshes rolling overlays.
- `fetchAndRender(): Promise<void>`
  - Fetches Timeseries data for the active viewport, stores it, rebuilds range UI, and rerenders the chart.
- `onZoomRangeChange(newStart: number, newEnd: number, sourceKind?: string): void`
  - Updates zoom state, viewport state, chart range, and debounced fetch behavior after zoom changes.

---
[1]: ../ui/emptyState.md#createEmptyStateController
[2]: ../services/timeseries/filtering.md
[3]: ../bootstrap/analyticsOverlay.md#computeFrontendRollingBands
