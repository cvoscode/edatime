import type { ClipMode, ScaleMode } from '../../utils/spectralScaling.js';

export const SPECTROGRAM_MAX_POINTS = 32_768;

export interface SpectrogramRequestInput {
    column: string | null;
    startMs: number | null | undefined;
    endMs: number | null | undefined;
    windowSize: number;
    hopSize: number;
    normalize: ScaleMode;
    clipEnabled: boolean;
    clipMethod: ClipMode;
    clipParam: number;
    maxPoints?: number;
}

export interface SpectrogramRequest {
    start: string;
    end: string;
    column: string;
    windowSize: number;
    hopSize: number;
    maxPoints: number;
    normalize: ScaleMode;
    clip: ClipMode;
    clipParam: number;
}

/**
 * Converts resolved page controls into the API contract. Invalid selection or
 * viewport state deliberately yields null so the page runtime can decide how
 * to present its empty state without issuing a malformed analytics request.
 */
export function buildSpectrogramRequest(input: SpectrogramRequestInput): SpectrogramRequest | null {
    const column = input.column?.trim();
    const { startMs, endMs } = input;
    if (!column || typeof startMs !== 'number' || typeof endMs !== 'number'
        || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

    return {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        column,
        windowSize: input.windowSize,
        hopSize: input.hopSize,
        maxPoints: input.maxPoints ?? SPECTROGRAM_MAX_POINTS,
        normalize: input.normalize,
        clip: input.clipEnabled ? input.clipMethod : 'none',
        clipParam: Number.isFinite(input.clipParam) ? input.clipParam : 0.5,
    };
}
