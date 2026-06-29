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
- `spectrogramRenderError: string | null` — sticky fetch/render failure message used by the empty state and toast path

## Functions
- `formatSpectrogramTime(timestampMs: number): string` — formats as locale datetime string
- `formatSpectrogramFrequency(frequency: number): string` — formats in Hz/kHz/mHz based on magnitude
- `createSpectrogramChartRuntime(deps: SpectrogramPageDeps)` [deps: [fetchSpectrogram][1], [createAnalysisPageRuntime][2], [exportEChartsPNG][3], [exportEChartsSVG][4], [exportEChartsHTML][5]]
  - Returns runtime with `mount()`: sets up chart creation, resize handling, column-select hydration, drag-to-zoom selection box, log-scale re-render, and export bindings. The Compute path now forwards `window_size`, derived `hop_size` (default 50% overlap), `normalize`, `clip`, and `clip_param` to `fetchSpectrogram`, uses a larger `max_points` cap (`131072`), and makes failures visible through both the empty state and a 6s toast instead of failing silently.
- `renderSpectrogramChart(): Promise<void>` — lazily initializes ECharts once the container has non-zero dimensions, reuses cached typed-array grid data across log-scale flips, renders a single `visualMap` color legend, and restores the empty-state placeholder if chart init/render fails.
- `syncSpectrogramEmptyState(message?: string): void` — updates the shared analysis-page empty state. When `spectrogramRenderError` is set, it switches the reason to `render-error` and shows a concrete failure message.
- `ensureSpectrogramChart(): Promise<EChartLike>` — waits until the chart container is measurable, creates the ECharts instance, attaches a resize observer, and installs the drag-selection overlay plus dblclick zoom reset.
- `waitForSpectrogramChartReady(attempts?: number): Promise<boolean>` — polls until the chart container is visible and has dimensions suitable for ECharts init.

---
[1]: ../../services/api/analytics.md#fetchSpectrogram
[2]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
[3]: ../../utils/chartExport.md#exportEChartsPNG
[4]: ../../utils/chartExport.md#exportEChartsSVG
[5]: ../../utils/chartExport.md#exportEChartsHTML
