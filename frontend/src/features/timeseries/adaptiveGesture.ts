/**
 * Adaptive filter gesture — Ctrl+click line drawing on the main chart.
 * Exports the Timeseries-only Ctrl+click interaction and its pure filter
 * construction helper. Application bootstrap consumes this through the
 * Timeseries public index.
 */

import { getSeriesColor } from '../../utils/seriesColors.js';
import { applyFilterIntentToData, buildAdaptiveLineY } from '../../services/timeseries/filtering.js';
import {
    setAdaptiveFilterColumn,
    setPendingAdaptivePoint,
    uiState,
} from '../../store/uiState.js';
import { chartState } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import type { DataObject } from '../../types/api.js';
import type { AdaptiveLineFilter } from '../../types/store.js';
import type { WorkspaceStore, WorkspaceSnapshot } from '../../contracts/workspace.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

export function buildAdaptiveFilterFromPoints(
    data: DataObject | null,
    column: string,
    firstPoint: { x: number; y: number },
    secondPoint: { x: number; y: number },
    intent: Pick<WorkspaceSnapshot, 'selection' | 'filters'>,
): AdaptiveLineFilter | null {
    if (!column || !firstPoint || !secondPoint) return null;
    if (!data) return null;
    const filtered = applyFilterIntentToData(data, intent);
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
        workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'subscribe'>;
        buildColumnToggles: () => void;
        buildRangeControls: () => void;
        renderCurrentData: () => void;
        getCurrentData: () => DataObject | null;
        updateAnalysisYRange: (min: number, max: number, sourceKind: string) => void;
        cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage'>;
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
        chartState.chart?.requestOverlayRender?.();
    };

    const updateOverlay = () => {
        if (!_firstPoint) { setPendingAdaptivePoint(null); return; }
        const col = uiState.adaptiveFilterColumn ?? (deps.workspace.getSnapshot().selection.columns[0] ?? '');
        if (_secondPoint) {
            setPendingAdaptivePoint({ column: col, x: _firstPoint.x, y: _firstPoint.y, x2: _secondPoint.x, y2: _secondPoint.y });
        } else {
            setPendingAdaptivePoint({ column: col, x: _firstPoint.x, y: _firstPoint.y });
        }
        chartState.chart?.requestOverlayRender?.();
    };

    const applyFilterForColumn = (column: string, p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        setAdaptiveFilterColumn(column);
        const snapshot = deps.workspace.getSnapshot();
        const filter = buildAdaptiveFilterFromPoints(deps.getCurrentData(), column, p1, p2, snapshot);
        if (!filter) return;
        if (deps.cleaningPlanStore?.getSnapshot()) {
            deps.cleaningPlanStore.addStage({
                kind: 'adaptiveLine',
                executionClass: 'polarsExpression',
                scope: 'row',
                enabled: true,
                sourcePage: 'timeseries',
                label: `${filter.keepAbove ? 'Keep above' : 'Keep below'} adaptive line for ${column}`,
                column,
                x1Ms: filter.x1,
                y1: filter.y1,
                x2Ms: filter.x2,
                y2: filter.y2,
                keepAbove: filter.keepAbove,
                applyWithinSegmentOnly: true,
            });
            deps.buildColumnToggles();
            return;
        }
        const filters = snapshot.filters;
        deps.workspace.setFilters({
            ...filters,
            adaptiveLines: [...filters.adaptiveLines, filter],
        });
        deps.buildColumnToggles();
    };

    const showTracePicker = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        const cols = deps.workspace.getSnapshot().selection.columns;
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

        cols.forEach((col, selectionIndex) => {
            // Chips and chart series use the stable dataset column order, not
            // the transient order in which a user selected visible traces.
            // Keeping that ordinal here prevents OT/MUFL from borrowing each
            // other's colors in the adaptive-filter picker.
            const datasetIndex = datasetState.numericCols.indexOf(col);
            const color = getSeriesColor(col, datasetIndex >= 0 ? datasetIndex : selectionIndex);
            const isCurrentTarget = col === uiState.adaptiveFilterColumn;
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
        const cols = deps.workspace.getSnapshot().selection.columns;
        if (!cols?.length) return;
        const point = chartState.chart?.cssPointToData?.(event.clientX, event.clientY) ?? null;
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
        if (!deps.getCurrentData()) return;
        deps.buildRangeControls(); deps.renderCurrentData();
        chartState.chart?.requestOverlayRender?.(); chartState.chart?.fitYToData?.();
        const yr = chartState.chart?.getYRange?.();
        if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'adaptive');
    };

    const adaptiveLinesSignature = (snapshot: WorkspaceSnapshot): string => JSON.stringify(
        snapshot.filters.adaptiveLines.map((filter) => [
            filter.id, filter.column, filter.x1, filter.y1, filter.x2, filter.y2, filter.keepAbove,
        ]),
    );
    let previousAdaptiveLines = adaptiveLinesSignature(deps.workspace.getSnapshot() as WorkspaceSnapshot);
    const unsubscribeWorkspace = deps.workspace.subscribe((snapshot) => {
        const nextAdaptiveLines = adaptiveLinesSignature(snapshot);
        if (nextAdaptiveLines === previousAdaptiveLines) return;
        previousAdaptiveLines = nextAdaptiveLines;
        onAdaptiveChange();
    });

    container.addEventListener('click', clickHandler, true);
    window.addEventListener('keydown', onEscape);
    window.addEventListener('keyup', onCtrlUp);
    container.dataset.adaptiveBound = '1';

    return () => {
        container.removeEventListener('click', clickHandler, true);
        window.removeEventListener('keydown', onEscape);
        window.removeEventListener('keyup', onCtrlUp);
        unsubscribeWorkspace();
    };
}
