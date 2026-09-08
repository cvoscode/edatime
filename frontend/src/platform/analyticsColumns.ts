import type { DatasetMetadata } from '../types/api.js';
import type { CleaningPlan } from '../cleaning/types.js';
import { getColumnSeriesColor } from '../utils/seriesColors.js';

/**
 * Returns the color to use for an analytics chip (FFT/spectrogram/etc.).
 * Prefer a per-column override if the caller supplies one; otherwise fall
 * back to the shared palette. Previously this module exported its own
 * `ANALYTICS_CHIP_COLORS` palette which diverged from the timeseries
 * palette — the duplication is what produced the cross-page color drift
 * called out in `usage_issue.md` §1.3.
 */
export function getAnalyticsChipColor(
    column: string,
    overrides?: Record<string, string>,
): string {
    if (overrides && overrides[column]) return overrides[column];
    return getColumnSeriesColor(column);
}

export function getNumericColumns(metadata: DatasetMetadata | null): string[] {
    const timeCol = String(metadata?.time_column || '').trim().toLowerCase();
    return ((metadata?.numeric_columns || []) as string[])
        .filter((column: string) => {
            const lower = String(column || '').trim().toLowerCase();
            return lower && lower !== 'ts' && lower !== timeCol;
        });
}

/** Numeric schema visible before materialization when a draft adds columns. */
export function getEffectiveNumericColumns(metadata: DatasetMetadata | null, plan?: CleaningPlan | null): string[] {
    let columns = getNumericColumns(metadata);
    if (!plan) return columns;
    for (const stage of plan.stages) {
        if (!stage.enabled) continue;
        if (stage.kind === 'derivedColumn') {
            if (!columns.includes(stage.outputColumn)) columns = [...columns, stage.outputColumn];
        } else if (stage.kind === 'columnSelect') {
            const selected = new Set(stage.columns);
            columns = stage.mode === 'keep' ? columns.filter((column) => selected.has(column)) : columns.filter((column) => !selected.has(column));
        }
    }
    return columns;
}

/**
 * Pick a target-aware default selection for the timeseries chart.
 *
 * The legacy behavior returned `numeric.slice(0, 3)` which always picked
 * the same first three numeric columns — including the ETTm2 dataset,
 * where that produces HUFL/HULL/MUFL and ignores the canonical target
 * `OT`. This helper:
 *
 *   1. Finds a likely target column (e.g. `OT`, `target`, `y`). If found,
 *      include it plus up to two other non-target numeric columns.
 *   2. Falls back to the previous "first three numeric columns" behavior
 *      when no target is detected so non-target datasets are unaffected.
 *
 * The returned list is always ordered to put the target column last, so
 * the timeseries chart draws the target on top of the feature columns.
 */
export function getDefaultTimeseriesColumns(metadata: DatasetMetadata | null, plan?: CleaningPlan | null): string[] {
    const numeric = getEffectiveNumericColumns(metadata, plan);
    return numeric;
}
