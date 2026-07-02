# ai/frontend/src/store/chartState.md
> Timeseries chart instance, viewport history, chart text, and persisted Y-range display preferences.

## Interface `ChartState`
- `chart: ChartInstance | null`
- `currentStart: number | null`
- `currentEnd: number | null`
- `initialView: ViewSnapshot | null`
- `zoomHistory: ViewSnapshot[]`
- `chartText: { title: string; xLabel: string; yLabel: string }`
- `stackFromZero: boolean`

## Exports
- `chartState: ChartState`
  - Module-scoped singleton backing the timeseries chart toolbar and zoom flow.
- `initChartStatePrefs(): void`
  - Hydrates `stackFromZero` from `localStorage`.
- `setChartInstance(chart: ChartInstance | null): void`
  - Replaces the active chart instance.
- `setViewport(start: number | null, end: number | null): void`
  - Updates the current linked time range.
- `pushZoomHistory(entry: ViewSnapshot): void`
  - Appends one zoom snapshot.
- `clearZoomHistory(): void`
  - Clears the zoom history array.
- `setInitialView(view: ViewSnapshot | null): void`
  - Replaces the stored initial viewport.
- `setZoomHistory(history: ViewSnapshot[]): void`
  - Replaces the full zoom history array.
- `setChartText(text: ChartState['chartText']): void`
  - Replaces chart title and axis labels.
- `setStackFromZero(on: boolean): void`
  - Persists and emits the Y-axis baseline toggle.
