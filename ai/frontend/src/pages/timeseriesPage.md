# ai/frontend/src/pages/timeseriesPage.md
> Owns the timeseries page controller for data fetch/render, empty-state policy, viewport updates, and analytics follow-up after successful renders.

## Interface `TimeseriesControllerDeps`
- `fetchData: (startIso: string, endIso: string, width: number, cols: string, colorCol: string | null, lookaroundMs: number, signal: AbortSignal) => Promise<any>`
- `buildRangeControls: () => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
- `getCurrentView: () => any`
- `fetchAndRenderAnalytics: () => Promise<void>`
- `recoverFromColumnMismatch?: () => Promise<boolean>`

## State
- `timeseriesEmptyStateController: ReturnType<typeof createEmptyStateController> | null`
- `MIN_LOOKAROUND_MS = 60_000`
- `CONSECUTIVE_ZOOM_OUT_RESET_COUNT = 5`
- Per-controller state: `lastKnownView`, `zoomRestoreHistory`, `consecutiveZoomOuts`, `lastFetchedParams`

## Functions
- `getTimeseriesEmptyStateController(): ReturnType<typeof createEmptyStateController>`
- `computeRenderedYDebugSnapshot(): { selectedCols: string[]; globalYMin: number | null; globalYMax: number | null; perSeries: Array<{ name: string; points: number; yMin: number | null; yMax: number | null }> } | null`
- `createTimeseriesPageController(deps: TimeseriesControllerDeps): { emitChartRangeChange(sourceKind?: string): void; renderCurrentData(): void; fetchAndRender(): Promise<void>; onZoomRangeChange(view: ViewSnapshot, sourceKind?: string): void; resetZoom(): void; zoomOut(): void }`

## Controller behavior
- `fetchAndRender(): Promise<void>`
  - Computes a buffered fetch window with `lookaroundMs`, records it as `appState.fetchedWindow`, and short-circuits refetches only when the current viewport remains inside the buffered window for the same selected columns/color column and the buffered data is raw (`_meta.downsampled === false`).
  - If buffered data is already downsampled, the next zoom refetches the visible window so the backend can resample to the viewport target.
  - After fetching or reusing data, rendering clips the buffered data to `appState.currentStart/currentEnd` before applying column/adaptive filters.
- `onZoomRangeChange(view, sourceKind)`
  - Stores the last rendered viewport and data buffer as one restore entry, applies the boxed x/y viewport, and schedules an immediate user zoom refetch.
- `zoomOut()`
  - Pops one restore entry, restores the exact x/y viewport, and reuses the stored buffer immediately only when it is raw and still matches selected columns/color column.
  - Downsampled restore buffers are not rendered as an intermediate view; the controller keeps the pending y restore intact and refetches the restored x window so the previous zoom image is recreated with the same y range.
  - Five consecutive zoom-outs reset to `appState.initialView` (the all-data initial view).
- `resetZoom()`
  - Clears restore history and applies `appState.initialView`, then schedules a refetch.
