/**
 * Export feature entrypoint.
 * Owns transport-layer calls for CSV/JSON/Parquet export.
 * UI layer (ui/*) only binds DOM to injected action interfaces.
 */

import { appState } from '../../store/appStateCompat.js';
import { applyColumnRanges, buildAdaptiveLineFiltersForQuery } from '../../services/timeseries/filtering.js';
import { exportParquet } from '../../services/api/index.js';
import { downloadBlob } from '../../utils/dom.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportActions {
    exportFilteredCsv: () => boolean;
    exportFilteredJson: () => boolean;
    exportFilteredParquet: () => Promise<boolean>;
}

export type ExportFeature = ExportActions;

// ── Internal helpers ─────────────────────────────────────────────────────────

interface FilteredRow {
    ts_ms: number;
    ts_iso: string;
    series: string;
    value: number;
}

function buildFilteredSeriesRows(): FilteredRow[] {
    if (!appState.lastFetchedData || !Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
        return [];
    }

    const filtered = applyColumnRanges(appState.lastFetchedData);
    const rows: FilteredRow[] = [];
    for (const column of appState.selectedCols) {
        const series = filtered.series?.[column];
        const xs = series?.x || new Float64Array(0);
        const ys = series?.y || new Float64Array(0);
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
        }
    }

    rows.sort((a, b) => a.ts_ms - b.ts_ms || a.series.localeCompare(b.series));
    return rows;
}

// ── Transport calls ───────────────────────────────────────────────────────────

function exportFilteredCsv(): boolean {
    const rows = buildFilteredSeriesRows();
    if (rows.length === 0) return false;

    const lines = [
        'ts_ms,ts_iso,series,value',
        ...rows.map((row) =>
            `${row.ts_ms},"${row.ts_iso}","${String(row.series).replaceAll('"', '""')}",${row.value}`,
        ),
    ];
    downloadBlob(
        new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
        'edatime_filtered_series.csv',
    );
    return true;
}

function exportFilteredJson(): boolean {
    const rows = buildFilteredSeriesRows();
    if (rows.length === 0) return false;

    downloadBlob(
        new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' }),
        'edatime_filtered_series.json',
    );
    return true;
}

async function exportFilteredParquet(): Promise<boolean> {
    if (!Number.isFinite(appState.currentStart as number) || !Number.isFinite(appState.currentEnd as number)) {
        return false;
    }
    if (!Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
        return false;
    }

    const params = new URLSearchParams({
        start: new Date(appState.currentStart as number).toISOString(),
        end: new Date(appState.currentEnd as number).toISOString(),
        columns: appState.selectedCols.join(','),
    });

    const filters = Object.entries(appState.columnRanges || {})
        .map(([column, range]) => {
            const from = Number(range?.from);
            const to = Number(range?.to);
            if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
            return { column, from, to };
        })
        .filter(Boolean);
    if (filters.length > 0) {
        params.set('filters', JSON.stringify(filters));
    }

    const lineFilters = buildAdaptiveLineFiltersForQuery();
    if (lineFilters.length > 0) {
        params.set('line_filters', JSON.stringify(lineFilters));
    }

    const blob = await exportParquet(params);
    downloadBlob(blob, 'edatime_filtered_series.parquet');
    return true;
}

// ── Entrypoint factory ────────────────────────────────────────────────────────

export function createExportFeature(): ExportFeature {
    return {
        exportFilteredCsv,
        exportFilteredJson,
        exportFilteredParquet,
    };
}