# frontend/src/store/chartState.ts
> Viewport and chart instance state.

## Interface `ChartState`
- `chart: ChartInstance | null`
- `currentStart: number | null`
- `currentEnd: number | null`
- `initialView: ViewSnapshot | null`
- `zoomHistory: ViewSnapshot[]`
- `chartText: { title: string; xLabel: string; yLabel: string }`

## Exports
- `chartState: ChartState`
- `setChartInstance(chart: ChartInstance | null): void`
- `setViewport(start: number | null, end: number | null): void`
- `pushZoomHistory(entry: ViewSnapshot): void`
- `clearZoomHistory(): void`
- `setInitialView(view: ViewSnapshot | null): void`
- `setZoomHistory(history: ViewSnapshot[]): void`
- `setChartText(text: ChartState['chartText']): void`