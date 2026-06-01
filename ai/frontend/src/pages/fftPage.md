# ai/frontend/src/pages/fftPage.md
> Owns the FFT analysis page, including trace fetch/render state, shared analysis-shell wiring, deferred exports, and optional spectral-filter preview flow.

## Interface: FftPageDeps
- `renderTimeseries: () => void`

## State
- `fftTraces: FftTrace[]`
- `fftMode: string`
- `fftLogScale: boolean`
- `fftChart: FftChart | null`
- `fftTraceColors: Record<string, string>`
- `fftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`
- `fftPageCleanup: (() => void) | null`

## Functions
- `resetFftPageState(): void`
  - Clears FFT runtime state and teardown hooks.
- `__resetFftPageForTests(): void`
  - Test-only wrapper around the FFT state reset.
- `fftColumns(): string[]` [deps: [getNumericColumns][1]]
  - Returns the numeric dataset columns available for FFT.
- `fftColorFor(column: string, fallbackIndex: number): string` [deps: [getAnalyticsChipColor][1]]
  - Resolves a trace color from overrides or the analytics palette.
- `updateZoomButton(isZoomed?: boolean): void`
  - Shows or hides the FFT zoom-reset button.
- `syncFftEmptyState(): void`
  - Synchronizes the FFT empty-state model and DOM visibility with current trace selection.
- `rerenderOrClear(): void`
  - Clears the chart when no traces are active or rerenders it with the current FFT mode.
- `fetchAndAddTrace(column: string): Promise<void>` [deps: [fetchFft][2]]
  - Fetches FFT data for one column and merges it into the active trace set.
- `renderChips(): void` [deps: [renderSeriesChipList][3]]
  - Renders FFT trace chips with preserved transient loading state and shared color plumbing.
- `initFftPage(deps: FftPageDeps): Promise<void>` [deps: [createAnalysisPageRuntime][4], [fetchSpectralFilter][2]]
  - Initializes the FFT page shell, chart, controls, exports, and spectral-filter preview interactions.

---
[1]: ./analyticsPageUtils.md
[2]: ../services/api/analytics.md
[3]: ../ui/seriesChipList.md#renderSeriesChipList
[4]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
