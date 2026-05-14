export interface SpectralPreset {
  windowSize: number;
  label: string;
}

export const SPECTRAL_PRESETS: SpectralPreset[] = [
  { windowSize: 64, label: '64' },
  { windowSize: 256, label: '256' },
  { windowSize: 512, label: '512' },
  { windowSize: 1024, label: '1024' },
  { windowSize: 2048, label: '2048' },
];

export type FrequencyUnit = 'µHz' | 'mHz' | 'Hz' | 'kHz';

export interface FormattedFrequency {
  value: number;
  unit: FrequencyUnit;
  formatted: string;
}

export function formatFrequency(hz: number): FormattedFrequency {
  if (hz <= 0) {
    return { value: 0, unit: 'Hz', formatted: '0 Hz' };
  }

  const absHz = Math.abs(hz);

  if (absHz < 1e-3) {
    return { value: hz * 1e6, unit: 'µHz', formatted: `${(hz * 1e6).toFixed(2)} µHz` };
  } else if (absHz < 1) {
    return { value: hz * 1e3, unit: 'mHz', formatted: `${(hz * 1e3).toFixed(2)} mHz` };
  } else if (absHz < 1e3) {
    return { value: hz, unit: 'Hz', formatted: `${hz.toFixed(2)} Hz` };
  } else {
    return { value: hz * 1e-3, unit: 'kHz', formatted: `${(hz * 1e-3).toFixed(2)} kHz` };
  }
}

export function frequencyToPeriod(hz: number): number | null {
  if (hz <= 0 || !Number.isFinite(hz)) return null;
  return 1 / hz;
}

export function formatPeriod(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) return '—';

  if (seconds < 1e-3) {
    return `${(seconds * 1e6).toFixed(2)} µs`;
  } else if (seconds < 1) {
    return `${(seconds * 1e3).toFixed(2)} ms`;
  } else if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  } else if (seconds < 3600) {
    return `${(seconds / 60).toFixed(2)} min`;
  } else {
    return `${(seconds / 3600).toFixed(2)} h`;
  }
}

export function detectAliasing(frequency: number, sampleRate: number): boolean {
  return frequency > sampleRate / 2;
}

export function suggestPreset(dominantFreqHz: number): number {
  const minFreqResolution = dominantFreqHz * 0.1;
  const samplesNeeded = sampleRate / minFreqResolution;

  for (const preset of SPECTRAL_PRESETS) {
    if (preset.windowSize >= samplesNeeded) {
      return preset.windowSize;
    }
  }
  return SPECTRAL_PRESETS[SPECTRAL_PRESETS.length - 1].windowSize;
}

export function frequencyToXLabel(unit: FrequencyUnit): string {
  switch (unit) {
    case 'µHz': return 'Frequency (µHz)';
    case 'mHz': return 'Frequency (mHz)';
    case 'Hz': return 'Frequency (Hz)';
    case 'kHz': return 'Frequency (kHz)';
  }
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 10);
}

export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 10 * Math.log10(linear);
}