import type { SpectrogramResult } from '../../services/api/index.js';

export interface SpectrogramPeakRow {
    frequencyHz: number;
    meanMagnitude: number;
    timePointCount: number;
}

/** Rank frequency bins by mean absolute magnitude across the current result. */
export function buildSpectrogramPeakRows(result: SpectrogramResult, limit = 5): SpectrogramPeakRow[] {
    const validLimit = Math.max(0, Math.floor(limit));
    if (validLimit === 0 || !Array.isArray(result.frequencies) || !Array.isArray(result.magnitudes)) return [];
    return result.frequencies.flatMap((rawFrequency, frequencyIndex) => {
        const frequencyHz = Number(rawFrequency);
        if (!Number.isFinite(frequencyHz) || frequencyHz < 0) return [];
        let sum = 0;
        let timePointCount = 0;
        for (const timeRow of result.magnitudes) {
            const rawMagnitude = timeRow?.[frequencyIndex];
            if (rawMagnitude === null || rawMagnitude === undefined) continue;
            const magnitude = Number(rawMagnitude);
            if (!Number.isFinite(magnitude)) continue;
            sum += Math.abs(magnitude);
            timePointCount += 1;
        }
        return timePointCount > 0 ? [{ frequencyHz, meanMagnitude: sum / timePointCount, timePointCount }] : [];
    }).sort((left, right) => right.meanMagnitude - left.meanMagnitude || left.frequencyHz - right.frequencyHz).slice(0, validLimit);
}
