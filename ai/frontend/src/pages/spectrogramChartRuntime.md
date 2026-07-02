# ai/frontend/src/pages/spectrogramChartRuntime.md
> Spectrogram page runtime: deferred ECharts init, cached grid/point transforms, drag-to-zoom, colorbar filtering, and empty-state/error handling.

## Interface `SpectrogramPageDeps`
- `setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void`

## Functions
- `__resetSpectrogramChartRuntimeForTests(): void`
  - Disposes the chart and clears module-scoped spectrogram runtime state between tests.
- `createSpectrogramChartRuntime(deps: SpectrogramPageDeps)`
  - Returns the spectrogram analysis-page runtime. Its compute path forwards `window_size`, derived `hop_size`, `normalize`, `clip`, `clip_param`, and a larger `max_points` budget to `fetchSpectrogram`, then reuses cached typed-array transforms across later rerenders.
