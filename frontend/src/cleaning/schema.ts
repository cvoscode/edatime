import type { DatasetMetadata, ColumnMetadata } from '../contracts/api/v1/dataset.js';
import type { CleaningPlan } from './types.js';
import { getEffectiveNumericColumns } from '../platform/analyticsColumns.js';

/** Project ordered schema changes without changing the source metadata. */
export function getEffectiveColumns(metadata: DatasetMetadata | null, plan?: CleaningPlan | null): ColumnMetadata[] {
    let columns = [...(metadata?.columns ?? [])];
    // Minimal metadata fixtures and older servers may only provide numeric names.
    for (const name of metadata?.numeric_columns ?? []) {
        if (!columns.some((column) => column.name === name)) columns.push({ name, dtype: 'Float64' });
    }
    if (!plan || (metadata?.source_version_id && metadata.source_version_id !== plan.sourceVersionId)) return columns;
    for (const stage of plan.stages) {
        if (!stage.enabled) continue;
        if (stage.kind === 'derivedColumn' || stage.kind === 'chronologicalSplit') {
            const column = { name: stage.outputColumn, dtype: stage.kind === 'derivedColumn' ? 'Float64' : 'String' };
            const index = columns.findIndex((candidate) => candidate.name === column.name);
            if (index < 0) columns.push(column);
            else columns[index] = column;
        } else if (stage.kind === 'columnSelect') {
            const selected = new Set(stage.columns);
            columns = stage.mode === 'keep'
                ? stage.columns.flatMap((name) => columns.filter((column) => column.name === name))
                : columns.filter((column) => !selected.has(column.name));
        } else if (stage.kind === 'resample') {
            columns = [
                ...columns.filter((column) => column.name === plan.timeColumn),
                ...stage.aggregations.map(({ column }) => ({
                    name: column,
                    dtype: 'Float64',
                })),
            ];
        }
    }
    return columns;
}

/** Analysis controls need the working schema while source profiles retain their identity. */
export function getEffectiveMetadata(metadata: DatasetMetadata | null, plan: CleaningPlan | null): DatasetMetadata | null {
    if (!metadata) return null;
    return { ...metadata, columns: getEffectiveColumns(metadata, plan), numeric_columns: getEffectiveNumericColumns(metadata, plan) };
}

