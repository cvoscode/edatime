import type { FftDetrend } from '../../contracts/api/v1/analytics.js';
import type { ClipMode, ScaleMode, SpectralScaleOptions } from '../../utils/spectralScaling.js';

const FFT_DETRENDS: readonly FftDetrend[] = ['none', 'constant', 'linear'];

/** Read the detrend control, falling back to the API default for unknown values. */
export function parseFftDetrend(value: string | null | undefined): FftDetrend {
    return FFT_DETRENDS.find((detrend) => detrend === value) ?? 'constant';
}

export function buildFftScaleOptions(input: {
    mode: string | null | undefined;
    clipEnabled: boolean;
    clipMethod: string | null | undefined;
    clipParam: string | number | null | undefined;
}): SpectralScaleOptions {
    const parsed = Number.parseFloat(String(input.clipParam ?? '0.5'));
    return {
        mode: (input.mode || 'none') as ScaleMode,
        clip: input.clipEnabled ? (input.clipMethod || 'percentile') as ClipMode : 'none',
        clipParam: Number.isFinite(parsed) ? parsed : 0.5,
    };
}

export function buildFftFilterCutoffState(filterType: string): {
    bandVisible: boolean;
    low: { disabled: boolean; hint: string };
    high: { disabled: boolean; hint: string };
} {
    const type = filterType.toLowerCase();
    return {
        bandVisible: type !== 'none',
        low: {
            disabled: type === 'none' || type === 'lowpass',
            hint: type === 'none' ? 'Set Filter type to Highpass or Bandpass to use the Low Hz cutoff.'
                : type === 'lowpass' ? 'Low Hz cutoff is unused for Lowpass.' : 'Lower edge of the bandpass / highpass.',
        },
        high: {
            disabled: type === 'none' || type === 'highpass',
            hint: type === 'none' ? 'Set Filter type to Lowpass or Bandpass to use the High Hz cutoff.'
                : type === 'highpass' ? 'High Hz cutoff is unused for Highpass.' : 'Upper edge of the bandpass / lowpass.',
        },
    };
}

export interface FftFilterCutoffValidation {
    valid: boolean;
    message: string;
    lowHz?: number;
    highHz?: number;
}

/** Validate filter cutoffs against the spectrum that will be filtered. */
export function validateFftFilterCutoffs(
    filterType: string,
    lowValue: string,
    highValue: string,
    nyquistHz: number | null,
): FftFilterCutoffValidation {
    const type = filterType.toLowerCase();
    if (type === 'none') return { valid: false, message: 'No spectral filter selected.' };
    if (!Number.isFinite(nyquistHz) || !(nyquistHz! > 0)) {
        return { valid: false, message: 'Compute a spectrum to determine the Nyquist limit.' };
    }

    const lowHz = Number(lowValue);
    const highHz = Number(highValue);
    const needsLow = type === 'highpass' || type === 'bandpass' || type === 'bandstop';
    const needsHigh = type === 'lowpass' || type === 'bandpass' || type === 'bandstop';
    if (needsLow && (!lowValue.trim() || !Number.isFinite(lowHz))) {
        return { valid: false, message: 'Enter a low cutoff.' };
    }
    if (needsHigh && (!highValue.trim() || !Number.isFinite(highHz))) {
        return { valid: false, message: 'Enter a high cutoff.' };
    }
    if (needsLow && (lowHz < 0 || lowHz >= nyquistHz!)) {
        return { valid: false, message: `Low cutoff must be at least 0 and below Nyquist (${nyquistHz} Hz).` };
    }
    if (needsHigh && (highHz <= 0 || highHz > nyquistHz!)) {
        return { valid: false, message: `High cutoff must be above 0 and at most Nyquist (${nyquistHz} Hz).` };
    }
    if ((type === 'bandpass' || type === 'bandstop') && lowHz >= highHz) {
        return { valid: false, message: 'Low cutoff must be below high cutoff.' };
    }

    const passesEverything = (type === 'highpass' && lowHz === 0)
        || (type === 'lowpass' && highHz === nyquistHz)
        || (type === 'bandpass' && lowHz === 0 && highHz === nyquistHz);
    if (passesEverything) {
        return { valid: false, message: 'These cutoffs pass the entire spectrum; choose a narrower range.' };
    }
    return {
        valid: true,
        message: `Valid range: 0 to ${nyquistHz} Hz.`,
        lowHz: needsLow ? lowHz : undefined,
        highHz: needsHigh ? highHz : undefined,
    };
}
