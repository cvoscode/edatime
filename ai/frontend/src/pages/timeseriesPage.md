# ai/frontend/src/pages/timeseriesPage.md
> Owns the timeseries page controller for data fetch/render, empty-state policy, viewport updates, and analytics follow-up after successful renders.

## Interface `TimeseriesControllerDeps`
- `fetchData: (startIso: string, endIso: string, width: number, cols: string, colorCol: string | null, lookaroundMs: number, signal: AbortSignal) => Promise<any>`
- `buildRangeControls: () => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
- `getCurrentView: () => any`
- `fetchAndRenderAnalytics: () => Promise<void>`

## State
- `timeseriesEmptyStateController: ReturnType<typeof createEmptyStateController> | null`
- `lastFetchedParams: string | null`
- `MIN_LOOKAROUND_MS = 60_000`

## Functions
- `getTimeseriesEmptyStateController(): ReturnType<typeof createEmptyStateController>`
- `computeRenderedYDebugSnapshot(): { selectedCols: string[]; globalYMin: number | null; globalYMax: number | null; perSeries: Array<{ name: string; points: number; yMin: number | null; yMax: number | null }> } | null`
- `createTimeseriesPageController(deps: TimeseriesControllerDeps): { emitChartRangeChange(sourceKind?: string): void; renderCurrentData(): void; fetchAndRender(): Promise<void>; onZoomRangeChange(newStart: number, newEnd: number, sourceKind?: string): void }`

## Controller behavior
- `fetchAndRender(): Promise<void>`
  - Computes a buffered fetch window with `lookaroundMs`, records it as `appState.fetchedWindow`, and short-circuits refetches when the current viewport remains inside the buffered window for the same selected columns/color column.
