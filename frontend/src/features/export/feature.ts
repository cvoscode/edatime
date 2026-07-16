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

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportActions {
    exportFilteredCsv: () => boolean;
    exportFilteredJson: () => boolean;
    exportFilteredParquet: () => Promise<boolean>;
}

export type ExportFeature = ExportActions;

export interface ExportFeatureDeps {
    getData: () => DataObject | null;
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot'>;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface FilteredRow {
    ts_ms: number;
    ts_iso: string;
    series: string;
    value: number;
}

const MAX_INLINE_EXPORT_ROWS = 100_000;

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

function exportFilteredCsv(deps: ExportFeatureDeps): boolean {
    const { rows, limitExceeded } = buildPlanBackedSeriesRows(deps, MAX_INLINE_EXPORT_ROWS);
    if (limitExceeded || rows.length === 0) return false;

    const lines = [
        'ts_ms,ts_iso,series,value',
        ...rows.map((row) =>
            `${row.ts_ms},${escapeCsvField(row.ts_iso)},${escapeCsvField(row.series)},${row.value}`,
        ),
    ];
    downloadBlob(
        new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
        'edatime_filtered_series.csv',
    );
    return true;
}

function exportFilteredJson(deps: ExportFeatureDeps): boolean {
    const { rows, limitExceeded } = buildPlanBackedSeriesRows(deps, MAX_INLINE_EXPORT_ROWS);
    if (limitExceeded || rows.length === 0) return false;

    downloadBlob(
        new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' }),
        'edatime_filtered_series.json',
    );
    return true;
}

async function exportFilteredParquet(deps: ExportFeatureDeps): Promise<boolean> {
    const plan = deps.cleaningPlanStore?.getSnapshot();
    if (!plan) return false;
    const blob = await exportCleaningData(plan);
    downloadBlob(blob, 'edatime_cleaned.parquet');
    return true;
}

// ── Entrypoint factory ────────────────────────────────────────────────────────

export function createExportFeature(deps: ExportFeatureDeps): ExportFeature {
    return {
        exportFilteredCsv: () => exportFilteredCsv(deps),
        exportFilteredJson: () => exportFilteredJson(deps),
        exportFilteredParquet: () => exportFilteredParquet(deps),
    };
}
