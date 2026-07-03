# ai/frontend/src/chart/FftChart.md
> ChartGPU adapter for FFT / Power Spectral Density visualisation with numeric frequency axis and peak annotation overlay.

## Constants
- `FFT_GRID: GridLayout = { left: 112, right: 32, top: 52, bottom: 52 }` [top increased from 34]

## Class: FftChart
- `constructor(containerId: string)`
  - Creates the FFT chart bound to a DOM container.
- `async init(): Promise<void>`
  - Initialises the ChartGPU instance and overlay canvas.
- `updateData(traces: FftTrace[], mode: string, logScale: boolean): void`
  - Renders magnitude or PSD traces with log-scaled Y axis; updates spectral info.
- `setView(xMin: number, xMax: number): void`
  - Applies a zoomed frequency range view.
- `resetView(): void`
  - Resets to full frequency range.
- `clear(): void`
  - Clears all traces, annotations, and spectral info.
- `setShowPeakLabels(show: boolean): void`
  - Toggles overlay peak labels.
- `getSpectralInfo(): { sampleRateHz: number; nyquistHz: number; peaks: FrequencyPeak[] }`
  - Returns current spectral metadata.
- `destroy(): void`
  - Disposes the overlay observer and chart.
- `private _formatLogAxisTick(value: number): string` [new in refactor]
  - Formats log-scale Y-axis ticks; converts `10^value` to readable form (exponential notation for `>=1000 || <0.001`, otherwise 2-significant-figure decimal).
- `private _renderPeakLabels(...)` [new in refactor]
  - Draws non-overlapping peak labels with distinct row stacking. Each label gets a dark plate background and a short leader line. Position is side-aware (right-side peaks anchor left, left-side peaks anchor right).

## Interface: FftTrace
- `column: string`
- `frequencies: number[]`
- `magnitudes: number[]`
- `psd: number[]`
- `color?: string`
- `sample_rate_hz?: number`
- `nyquist_hz?: number`
- `dominant_peaks?: FrequencyPeak[]`

---
[1]: ./chartInteractions.md#initBoxZoom
[2]: ./chartInteractions.md#initWheelZoom
[3]: ./chartInteractions.md#createCanvasOverlay
[4]: ../services/timeseries/filtering.md#buildAdaptiveLineY
