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