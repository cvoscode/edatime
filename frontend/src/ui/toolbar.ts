/**
 * Toolbar controls: zoom, draw, labels, export, analysis status.
 */

import {
    appState,
    formatAnalysisTime,
    formatAnalysisNumber,
    applyColumnRanges,
    buildAdaptiveLineFiltersForQuery,
} from '../state.js';
import { DEBUG, dbg, dbgGroup } from '../debug.js';
import { downloadBlob } from '../utils/dom.js';

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

async function exportChartFilteredParquet(): Promise<boolean> {
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

// ─── Analysis status ────────────────────────────────────────────────────────

function setAnalysisStatus(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

export function updateAnalysisZoom(startMs: number, endMs: number, sourceKind = 'user'): void {
    setAnalysisStatus(
        'analysis-zoom',
        `Range: ${formatAnalysisTime(startMs)} → ${formatAnalysisTime(endMs)} (${sourceKind})`,
    );
}

export function updateAnalysisYRange(min: number, max: number, sourceKind = 'user'): void {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        setAnalysisStatus('analysis-y', 'Y: —');
        return;
    }
    setAnalysisStatus('analysis-y', `Y: ${formatAnalysisNumber(min)} → ${formatAnalysisNumber(max)} (${sourceKind})`);
}

export function updateAnalysisCursor(tsMs: number): void {
    if (!Number.isFinite(tsMs)) {
        setAnalysisStatus('analysis-cursor', 'Cursor: —');
        return;
    }
    setAnalysisStatus('analysis-cursor', `Cursor: ${formatAnalysisTime(tsMs)}`);
}

interface ClickPayload {
    value?: number[];
    seriesName?: string;
}

export function updateAnalysisClick(payload: ClickPayload | null): void {
    if (!payload?.value || payload.value.length < 2) {
        setAnalysisStatus('analysis-click', 'Click: —');
        return;
    }
    const x = Number(payload.value[0]);
    const y = Number(payload.value[1]);
    const seriesName = payload.seriesName || 'series';
    setAnalysisStatus('analysis-click', `Click: ${seriesName}=${formatAnalysisNumber(y)} @ ${formatAnalysisTime(x)}`);
}

// ─── Zoom controls ──────────────────────────────────────────────────────────

export function refreshZoomControlsState(): void {
    const supportsZoom = !!appState.chart?.supportsZoomControls?.();
    const resetBtn = document.getElementById('zoom-reset-btn') as HTMLButtonElement | null;
    if (resetBtn) resetBtn.disabled = !supportsZoom;
}

// ─── View helpers ───────────────────────────────────────────────────────────

export interface ViewSnapshot {
    xMin: number | null;
    xMax: number | null;
    yMin: number | null;
    yMax: number | null;
}

export function getCurrentView(): ViewSnapshot {
    const yr = appState.chart?.getYRange?.();
    return {
        xMin: appState.currentStart,
        xMax: appState.currentEnd,
        yMin: yr?.min ?? null,
        yMax: yr?.max ?? null,
    };
}

export function applyViewport(
    view: ViewSnapshot,
    fetchAndRender: () => void,
    sourceKind = 'api',
): void {
    dbgGroup(`applyViewport (${sourceKind})`, () => {
        dbg('incoming view', view);
    });
    appState.currentStart = view.xMin;
    appState.currentEnd = view.xMax;
    appState.chart?.setXRange?.(appState.currentStart as number, appState.currentEnd as number);
    updateAnalysisZoom(appState.currentStart as number, appState.currentEnd as number, sourceKind);

    if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax! > view.yMin!) {
        updateAnalysisYRange(view.yMin!, view.yMax!, sourceKind);
        appState.pendingYMode = 'restore' as any;
        appState.pendingRestoreY = { min: view.yMin!, max: view.yMax! };
    } else {
        appState.pendingYMode = 'fit';
        appState.pendingRestoreY = null;
    }

    if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
    appState.fetchDebounceId = setTimeout(fetchAndRender, 0);
}

export function zoomOut(fetchAndRender: () => void): void {
    dbgGroup('zoomOut (dblclick)', () => {
        dbg('history depth', appState.zoomHistory.length);
        dbg('initialView', appState.initialView);
    });
    if (appState.zoomHistory.length > 0) {
        applyViewport(appState.zoomHistory.pop()! as ViewSnapshot, fetchAndRender, 'zoom-out');
    } else if (appState.initialView) {
        applyViewport(appState.initialView as ViewSnapshot, fetchAndRender, 'zoom-out');
    }
}

