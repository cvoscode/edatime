/**
 * Spectral analysis presets and guidance.
 *
 * Provides preset configurations for FFT/spectrogram analysis
 * with human-readable descriptions and appropriate window sizes.
 */

export interface SpectralPreset {
    id: string;
    name: string;
    description: string;
    /** Window size for spectrogram (in samples) */
    windowSize: number;
    /** Frequency range focus: 'low', 'mid', 'high', or 'auto' */
    frequencyFocus: 'low' | 'mid' | 'high' | 'auto';
}

export const SPECTRAL_PRESETS: SpectralPreset[] = [
    {
        id: 'auto',
        name: 'Auto (Detect from data)',
        description: 'Automatically choose window size based on signal characteristics',
        windowSize: 256,
        frequencyFocus: 'auto',
    },
    {
        id: 'slow-trends',
        name: 'Slow Trends',
        description: 'Large window (1024 samples) — best for detecting slow periodic patterns like daily/weekly cycles. Higher frequency resolution, lower time resolution.',
        windowSize: 1024,
        frequencyFocus: 'low',
    },
    {
        id: 'fast-oscillations',
        name: 'Fast Oscillations',
        description: 'Small window (64 samples) — best for detecting rapid changes and high-frequency noise. Higher time resolution, lower frequency resolution.',
        windowSize: 64,
        frequencyFocus: 'high',
    },
    {
        id: 'balanced',
        name: 'Balanced',
        description: 'Medium window (256 samples) — good balance between time and frequency resolution. Suitable for most general analysis.',
        windowSize: 256,
        frequencyFocus: 'mid',
    },
    {
        id: 'high-resolution',
        name: 'High Frequency Resolution',
        description: 'Very large window (2048 samples) — maximum frequency resolution for identifying close frequency components. Best for stationary signals.',
        windowSize: 2048,
        frequencyFocus: 'low',
    },
];

export function getPresetById(id: string): SpectralPreset | undefined {
    return SPECTRAL_PRESETS.find((p) => p.id === id);
}

/**
 * Spectral guidance messages and explanations.
 */
export const SPECTRAL_GUIDANCE = {
    nyquist: {
        title: 'Nyquist Frequency',
        description: 'The highest frequency that can be detected is half the sampling rate. Frequencies above this limit cannot be accurately measured and may appear as "aliased" lower frequencies.',
    },
    samplingRate: {
        title: 'Sampling Rate',
        description: 'How many data points per second. Higher sampling rates allow detection of faster oscillations.',
    },
    windowSize: {
        title: 'Window Size Trade-off',
        description: 'Larger windows → better frequency resolution, worse time localization. Smaller windows → better time localization, worse frequency resolution.',
    },
    dominantFrequency: {
        title: 'Dominant Frequency',
        description: 'The frequency with the highest power in the signal. This often corresponds to the main periodic pattern.',
    },
    dcComponent: {
        title: 'DC Component',
        description: 'The zero-frequency component represents the mean (average) value of the signal. It\'s removed during FFT preprocessing.',
    },
};

export interface FrequencyPeak {
    frequency_hz: number;
    magnitude: number;
    power: number;
    rank: number;
}

export interface SpectralInfo {
    sampleRateHz: number;
    nyquistHz: number;
    dominantPeaks: FrequencyPeak[];
    sampleCount: number;
}

/**
 * Format frequency for human-readable display.
 */
export function formatFrequency(hz: number): string {
    if (!Number.isFinite(hz) || hz < 0) return '—';

    if (hz < 0.001) return `${(hz * 1e6).toFixed(2)} µHz`;
    if (hz < 1) return `${(hz * 1000).toFixed(2)} mHz`;
    if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`;
    return `${hz.toFixed(4)} Hz`;
}

/**
 * Convert frequency to period for human understanding.
 */
export function frequencyToPeriod(hz: number): string {
    if (!Number.isFinite(hz) || hz <= 0) return '—';

    const seconds = 1 / hz;
    if (seconds < 1) return `${(seconds * 1000).toFixed(1)} ms`;
    if (seconds < 60) return `${seconds.toFixed(2)} sec`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
    return `${(seconds / 86400).toFixed(1)} days`;
}

/**
 * Get a human-readable description for a frequency.
 */
export function describeFrequency(hz: number, sampleRateHz: number): string {
    const period = 1 / hz;
    const nyquist = sampleRateHz / 2;

    if (hz > nyquist * 0.9) {
        return 'Near Nyquist limit — may be aliased';
    }

    if (period < 1) {
        return 'High frequency oscillation (sub-second)';
    } else if (period < 60) {
        return 'Fast oscillation (seconds scale)';
    } else if (period < 3600) {
        return 'Medium frequency (minutes scale)';
    } else if (period < 86400) {
        return 'Slow trend (hourly scale)';
    } else if (period < 604800) {
        return 'Very slow trend (daily scale)';
    } else {
        return 'Long-term trend (weekly+ scale)';
    }
}

/**
 * Check if there's a potential aliasing concern.
 */
export function checkAliasingWarning(dominantHz: number, nyquistHz: number): string | null {
    if (dominantHz > nyquistHz * 0.8) {
        return `Warning: Dominant frequency (${formatFrequency(dominantHz)}) is close to the Nyquist limit (${formatFrequency(nyquistHz)}). This may indicate aliasing or insufficient sampling rate.`;
    }
    return null;
}

/**
 * Suggest an appropriate spectrogram preset based on signal characteristics.
 */
export function suggestPreset(sampleRateHz: number, dominantPeaks: FrequencyPeak[]): SpectralPreset {
    if (dominantPeaks.length === 0) {
        return SPECTRAL_PRESETS.find((p) => p.id === 'balanced')!;
    }

    const topFreq = dominantPeaks[0].frequency_hz;
    const nyquist = sampleRateHz / 2;

    // If dominant frequency is very low (< 10% of Nyquist), use large window
    if (topFreq < nyquist * 0.1) {
        return SPECTRAL_PRESETS.find((p) => p.id === 'slow-trends')!;
    }

    // If dominant frequency is high (> 50% of Nyquist), use small window
    if (topFreq > nyquist * 0.5) {
        return SPECTRAL_PRESETS.find((p) => p.id === 'fast-oscillations')!;
    }

    // Otherwise balanced
    return SPECTRAL_PRESETS.find((p) => p.id === 'balanced')!;
}
