/**
 * Adaptive filter gesture — Ctrl+click line drawing on the main chart.
 * Exports initAdaptiveFilterGesture(container, deps) and standalone helpers.
 * Consumed by app.ts.
 */

import { SERIES_COLORS } from '../utils/seriesColors.js';
import { applyFilterIntentToData, buildAdaptiveLineY } from '../services/timeseries/filtering.js';
import {
    appendAdaptiveLineFilter,
    setAdaptiveFilterColumn,
    setPendingAdaptivePoint,
} from '../store/index.js';
import type { AdaptiveLineFilter } from '../types.js';
import { appState } from '../store/appStateCompat.js';
import type { WorkspaceStore, WorkspaceSnapshot } from '../workspace/workspaceStore.js';

export function buildAdaptiveFilterFromPoints(
    column: string,
    firstPoint: { x: number; y: number },
    secondPoint: { x: number; y: number },
    intent: Pick<WorkspaceSnapshot, 'selection' | 'filters'>,
): AdaptiveLineFilter | null {
    if (!column || !firstPoint || !secondPoint) return null;
    if (!appState.lastFetchedData) return null;
    const filtered = applyFilterIntentToData(appState.lastFetchedData, intent);
    const columnData = filtered.series?.[column] || filtered.values?.[column];
    const xs = columnData?.x;
    const ys = columnData?.y;
    if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null;

    const x1 = Number(firstPoint.x);
    const y1 = Number(firstPoint.y);
    const x2 = Number(secondPoint.x);
    const y2 = Number(secondPoint.y);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2) || x1 === x2) return null;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const tempFilter: AdaptiveLineFilter = { id: 'temp', column, x1, y1, x2, y2, keepAbove: true };
    let above = 0;
    let below = 0;
    for (let idx = 0; idx < xs.length; idx++) {
        const x = Number(xs[idx]);
        const y = Number(ys[idx]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
        const lineY = buildAdaptiveLineY(tempFilter, x);
        if (lineY == null || !Number.isFinite(lineY)) continue;
        if (y >= lineY) above += 1; else below += 1;
    }

    return {
        id: `adaptive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        column,
        x1, y1, x2, y2,
        keepAbove: above > below,
    };
}

export function initAdaptiveFilterGesture(
    deps: {
        workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'>;
        buildColumnToggles: () => void;
        buildRangeControls: () => void;
        renderCurrentData: () => void;
        updateAnalysisYRange: (min: number, max: number, sourceKind: string) => void;
    },
): () => void {
    const container = document.getElementById('main-chart') as (HTMLElement & { dataset: DOMStringMap }) | null;
    if (!container || container.dataset.adaptiveBound) return () => { };

    let _activePicker: HTMLElement | null = null;
    let _firstPoint: { x: number; y: number } | null = null;
    let _secondPoint: { x: number; y: number } | null = null;
    let _lastClickX = 0;
    let _lastClickY = 0;

    const dismissPicker = () => { _activePicker?.remove(); _activePicker = null; };

    const cancelPending = () => {
        _firstPoint = null;
        _secondPoint = null;
        setPendingAdaptivePoint(null);
        appState.chart?.requestOverlayRender?.();
    };

    const updateOverlay = () => {
        if (!_firstPoint) { setPendingAdaptivePoint(null); return; }
        const col = appState.adaptiveFilterColumn ?? (appState.selectedCols?.[0] ?? '');
        if (_secondPoint) {
            setPendingAdaptivePoint({ column: col, x: _firstPoint.x, y: _firstPoint.y, x2: _secondPoint.x, y2: _secondPoint.y });
        } else {
            setPendingAdaptivePoint({ column: col, x: _firstPoint.x, y: _firstPoint.y });
        }
        appState.chart?.requestOverlayRender?.();
    };

    const applyFilterForColumn = (column: string, p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        setAdaptiveFilterColumn(column);
        const snapshot = deps.workspace.getSnapshot();
        const filter = buildAdaptiveFilterFromPoints(column, p1, p2, snapshot);
        if (!filter) return;
        const filters = snapshot.filters;
        deps.workspace.setFilters({
            ...filters,
            adaptiveLines: [...filters.adaptiveLines, filter],
        });
        appendAdaptiveLineFilter(filter);
        // Apply locally: rebuild range controls + re-render chart
        deps.buildRangeControls();
        deps.renderCurrentData();
        appState.chart?.requestOverlayRender?.();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'adaptive');
        deps.buildColumnToggles();
    };

    const showTracePicker = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        const cols = appState.selectedCols;
        if (!cols?.length) return;
        if (cols.length === 1) { applyFilterForColumn(cols[0], p1, p2); return; }

        dismissPicker();
        const picker = document.createElement('div');
        picker.className = 'adaptive-trace-picker';
        picker.style.left = `${_lastClickX}px`;
        picker.style.top = `${_lastClickY}px`;

        const label = document.createElement('div');
        label.className = 'adaptive-trace-picker__label';
        label.textContent = 'Filter which trace?';
        picker.appendChild(label);

        cols.forEach((col, idx) => {
            const color = appState.seriesColors?.[col] ?? SERIES_COLORS[idx % SERIES_COLORS.length];
            const isCurrentTarget = col === appState.adaptiveFilterColumn;
            const btn = document.createElement('button');
            btn.className = 'adaptive-trace-picker__option' + (isCurrentTarget ? ' current' : '');
            btn.type = 'button';
            btn.style.setProperty('--pick-accent', color);
            btn.textContent = col;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissPicker();
                applyFilterForColumn(col, p1, p2);
            });
            picker.appendChild(btn);
        });

        document.body.appendChild(picker);
        _activePicker = picker;

        const onOutside = (e: MouseEvent) => {
            if (!picker.contains(e.target as Node)) {
                dismissPicker();
                document.removeEventListener('click', onOutside, true);
            }
        };
        document.addEventListener('click', onOutside, true);
    };

    const clickHandler = (event: MouseEvent) => {
        if (!event.ctrlKey || event.button !== 0) return;
        const cols = appState.selectedCols;
        if (!cols?.length) return;
        const point = appState.chart?.cssPointToData?.(event.clientX, event.clientY) ?? null;
        if (!point) return;
        event.preventDefault(); event.stopPropagation();
        _lastClickX = event.clientX;
        _lastClickY = event.clientY;
        if (!_firstPoint) { _firstPoint = point; _secondPoint = null; }
        else { _secondPoint = point; }
        updateOverlay();
    };

    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') { dismissPicker(); cancelPending(); } };
    const onCtrlUp = (e: KeyboardEvent) => {
        if (e.key !== 'Control') return;
        if (_firstPoint && _secondPoint) { const p1 = _firstPoint, p2 = _secondPoint; cancelPending(); showTracePicker(p1, p2); }
        else { cancelPending(); }
    };
    const onAdaptiveChange = () => {
        if (!appState.lastFetchedData) return;
        deps.buildRangeControls(); deps.renderCurrentData();
        appState.chart?.requestOverlayRender?.(); appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'adaptive');
    };

    container.addEventListener('click', clickHandler, true);
    window.addEventListener('keydown', onEscape);
    window.addEventListener('keyup', onCtrlUp);
    window.addEventListener('edatime:adaptive-filters-change', onAdaptiveChange as EventListener);
    container.dataset.adaptiveBound = '1';

    return () => {
        container.removeEventListener('click', clickHandler, true);
        window.removeEventListener('keydown', onEscape);
        window.removeEventListener('keyup', onCtrlUp);
        window.removeEventListener('edatime:adaptive-filters-change', onAdaptiveChange as EventListener);
    };
}
