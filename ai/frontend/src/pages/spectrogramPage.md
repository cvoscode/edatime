# spectrogramPage.ts
> Spectrogram visualization page — refactored to use `createAnalysisPageRuntime` for empty-state and export wiring.

## Interface: SpectrogramPageDeps
- `setLoading(btnId: string, overlayId: string, loading: boolean, label?: string): void`

## State
- `spectrogramChart: any`
- `spectrogramResizeObserver: ResizeObserver | null`
- `spectrogramResult: SpectrogramResult | null`
- `spectrogramSampleCount: number`
- `spectrogramRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`

## Functions
- `syncSpectrogramEmptyState(message?: string): void`
  - Updates empty state via `spectrogramRuntime?.updateEmptyState`.
- `formatSpectrogramTime(timestampMs: number): string`
- `formatSpectrogramFrequency(frequency: number): string`
- `export async initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void>`
  - Uses `createAnalysisPageRuntime` pattern; wires spectrogram chart init, resize observer, selection box, column select, window size, log scale, and export buttons.

---
[1]: ./shared/analysisPageRuntime.md
[2]: ../utils/bindExportButtons.md
[3]: ../store/appStateCompat.md
