import type { CleaningPlan, ResampleAggregation, ResampleAggregationMethod } from './types.js';

const FIXED_DURATION = /^(\d+)(ns|us|ms|s|m|h)$/;
const AGGREGATION_METHODS = new Set<ResampleAggregationMethod>(['mean', 'sum', 'min', 'max', 'last']);

export function normalizeFixedDuration(value: string): string | null {
    const normalized = value.trim();
    const match = FIXED_DURATION.exec(normalized);
    if (!match) return null;
    try {
        return BigInt(match[1]) > 0n ? normalized : null;
    } catch {
        return null;
    }
}

export function parseResampleAggregations(value: string, timeColumn: string): ResampleAggregation[] | null {
    const aggregations: ResampleAggregation[] = [];
    for (const rawEntry of value.split(',')) {
        const entry = rawEntry.trim();
        if (!entry) continue;
        const separator = entry.lastIndexOf(':');
        if (separator <= 0) return null;
        const column = entry.slice(0, separator).trim();
        const method = entry.slice(separator + 1).trim() as ResampleAggregationMethod;
        if (!column || column === timeColumn.trim() || !AGGREGATION_METHODS.has(method)) return null;
        aggregations.push({ column, method });
    }
    if (aggregations.length === 0 || new Set(aggregations.map(({ column }) => column)).size !== aggregations.length) return null;
    return aggregations;
}

export function formatResampleAggregations(aggregations: ResampleAggregation[]): string {
    return aggregations.map(({ column, method }) => `${column}:${method}`).join(', ');
}

export function hasAscendingTimeSortBefore(plan: CleaningPlan, beforeIndex = plan.stages.length): boolean {
    for (let index = beforeIndex - 1; index >= 0; index -= 1) {
        const stage = plan.stages[index];
        if (!stage.enabled || stage.kind !== 'sort') continue;
        return !stage.descending && stage.columns[0]?.trim() === plan.timeColumn.trim();
    }
    return false;
}
