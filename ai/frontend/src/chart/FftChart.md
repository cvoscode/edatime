# ai/frontend/src/chart/FftChart.md
> ChartGPU adapter for FFT / Power Spectral Density visualisation with numeric frequency axis and peak annotation overlay.

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
