import type { CleaningPlan, CleaningStage, PlanRequestSnapshot } from './types.js';
import { hashCleaningPlan } from './planHash.js';

export interface LegacyRangeFilter {
    column: string;
    from: number;
    to: number;
}

export interface LegacyLineFilter {
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

export interface CompiledCleaningContext {
    planHash: string;
    start?: number;
    end?: number;
    filters: LegacyRangeFilter[];
    lineFilters: LegacyLineFilter[];
    plan: CleaningPlan;
    unsupportedForLegacyFilters: CleaningStage[];
}

function finite(value: number): boolean {
    return Number.isFinite(value);
}

/**
 * Compatibility-only lowering to existing GET filter fields.  It is all or
 * nothing: callers must use a plan-aware POST endpoint when a stage cannot be
 * represented exactly.
 */
export function compileCleaningPlanForLegacyFilters(plan: CleaningPlan): CompiledCleaningContext {
    const filters: LegacyRangeFilter[] = [];
    const lineFilters: LegacyLineFilter[] = [];
    const unsupportedForLegacyFilters: CleaningStage[] = [];
    let start: number | undefined;
    let end: number | undefined;

    for (const stage of plan.stages) {
        if (!stage.enabled || stage.kind === 'annotation') continue;
        if (stage.kind === 'timeRange') {
            if (stage.mode !== 'keepInside' || !finite(stage.startMs) || !finite(stage.endMs)) {
                unsupportedForLegacyFilters.push(stage);
                continue;
            }
            const lower = Math.min(stage.startMs, stage.endMs);
            const upper = Math.max(stage.startMs, stage.endMs);
            start = start == null ? lower : Math.max(start, lower);
            end = end == null ? upper : Math.min(end, upper);
            continue;
        }
        if (stage.kind === 'columnRange') {
            if (stage.mode !== 'keepInside' || !stage.column.trim() || !finite(stage.from) || !finite(stage.to)) {
                unsupportedForLegacyFilters.push(stage);
                continue;
            }
            filters.push({
                column: stage.column.trim(),
                from: Math.min(stage.from, stage.to),
                to: Math.max(stage.from, stage.to),
            });
            continue;
        }
        if (stage.kind === 'adaptiveLine') {
            if (!stage.column.trim() || !finite(stage.x1Ms) || !finite(stage.y1) || !finite(stage.x2Ms)
                || !finite(stage.y2) || stage.x1Ms === stage.x2Ms || !stage.applyWithinSegmentOnly) {
                unsupportedForLegacyFilters.push(stage);
                continue;
            }
            lineFilters.push({
                column: stage.column.trim(),
                x1: stage.x1Ms,
                y1: stage.y1,
                x2: stage.x2Ms,
                y2: stage.y2,
                keepAbove: stage.keepAbove,
            });
            continue;
        }
        unsupportedForLegacyFilters.push(stage);
    }

    if (start != null && end != null && start > end) {
        // The legacy format has no empty-range representation.  A plan-aware
        // request must execute this exact intersection instead.
        unsupportedForLegacyFilters.push(...plan.stages.filter((stage) => stage.enabled && stage.kind === 'timeRange'));
        start = undefined;
        end = undefined;
    }

    return { planHash: hashCleaningPlan(plan), start, end, filters, lineFilters, plan, unsupportedForLegacyFilters };
}

export function buildPlanRequestSnapshot(plan: CleaningPlan): PlanRequestSnapshot {
    return {
        plan,
        expectedPlanHash: hashCleaningPlan(plan),
        expectedSourceVersionId: plan.sourceVersionId,
        expectedDatasetRevision: plan.datasetRevision,
    };
}
