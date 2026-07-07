# ai/frontend/src/chart/FftChart.md
> ChartGPU adapter for FFT / PSD rendering, zoomable frequency axes, and peak overlays.

## Interface `FftTrace`
- `column: string`
- `frequencies: number[]`
- `magnitudes: number[]`
- `psd: number[]`
- `color?: string`
- `sample_rate_hz?: number`
- `nyquist_hz?: number`
- `dominant_peaks?: FrequencyPeak[]`

## Class `FftChart`
- `constructor(containerId: string)`
- `init(): Promise<void>`
- `updateData(traces: FftTrace[], mode: string, logScale: boolean): void`
  - Renders magnitude or PSD traces and switches the X-axis label/tick formatter between unit-scaled Hertz and cycles/day for very low frequencies.
- `setView(xMin: number, xMax: number): void`
- `resetView(): void`
- `clear(): void`
- `setShowPeakLabels(show: boolean): void`
- `getSpectralInfo(): { sampleRateHz: number; nyquistHz: number; peaks: FrequencyPeak[] }`
- `destroy(): void`
- Private helpers now include `_formatXAxisTick(hz: number, fractionDigits: number): string` and `_xAxisLabel(): string` to support the cycles/day axis mode.
