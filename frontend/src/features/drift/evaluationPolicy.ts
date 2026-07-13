import type { DriftEvaluationMode, DriftResponse } from './viewModels.js';
import { filterResponseForEvaluation } from './viewModels.js';

export function normalizeDriftEvaluationMode(value: string | null | undefined): DriftEvaluationMode {
    return value === 'latest' || value === 'latest-n' ? value : 'all';
}

export function normalizeLatestWindowCount(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export function filterDriftResponsesForEvaluation(
    responses: Map<string, DriftResponse>,
    mode: DriftEvaluationMode,
    latestCount: number,
): Map<string, DriftResponse> {
    return new Map(Array.from(responses.entries()).map(([column, response]) => [
        column,
        filterResponseForEvaluation(response, mode, latestCount),
    ]));
}
