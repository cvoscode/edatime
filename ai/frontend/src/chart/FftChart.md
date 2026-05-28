# FftChart.ts

FFT/Power Spectral Density visualization chart using ChartGPU adapter with frequency axis, peak labeling, and click-to-annotate functionality.

## Class: FftChart

```typescript
export class FftChart {
  onZoomChange: ((isZoomed: boolean) => void) | null;
  onSpectralInfoUpdate: ((info: { sampleRateHz: number; nyquistHz: number; peaks: FrequencyPeak[] }) => void) | null;

  constructor(containerId: string);
}
```

### Methods

```typescript
async init(): Promise<void>;
updateData(traces: FftTrace[], mode: string, logScale: boolean): void;
setView(xMin: number, xMax: number): void;
resetView(): void;
clear(): void;
setShowPeakLabels(show: boolean): void;
getSpectralInfo(): { sampleRateHz: number; nyquistHz: number; peaks: FrequencyPeak[] };
destroy(): void;
```

## Interfaces

```typescript
export interface FftTrace {
  column: string;
  frequencies: number[];
  magnitudes: number[];
  psd: number[];
  color?: string;
  sample_rate_hz?: number;
  nyquist_hz?: number;
  dominant_peaks?: FrequencyPeak[];
}
```
