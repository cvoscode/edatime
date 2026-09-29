import { parseUtcDatetimeInputValue } from '../../utils/datetimeInput.js';

export interface DriftInvestigationRequestInput {
    columns: string[];
    window: string | null | undefined;
    referenceStart: string;
    referenceEnd: string;
    segmentBy: string | null | undefined;
    ksPvalueThreshold: unknown;
    esPvalueThreshold: unknown;
    psiMinorThreshold: unknown;
    psiMajorThreshold: unknown;
    wassersteinStdMultiplier: unknown;
}

export function normalizeDriftThreshold(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildDriftInvestigationRequest(input: DriftInvestigationRequestInput): Record<string, unknown> {
    const startMs = parseUtcDatetimeInputValue(input.referenceStart);
    const endMs = parseUtcDatetimeInputValue(input.referenceEnd);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
        throw new Error('Enter a valid UTC reference range with end after start.');
    }
    const referenceStart = new Date(startMs).toISOString();
    const referenceEnd = new Date(endMs).toISOString();
    const payload: Record<string, unknown> = {
        columns: input.columns,
        window: input.window || 'daily',
        referenceStart,
        referenceEnd,
        comparisonStart: referenceEnd,
        ksPvalueThreshold: normalizeDriftThreshold(input.ksPvalueThreshold, 0.05),
        esPvalueThreshold: normalizeDriftThreshold(input.esPvalueThreshold, 0.05),
        psiMinorThreshold: normalizeDriftThreshold(input.psiMinorThreshold, 0.1),
        psiMajorThreshold: normalizeDriftThreshold(input.psiMajorThreshold, 0.2),
        wassersteinStdMultiplier: normalizeDriftThreshold(input.wassersteinStdMultiplier, 0.1),
        includeQuality: true,
        includeChangePoints: true,
        includeCorrelations: true,
    };
    if (input.segmentBy) payload.segmentBy = input.segmentBy;
    return payload;
}
