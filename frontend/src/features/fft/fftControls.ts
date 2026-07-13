import type { ClipMode, ScaleMode, SpectralScaleOptions } from '../../utils/spectralScaling.js';

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
