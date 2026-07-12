import type { SpectrogramResult } from '../../services/api/index.js';

export function formatSpectrogramTime(timestampMs: number): string {
    return new Date(timestampMs).toLocaleString([], {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

export function findDominantFrequencyBand(result: SpectrogramResult): { lowerIndex: number; upperIndex: number; dominantHz: number } | null {
    const frequencies = result.frequencies;
    if (!Array.isArray(frequencies) || frequencies.length === 0) return null;
    const totals = frequencies.map(() => 0);
    for (const row of result.magnitudes) {
        frequencies.forEach((_, index) => {
            const value = Number(row?.[index] ?? NaN);
            if (Number.isFinite(value)) totals[index] += Math.abs(value);
        });
    }
    let dominantIndex = 0;
    for (let index = 1; index < totals.length; index += 1) {
        if (totals[index] > totals[dominantIndex]!) dominantIndex = index;
    }
    const threshold = (totals[dominantIndex] ?? 0) * 0.75;
    let lowerIndex = dominantIndex;
    let upperIndex = dominantIndex;
    while (lowerIndex > 0 && (totals[lowerIndex - 1] ?? 0) >= threshold) lowerIndex -= 1;
    while (upperIndex < totals.length - 1 && (totals[upperIndex + 1] ?? 0) >= threshold) upperIndex += 1;
    if (lowerIndex === upperIndex && totals.length > 1) {
        if (dominantIndex === totals.length - 1) lowerIndex = dominantIndex - 1;
        else upperIndex = dominantIndex + 1;
    }
    return { lowerIndex, upperIndex, dominantHz: Number(frequencies[dominantIndex] ?? 0) };
}
