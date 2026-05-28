# spectralPresets.ts

Spectral analysis presets and guidance for FFT/spectrogram analysis.

## Interfaces

```typescript
interface SpectralPreset {
    id: string;
    name: string;
    description: string;
    windowSize: number;
    frequencyFocus: 'low' | 'mid' | 'high' | 'auto';
}
```

```typescript
interface FrequencyPeak {
    frequency_hz: number;
    magnitude: number;
    power: number;
    rank: number;
}
```

```typescript
interface SpectralInfo {
    sampleRateHz: number;
    nyquistHz: number;
    dominantPeaks: FrequencyPeak[];
    sampleCount: number;
}
```

## Constants

```typescript
const SPECTRAL_PRESETS: SpectralPreset[]
```

Preset configurations for spectral analysis.

```typescript
const SPECTRAL_GUIDANCE: Record<string, { title: string; description: string }>
```

Spectral guidance messages and explanations.

## Functions

```typescript
function getPresetById(id: string): SpectralPreset | undefined
```

Get a spectral preset by ID.

```typescript
function formatFrequency(hz: number): string
```

Format frequency for human-readable display.

```typescript
function frequencyToPeriod(hz: number): string
```

Convert frequency to period.

```typescript
function describeFrequency(hz: number, sampleRateHz: number): string
```

Get a human-readable description for a frequency.

```typescript
function checkAliasingWarning(dominantHz: number, nyquistHz: number): string | null
```

Check for potential aliasing concern.

```typescript
function suggestPreset(sampleRateHz: number, dominantPeaks: FrequencyPeak[]): SpectralPreset
```

Suggest an appropriate spectrogram preset based on signal characteristics.