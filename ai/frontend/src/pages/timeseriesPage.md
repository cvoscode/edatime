# pages/timeseriesPage.md

> Assembles the timeseries page controller: data fetching, chart updates, zoom handling, empty states, and analytics integration.

## Functions

- `createTimeseriesPageController(deps: TimeseriesControllerDeps): object`
  - Creates and returns the controller with `emitChartRangeChange`, `fetchAndRender`, `onZoomRangeChange`, and `renderCurrentData`.

## TimeseriesControllerDeps Interface

- `fetchData(startIso: string, endIso: string, width: number, cols: string, colorCol: string | null, signal: AbortSignal): Promise<any>`
- `buildRangeControls(): void`
- `updateAnalysisYRange(min: number, max: number, sourceKind?: string): void`
- `updateAnalysisZoom(start: number, end: number, sourceKind?: string): void`
- `getCurrentView(): any`
- `fetchAndRenderAnalytics(): Promise<void>`

## Controller Methods

- `controller.emitChartRangeChange(sourceKind?: string): void`
  - Dispatches `edatime:chart-range-change` with the current viewport timestamps.
- `controller.fetchAndRender(): Promise<void>`
  - Abort-safe fetch of data, update of `appState.lastFetchedData`, range sync, empty-state management, and chart render.
- `controller.onZoomRangeChange(newStart: number, newEnd: number, sourceKind?: string): void`
  - Updates zoom history, viewport, and chart X range; optionally debounces a refetch.
- `controller.renderCurrentData(): void`
  - Applies column ranges, handles no-selection and no-data empty states, sends `updateDataMulti` to the chart, and updates rolling bands.

---
[1]: ../services/timeseries/filtering.md
[2]: ../store/appStateCompat.md
[3]: ../bootstrap/analyticsOverlay.md
[4]: ../store/index.md
[5]: ../ui/emptyState.md
[6]: ../utils/a11y.md
}
```
