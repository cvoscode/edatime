/**
 * Export feature operations.
 * Owns transport-layer calls for CSV/JSON/Parquet export.
 * UI layer (ui/*) only binds DOM to injected action interfaces.
 */

import { downloadBlob } from '../../utils/dom.js';
import { escapeCsvField } from '../../utils/csv.js';
import type { DataObject } from '../../types/api.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { exportCleaningData } from '../../cleaning/api.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';
import {
    DEFAULT_INLINE_EXPORT_ROWS,
    DEFAULT_PARQUET_EXPORT_ROWS,
    getExportRowLimits,
} from '../../utils/settings.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ExportResult =
    | { ok: true; rowCount: number; filename: string }
    | { ok: false; reason: 'no_data' | 'row_limit_exceeded' | 'no_plan' | 'export_failed'; limit?: number; error?: unknown };

export interface ExportActions {
    exportFilteredCsv: () => ExportResult;
    exportFilteredJson: () => ExportResult;
    exportFilteredParquet: () => Promise<ExportResult>;
}

export type ExportFeature = ExportActions;

export interface ExportRowLimits {
    inline: number;
    parquet: number;
}

export interface ExportFeatureDeps {
    getData: () => DataObject | null;
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot'>;
    limits?: ExportRowLimits;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface FilteredRow {
    ts_ms: number;
    ts_iso: string;
    series: string;
    value: number;
}

export const MAX_INLINE_EXPORT_ROWS = DEFAULT_INLINE_EXPORT_ROWS;
export const MAX_PARQUET_EXPORT_ROWS = DEFAULT_PARQUET_EXPORT_ROWS;

function resolveLimits(deps: ExportFeatureDeps): Required<ExportRowLimits> {
    if (deps.limits) return { inline: deps.limits.inline, parquet: deps.limits.parquet };
    return getExportRowLimits();
}

interface FilteredRowsResult {
    rows: FilteredRow[];
    limitExceeded: boolean;
}

/**
 * Build a bounded chart-data export from the already plan-backed response.
 * Workspace filter state is deliberately not reapplied here: membership is
 * defined by the canonical plan, while chart controls are presentation state.
 */
function buildPlanBackedSeriesRows(deps: ExportFeatureDeps, maxRows = Number.POSITIVE_INFINITY): FilteredRowsResult {
    const data = deps.getData();
    const snapshot = deps.workspace.getSnapshot();
    const selectedColumns = snapshot.selection.columns;
    if (!data || selectedColumns.length === 0) {
        return { rows: [], limitExceeded: false };
    }

    const rows: FilteredRow[] = [];
    for (const column of selectedColumns) {
        const xs = data.ts || new Float64Array(0);
        const ys = data.values?.[column] || new Float64Array(0);
        const len = Math.min(xs.length, ys.length);
        for (let index = 0; index < len; index++) {
            const tsMs = Number(xs[index]);
            const value = Number(ys[index]);
            if (!Number.isFinite(tsMs) || !Number.isFinite(value)) continue;
            rows.push({
                ts_ms: tsMs,
                ts_iso: new Date(tsMs).toISOString(),
                series: column,
                value,
            });
            if (rows.length > maxRows) {
                return { rows: [], limitExceeded: true };
            }
        }
    }

    rows.sort((a, b) => a.ts_ms - b.ts_ms || a.series.localeCompare(b.series));
    return { rows, limitExceeded: false };
}

// ── Transport calls ───────────────────────────────────────────────────────────

function exportFilteredCsv(deps: ExportFeatureDeps): ExportResult {
    const limits = resolveLimits(deps);
    const { rows, limitExceeded } = buildPlanBackedSeriesRows(deps, limits.inline);
    const filename = 'edatime_filtered_series.csv';
    if (limitExceeded) return { ok: false, reason: 'row_limit_exceeded', limit: limits.inline };
    if (rows.length === 0) return { ok: false, reason: 'no_data' };

    const lines = [
        'ts_ms,ts_iso,series,value',
        ...rows.map((row) =>
            `${row.ts_ms},${escapeCsvField(row.ts_iso)},${escapeCsvField(row.series)},${row.value}`,
        ),
    ];
    downloadBlob(
        new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
        filename,
    );
    return { ok: true, rowCount: rows.length, filename };
}

function exportFilteredJson(deps: ExportFeatureDeps): ExportResult {
    const limits = resolveLimits(deps);
    const { rows, limitExceeded } = buildPlanBackedSeriesRows(deps, limits.inline);
    const filename = 'edatime_filtered_series.json';
    if (limitExceeded) return { ok: false, reason: 'row_limit_exceeded', limit: limits.inline };
    if (rows.length === 0) return { ok: false, reason: 'no_data' };

    downloadBlob(
        new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' }),
        filename,
    );
    return { ok: true, rowCount: rows.length, filename };
}

async function exportFilteredParquet(deps: ExportFeatureDeps): Promise<ExportResult> {
    const filename = 'edatime_cleaned.parquet';
    const plan = deps.cleaningPlanStore?.getSnapshot();
    if (!plan) return { ok: false, reason: 'no_plan' };
    try {
        const blob = await exportCleaningData(plan);
        downloadBlob(blob, filename);
        return { ok: true, rowCount: -1, filename };
    } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        const limit = (err as { limit?: number } | null)?.limit;
        if (code === 'export_row_limit_exceeded' && typeof limit === 'number') {
            return { ok: false, reason: 'row_limit_exceeded', limit, error: err };
        }
        return { ok: false, reason: 'export_failed', error: err };
    }
}

// ── Entrypoint factory ────────────────────────────────────────────────────────

export function createExportFeature(deps: ExportFeatureDeps): ExportFeature {
    return {
        exportFilteredCsv: () => exportFilteredCsv(deps),
        exportFilteredJson: () => exportFilteredJson(deps),
        exportFilteredParquet: () => exportFilteredParquet(deps),
    };
}
