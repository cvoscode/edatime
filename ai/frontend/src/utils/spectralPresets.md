# ai/frontend/src/utils/spectralPresets.md

> Spectral analysis presets and guidance for FFT/spectrogram analysis, with human-readable descriptions and window size recommendations.

## Interface: SpectralPreset
```typescript
interface SpectralPreset {
    id: string;
    name: string;
    description: string;
    windowSize: number;
    frequencyFocus: 'low' | 'mid' | 'high' | 'auto';
}
```

## Constants
- `SPECTRAL_PRESETS: SpectralPreset[]` — five presets: auto, slow-trends, fast-oscillations, balanced, high-resolution.
- `SPECTRAL_GUIDANCE: Record<string, { title: string; description: string }>` — guidance entries for Nyquist, sampling rate, window size trade-off, dominant frequency, and DC component.

## Interface: FrequencyPeak
```typescript
interface FrequencyPeak {
    frequency_hz: number;
    magnitude: number;
    power: number;
    rank: number;
}
```

## Interface: SpectralInfo
```typescript
interface SpectralInfo {
    sampleRateHz: number;
    nyquistHz: number;
    dominantPeaks: FrequencyPeak[];
    sampleCount: number;
}
```

## Functions
- `getPresetById(id: string): SpectralPreset | undefined`
  - Returns the spectral preset matching the given id.
- `pickFrequencyUnit(hz: number): FrequencyUnit`
  - Picks a human-readable unit for frequency labels.
- `pickFrequencyAxisUnit(hz: number): FrequencyUnit`
  - Picks the axis unit for spectral plots.
- `frequencyUnitScale(unit: FrequencyUnit): number`
  - Returns the multiplier needed to render a value in the given unit.
- `formatFrequencyInUnit(hz: number, unit: FrequencyUnit, fractionDigits = 2): string`
  - Formats a frequency using a fixed unit.
- `formatFrequency(hz: number): string`
  - Formats a frequency using the best-fit unit.
- `frequencyToPeriod(hz: number): string`
  - Formats the reciprocal period for a frequency.