export function resetZoom(fetchAndRender: () => void): void {
    dbgGroup('resetZoom', () => {
        dbg('initialView', appState.initialView);
    });
    if (!appState.initialView) return;
    appState.zoomHistory = [];
    applyViewport(appState.initialView as ViewSnapshot, fetchAndRender, 'reset');
}

// ─── Init controls (draw, export, labels, zoom) ────────────────────────────

export function initAnalysisControls(fetchAndRender: () => void): void {
    window.__edatime = window.__edatime || {};
    window.__edatime.exportChartFilteredData = exportChartFilteredData;

    const zoomResetBtn = document.getElementById('zoom-reset-btn') as HTMLElement | null;
    if (zoomResetBtn && !zoomResetBtn.dataset.bound) {
        zoomResetBtn.addEventListener('click', () => resetZoom(fetchAndRender));
        zoomResetBtn.dataset.bound = '1';
    }

    const drawTool = document.getElementById('draw-tool') as HTMLSelectElement | null;
    const drawColor = document.getElementById('draw-color') as HTMLInputElement | null;
    const drawWidth = document.getElementById('draw-width') as HTMLInputElement | null;
    const drawClearBtn = document.getElementById('draw-clear-btn');
    const adaptiveClearBtn = document.getElementById('adaptive-clear-btn') as HTMLElement | null;

    const updateDrawMode = () => {
        if (appState.chart && appState.chart.setDrawMode) {
            appState.chart.setDrawMode(drawTool!.value, drawColor!.value, parseInt(drawWidth!.value, 10));
        }
    };

    if (drawTool) drawTool.addEventListener('change', updateDrawMode);
    if (drawColor) drawColor.addEventListener('input', updateDrawMode);
    if (drawWidth) drawWidth.addEventListener('input', updateDrawMode);
    if (drawClearBtn) {
        drawClearBtn.addEventListener('click', () => {
            if (appState.chart && appState.chart.clearDrawings) appState.chart.clearDrawings();
        });
    }
    if (adaptiveClearBtn && !adaptiveClearBtn.dataset.bound) {
        adaptiveClearBtn.addEventListener('click', () => {
            appState.adaptiveLineFilters = [];
            appState.pendingAdaptivePoint = null;
            (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
            window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change'));
        });
        adaptiveClearBtn.dataset.bound = '1';
    }

    const exportPngBtn = document.getElementById('export-png-btn');
    const exportSvgBtn = document.getElementById('export-svg-btn');
    const exportHtmlBtn = document.getElementById('export-html-btn');
    const exportDataCsvBtn = document.getElementById('export-data-csv-btn') as HTMLElement | null;
    const exportDataJsonBtn = document.getElementById('export-data-json-btn') as HTMLElement | null;
    const exportDataParquetBtn = document.getElementById('export-data-parquet-btn') as HTMLElement | null;

    if (exportPngBtn) exportPngBtn.addEventListener('click', () => appState.chart?.exportPNG?.());
    if (exportSvgBtn) exportSvgBtn.addEventListener('click', () => appState.chart?.exportSVG?.());
    if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', () => appState.chart?.exportHTML?.());
    if (exportDataCsvBtn && !exportDataCsvBtn.dataset.bound) {
        exportDataCsvBtn.addEventListener('click', () => exportChartFilteredData('csv'));
        exportDataCsvBtn.dataset.bound = '1';
    }
    if (exportDataJsonBtn && !exportDataJsonBtn.dataset.bound) {
        exportDataJsonBtn.addEventListener('click', () => exportChartFilteredData('json'));
        exportDataJsonBtn.dataset.bound = '1';
    }
    if (exportDataParquetBtn && !exportDataParquetBtn.dataset.bound) {
        exportDataParquetBtn.addEventListener('click', async () => {
            try {
                await exportChartFilteredParquet();
            } catch (error) {
                console.error('Parquet export failed:', error);
            }
        });
        exportDataParquetBtn.dataset.bound = '1';
    }

    const titleInput = document.getElementById('chart-title-input') as HTMLInputElement | null;
    const xLabelInput = document.getElementById('x-axis-label-input') as HTMLInputElement | null;
    const yLabelInput = document.getElementById('y-axis-label-input') as HTMLInputElement | null;

    const applyChartText = () => {
        appState.chartText = {
            title: titleInput?.value ?? appState.chartText.title,
            xLabel: xLabelInput?.value ?? appState.chartText.xLabel,
            yLabel: yLabelInput?.value ?? appState.chartText.yLabel,
        };
        appState.chart?.setChartText?.(appState.chartText.title, appState.chartText.xLabel, appState.chartText.yLabel);
    };

    if (titleInput && !titleInput.dataset.bound) {
        titleInput.value = appState.chartText.title || '';
        titleInput.addEventListener('input', applyChartText);
        titleInput.dataset.bound = '1';
    }
    if (xLabelInput && !xLabelInput.dataset.bound) {
        xLabelInput.value = appState.chartText.xLabel || '';
        xLabelInput.addEventListener('input', applyChartText);
        xLabelInput.dataset.bound = '1';
    }
    if (yLabelInput && !yLabelInput.dataset.bound) {
        yLabelInput.value = appState.chartText.yLabel || '';
        yLabelInput.addEventListener('input', applyChartText);
        yLabelInput.dataset.bound = '1';
    }

    applyChartText();
    refreshZoomControlsState();
}

// ─── Bind chart events to analysis panel ────────────────────────────────────

export function bindAnalysisChartEvents(): void {
    if (!appState.chart || appState.analysisBound) return;

    appState.chart.onCrosshairMove?.((payload: any) => {
        let x = Number(payload?.x);
        if (Number.isFinite(x) && x < 100_000_000_000) {
            const dom = appState.chart?.getXDomain?.();
            if (dom?.min && Number.isFinite(dom.min)) x = dom.min + x;
        }
        updateAnalysisCursor(x);

        if (DEBUG) {
            const now = Date.now();
            const last = (appState as any)._debugLastCrosshairLogTs ?? 0;
            if (now - last >= 500) {
                (appState as any)._debugLastCrosshairLogTs = now;
                dbg('crosshair-debug', { payload, xAbs: x, chartYRange: appState.chart?.getYRange?.() });
            }
        }
    });

    appState.chart.onClick?.((payload: any) => {
        if (payload?.value && payload.value.length >= 2) {
            const x0 = Number(payload.value[0]);
            if (Number.isFinite(x0) && x0 < 100_000_000_000) {
                const dom = appState.chart?.getXDomain?.();
                if (dom?.min && Number.isFinite(dom.min)) {
                    payload = { ...payload, value: [dom.min + x0, payload.value[1]] };
                }
            }
        }
        updateAnalysisClick(payload);
    });

    appState.analysisBound = true;
}

// ─── Chart page gestures ───────────────────────────────────────────────────

export function initChartPageFilterGesture(): void {
    const pageChart = document.getElementById('page-timeseries');
    if (!pageChart) return;
    if (pageChart.dataset.filterCtxBound) return;

    let lastContextTs = 0;

    pageChart.addEventListener('contextmenu', (e: MouseEvent) => {
        const inPlot = (e.target as HTMLElement)?.closest?.('#main-chart');
        if (inPlot) return;
        const open = window.__edatime?.openFilterForCol;
        if (typeof open !== 'function') return;
        e.preventDefault();

        const now = performance.now();
        const isDoubleContext = (now - lastContextTs) <= 450;
        lastContextTs = now;
        if (!isDoubleContext) return;

        lastContextTs = 0;
        open(null);
    });

    pageChart.dataset.filterCtxBound = '1';
}

// ─── Sidebar pages ─────────────────────────────────────────────────────────

export function initPages(): void {
    const navButtons = Array.from(document.querySelectorAll('.sidebar .nav-item[data-page]')) as HTMLElement[];
    const pages = Array.from(document.querySelectorAll('.page[data-page-name]')) as HTMLElement[];
    if (navButtons.length === 0 || pages.length === 0) return;
    const analyticsViews: Record<string, string> = {
        scatter: 'plot',
        scattermatrix: 'matrix',
        distributions: 'distributions',
    };

    const layout = document.querySelector('.app-layout') as HTMLElement | null;
    const collapseBtn = document.getElementById('sidebar-collapse-btn') as HTMLElement | null;
    if (layout && collapseBtn && !collapseBtn.dataset.bound) {
        collapseBtn.addEventListener('click', () => {
            layout.classList.toggle('sidebar-collapsed');
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
        collapseBtn.dataset.bound = '1';
    }

    function showPage(pageName: string) {
        const analyticsView = analyticsViews[pageName] || null;
        const resolvedPageName = analyticsView ? 'scatter' : pageName;

        for (const p of pages) {
            const hide = p.dataset.pageName !== resolvedPageName;
            p.hidden = hide;
            p.style.display = hide ? 'none' : 'flex';
        }
        for (const btn of navButtons) {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        }

        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(
                new CustomEvent('edatime:page-change', {
                    detail: {
                        page: resolvedPageName,
                        navPage: pageName,
                        analyticsView,
                    },
                }),
            );
        });
    }

    for (const btn of navButtons) {
        btn.addEventListener('click', () => showPage(btn.dataset.page!));
    }

    showPage('timeseries');
}
