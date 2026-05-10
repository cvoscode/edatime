/**
 * exportControls — chart data export (CSV/JSON/Parquet) and toolbar modals.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { appState, applyColumnRanges, buildAdaptiveLineFiltersForQuery } from '../state.js';
import { downloadBlob } from '../utils/dom.js';

interface FilteredRow {
    ts_ms: number;
    ts_iso: string;
    series: string;
    value: number;
}

export function buildFilteredSeriesRows(): FilteredRow[] {
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

export function exportChartFilteredData(format: 'csv' | 'json' = 'csv'): boolean {
    const rows = buildFilteredSeriesRows();
    if (rows.length === 0) return false;

    if (format === 'json') {
        downloadBlob(
            new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' }),
            'edatime_filtered_series.json',
        );
        return true;
    }

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

export async function exportChartFilteredParquet(): Promise<boolean> {
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

    const res = await fetch(`/api/export/parquet?${params.toString()}`);
    if (!res.ok) {
        const text = await res.text().catch(() => 'Parquet export failed');
        throw new Error(text || 'Parquet export failed');
    }

    const blob = await res.blob();
    downloadBlob(blob, 'edatime_filtered_series.parquet');
    return true;
}

function openToolbarModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = false;
}

function closeToolbarModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = true;
}

export function initToolbarModals(): void {
    const panels = [
        { openBtn: 'open-labels-panel-btn', modalId: 'chart-labels-modal', closeBtn: 'chart-labels-close-btn', doneBtn: 'chart-labels-done-btn' },
        { openBtn: 'open-export-options-btn', modalId: 'export-options-modal', closeBtn: 'export-options-close-btn', doneBtn: 'chart-labels-done-btn' },
        { openBtn: 'open-analytics-panel-btn', modalId: 'analytics-modal', closeBtn: 'analytics-close-btn', doneBtn: 'analytics-done-btn' },
    ];

    for (const panel of panels) {
        const openButton = document.getElementById(panel.openBtn);
        if (openButton && !openButton.dataset.bound) {
            openButton.addEventListener('click', () => openToolbarModal(panel.modalId));
            openButton.dataset.bound = '1';
        }

        const closeButton = document.getElementById(panel.closeBtn);
        if (closeButton && !closeButton.dataset.bound) {
            closeButton.addEventListener('click', () => closeToolbarModal(panel.modalId));
            closeButton.dataset.bound = '1';
        }

        const doneButton = document.getElementById(panel.doneBtn);
        if (doneButton && !doneButton.dataset.bound) {
            doneButton.addEventListener('click', () => closeToolbarModal(panel.modalId));
            doneButton.dataset.bound = '1';
        }

        const modal = document.getElementById(panel.modalId);
        if (modal && !modal.dataset.bound) {
            modal.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).id === panel.modalId) closeToolbarModal(panel.modalId);
            });
            modal.dataset.bound = '1';
        }
    }
}