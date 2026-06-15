# ai/frontend/src/pages/spectrogramChartRuntime.md
> Spectrogram chart runtime — ECharts initialization, resize handling, drag-to-zoom selection box, data loading, and empty-state management.

## Interface: SpectrogramPageDeps
```ts
interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}
```

## Module-level State
- `spectrogramChart: any` — ECharts chart instance
- `spectrogramResizeObserver: ResizeObserver | null`
- `spectrogramResult: SpectrogramResult | null`

## Functions
- `formatSpectrogramTime(timestampMs: number): string` — formats as locale datetime string
- `formatSpectrogramFrequency(frequency: number): string` — formats in Hz/kHz/mHz based on magnitude
- `createSpectrogramChartRuntime(deps: SpectrogramPageDeps)` [deps: [fetchSpectrogram][1], [createAnalysisPageRuntime][2], [exportEChartsPNG][3], [exportEChartsSVG][4], [exportEChartsHTML][5]]
  - Returns runtime with `mount()`: sets up chart, resize observer, column select listener, time range change handler, drag-to-zoom selection box (pointer down/move/up/cancel + dblclick reset), and export bindings. The runtime no longer wires a status element (`statusElId` is unset) and does not call `updateStatus`.
- `loadSpectrogramData(start: string, end: string, column: string): Promise<void>` — fetches spectrogram from server and renders heatmap.
- `renderSpectrogramChart(): Promise<void>` — builds ECharts option (log scale toggle, heatmap series, axes, tooltip, zoom) and renders it.
- `syncSpectrogramEmptyState(message?: string): void` — delegates to spectrogramRuntime to update empty state.
- `ensureSpectrogramChart(): Promise<EChartLike>` — lazy chart init; waits for DOM dimensions, creates ECharts instance, resize observer, drag selection overlay.
- `waitForSpectrogramChartReady(attempts?: number): Promise<boolean>` — polls until chart container is visible and sized.

---
[1]: ../../services/api/analytics.md#fetchSpectrogram
[2]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
[3]: ../../utils/chartExport.md#exportEChartsPNG
[4]: ../../utils/chartExport.md#exportEChartsSVG
[5]: ../../utils/chartExport.md#exportEChartsHTML