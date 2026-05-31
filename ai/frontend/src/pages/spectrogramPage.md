# ai/frontend/src/pages/spectrogramPage.md
> Time-frequency spectrogram page using ECharts with drag-to-zoom and logarithmic magnitude display.

## Interface
- `SpectrogramPageDeps { setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void }`

## State
- `spectrogramChart: any` — ECharts chart instance
- `spectrogramResizeObserver: ResizeObserver | null`
- `spectrogramResult: SpectrogramResult | null`
- `spectrogramSampleCount: number`
- `spectrogramRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`

## Functions
- `syncSpectrogramEmptyState(message?: string): void` [deps: [createAnalysisPageRuntime][1]]
  - Updates empty state via spectrogramRuntime.
- `formatSpectrogramTime(timestampMs: number): string`
  - Formats timestamp as locale datetime string.
- `formatSpectrogramFrequency(frequency: number): string`
  - Formats frequency in Hz/kHz/mHz based on magnitude.
- `initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void>` [deps: [createAnalysisPageRuntime][1], [exportEChartsPNG][2], [exportEChartsSVG][3], [exportEChartsHTML][4]]
  - Initializes spectrogram page, ECharts chart, drag-to-zoom selection box, and export bindings.

---
[1]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
[2]: ../../utils/chartExport.md#exportEChartsPNG
[3]: ../../utils/chartExport.md#exportEChartsSVG
[4]: ../../utils/chartExport.md#exportEChartsHTML
