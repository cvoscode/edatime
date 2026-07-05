# ai/frontend/src/pages/fftPage.md
> FFT analysis page runtime: persisted trace selection, first-visit seeding, readable spectral metadata, exports, and optional spectral-filter preview.

## Interface `FftPageDeps`
- `renderTimeseries: () => void`

## Functions
- `__resetFftPageForTests(): void`
  - Clears module-scoped FFT page state between tests.
- `loadStoredFftSelection(): string[] | null`
  - Reads the persisted selected FFT columns from `localStorage`.
- `persistFftSelection(): void`
  - Writes the current FFT trace selection to `localStorage`.
- `syncFftEmptyState(): void`
  - Keeps the shared empty state hidden while traces are selected or loading.
- `syncFftSpectralInfo(): void`
  - Mirrors `sample_rate_hz`, `nyquist_hz`, and dominant peaks from the first loaded trace into the live info panel using a shared frequency-unit picker and period labels.
- `ensureFftChartReady(): Promise<void>`
  - Initializes `FftChart` and falls back to `EchartsLineChart` on renderer failure.
- `fetchAndAddTrace(column: string): Promise<void>` [deps: [fetchFft][1]]
  - Fetches one FFT trace and merges it into `fftTraces`.
- `seedInitialFftSelection(): Promise<void>`
  - Loads the stored trace selection or, on first visit, fetches the first two numeric columns.
- `renderChips(): void` [deps: [renderSeriesChipList][2]]
  - Renders FFT trace chips with preserved loading state and shared color updates.
- `initFftPage(deps: FftPageDeps): Promise<void>` [deps: [createAnalysisPageRuntime][3], [fetchSpectralFilter][1]]
  - Boots the FFT page shell, control listeners, exports, chip rail, first-load selection, and spectral-filter preview flow.

---
[1]: ../services/api/analytics.md
[2]: ../ui/seriesChipList.md#renderSeriesChipList
[3]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
