import type { CleaningPlan, CleaningStage } from './types.js';

/** A deterministic FNV-1a hash for optimistic frontend request coalescing. */
function fnv1a(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function finite(value: number): number {
    if (!Number.isFinite(value)) throw new Error('Cleaning plan values must be finite numbers.');
    return Object.is(value, -0) ? 0 : value;
}

function stageSemanticValue(stage: CleaningStage): Record<string, unknown> | null {
    if (!stage.enabled || stage.kind === 'annotation') return null;
    switch (stage.kind) {
        case 'timeRange':
            return {
                kind: stage.kind,
                startMs: Math.min(finite(stage.startMs), finite(stage.endMs)),
                endMs: Math.max(finite(stage.startMs), finite(stage.endMs)),
                mode: stage.mode,
            };
        case 'columnRange':
            return {
                kind: stage.kind,
                column: stage.column.trim(),
                from: Math.min(finite(stage.from), finite(stage.to)),
                to: Math.max(finite(stage.from), finite(stage.to)),
                mode: stage.mode,
                retainNulls: stage.retainNulls === true,
            };
        case 'adaptiveLine':
            return {
                kind: stage.kind,
                column: stage.column.trim(),
                x1Ms: finite(stage.x1Ms),
                y1: finite(stage.y1),
                x2Ms: finite(stage.x2Ms),
                y2: finite(stage.y2),
                keepAbove: stage.keepAbove,
                applyWithinSegmentOnly: stage.applyWithinSegmentOnly,
            };
        case 'missingValue':
            return {
                kind: stage.kind,
                column: stage.column.trim(),
                dropNulls: stage.dropNulls,
                dropNonFinite: stage.dropNonFinite,
            };
        case 'deduplicate':
            return { kind: stage.kind, columns: stage.columns.map((column) => column.trim()), keep: stage.keep };
        case 'columnSelect':
            return { kind: stage.kind, columns: stage.columns.map((column) => column.trim()), mode: stage.mode };
        case 'sort':
            return { kind: stage.kind, columns: stage.columns.map((column) => column.trim()), descending: stage.descending, nullsLast: stage.nullsLast };
        case 'fillNull':
            return { kind: stage.kind, columns: stage.columns.map((column) => column.trim()), strategy: stage.strategy, limit: stage.limit };
        case 'resample':
            return {
                kind: stage.kind,
                every: stage.every.trim(),
                aggregations: stage.aggregations.map(({ column, method }) => ({ column: column.trim(), method })),
            };
        case 'chronologicalSplit':
            return { kind: stage.kind, trainEndMs: finite(stage.trainEndMs), validationEndMs: finite(stage.validationEndMs), embargoMs: finite(stage.embargoMs), outputColumn: stage.outputColumn.trim() };
        default: {
            const exhaustive: never = stage;
            return exhaustive;
        }
    }
}

/** Canonical executable input; deliberately excludes audit/UI metadata. */
export function canonicalPlanSemanticValue(plan: CleaningPlan): Record<string, unknown> {
    return {
        schemaVersion: plan.schemaVersion,
        sourceVersionId: plan.sourceVersionId,
        datasetRevision: plan.datasetRevision,
        datasetFingerprint: plan.datasetFingerprint ?? null,
        schemaFingerprint: plan.schemaFingerprint,
        timeColumn: plan.timeColumn,
        stages: plan.stages.map(stageSemanticValue).filter((stage): stage is Record<string, unknown> => stage !== null),
    };
}

export function hashCleaningPlan(plan: CleaningPlan): string {
    return `fnv1a-${fnv1a(JSON.stringify(canonicalPlanSemanticValue(plan)))}`;
}
