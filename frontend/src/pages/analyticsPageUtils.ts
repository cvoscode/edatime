import type { DatasetMetadata } from '../types.js';
import { SERIES_COLORS, isLikelyTargetColumn } from '../utils/seriesColors.js';

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
    fallbackIndex: number,
    overrides?: Record<string, string>,
): string {
    if (overrides && overrides[column]) return overrides[column];
    return SERIES_COLORS[Math.max(0, fallbackIndex) % SERIES_COLORS.length];
}

export function getNumericColumns(metadata: DatasetMetadata | null): string[] {
    const timeCol = String(metadata?.time_column || '').trim().toLowerCase();
    return ((metadata?.numeric_columns || []) as string[])
        .filter((column: string) => {
            const lower = String(column || '').trim().toLowerCase();
            return lower && lower !== 'ts' && lower !== timeCol;
        });
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
export function getDefaultTimeseriesColumns(metadata: DatasetMetadata | null): string[] {
    const numeric = getNumericColumns(metadata);
    if (numeric.length === 0) return [];
    const target = numeric.find((column) => isLikelyTargetColumn(column));
    if (!target) return numeric.slice(0, Math.min(3, numeric.length));
    const others = numeric.filter((column) => column !== target);
    const selection = others.slice(0, 2);
    selection.push(target);
    return selection;
}