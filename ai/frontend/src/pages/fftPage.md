# fftPage.ts
> FFT analysis page — refactored to use `createAnalysisPageRuntime` and `renderSeriesChipList`.

## Interface: FftPageDeps
- `renderTimeseries(): void`

## State
- `fftTraces: FftTrace[]`
- `fftMode: string` (default: `'magnitude'`)
- `fftLogScale: boolean` (default: `true`)
- `fftChart: FftChart | null`
- `fftTraceColors: Record<string, string>`
- `fftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`

## Functions
- `fftColumns(): string[]`
  - Returns numeric columns from metadata via `getAnalyticsChipColor`.
- `fftColorFor(column: string, fallbackIndex: number): string`
- `updateZoomButton(isZoomed?: boolean): void`
  - Shows/hides zoom reset button.
- `rerenderOrClear(): void`
  - Calls `fftRuntime?.updateEmptyState` and updates or clears FFT chart.
- `fetchAndAddTrace(column: string): Promise<void>`
  - Fetches FFT data for column and appends to `fftTraces`.
- `renderChips(): void`
  - Uses `renderSeriesChipList` for chip rendering.
- `export async initFftPage(deps: FftPageDeps): Promise<void>`
  - Uses `createAnalysisPageRuntime`; wires chips, chart, zoom button, and export buttons.

---
[1]: ./shared/analysisPageRuntime.md
[2]: ../utils/bindExportButtons.md
[3]: ../ui/composites/SeriesChip.md
[4]: ../ui/index.md#renderSeriesChipList
[5]: ../store/appStateCompat.md
