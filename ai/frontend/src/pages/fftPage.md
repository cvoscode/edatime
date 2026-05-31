# ai/frontend/src/pages/fftPage.md
> FFT frequency analysis page with magnitude/psd modes, log-scale toggle, and per-series chip controls.

## Interface
- `FftPageDeps { renderTimeseries: () => void }`

## State
- `fftTraces: FftTrace[]` — active FFT trace series
- `fftMode: string` — current display mode ('magnitude' | 'psd')
- `fftLogScale: boolean` — whether logarithmic frequency scale is enabled
- `fftChart: FftChart | null` — the FFT chart instance
- `fftTraceColors: Record<string, string>` — per-column color overrides
- `fftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`

## Functions
- `fftColumns(): string[]` [deps: [getNumericColumns][1]]
  - Returns numeric columns from metadata.
- `fftColorFor(column: string, fallbackIndex: number): string` [deps: [getAnalyticsChipColor][1]]
  - Resolves trace color from overrides or fallback palette.
- `updateZoomButton(isZoomed?: boolean): void`
  - Shows/hides zoom reset button based on chart zoom state.
- `rerenderOrClear(): void`
  - Clears chart when no traces; otherwise updates chart with current mode/log-scale.
- `fetchAndAddTrace(column: string): Promise<void>` [deps: [fetchFft][2]]
  - Fetches FFT data for a column and appends to `fftTraces`.
- `renderChips(): void` [deps: [renderSeriesChipList][3]]
  - Renders series chip list with loading state and toggle handlers.
- `initFftPage(deps: FftPageDeps): Promise<void>` [deps: [createAnalysisPageRuntime][4], [exportContainerCanvasPNG][5], [exportContainerCanvasSVG][6], [exportContainerCanvasHTML][7], [exportTraceCSV][8], [bindExportButtons][9]]
  - Initializes FFT page with `bindExportsOnInit: false`; export buttons are bound after data fetch so `fftTraces` closure captures live state.

---
[1]: ./analyticsPageUtils.md#getNumericColumns
[2]: ../../services/api/index.md#fetchFft
[3]: ../../ui/index.md#renderSeriesChipList
[4]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
[5]: ../../utils/chartExport.md#exportContainerCanvasPNG
[6]: ../../utils/chartExport.md#exportContainerCanvasSVG
[7]: ../../utils/chartExport.md#exportContainerCanvasHTML
[8]: ../../utils/chartExport.md#exportTraceCSV
[9]: ../../utils/bindExportButtons.md#bindExportButtons
