/**
 * Adaptive filter gesture — Ctrl+click line drawing on the main chart.
 * Exports the Timeseries-only Ctrl+click interaction and its pure filter
 * construction helper. Application bootstrap consumes this through the
 * Timeseries public index.
 */

import { getColumnSeriesColor } from '../../utils/seriesColors.js';
import { applyFilterIntentToData, buildAdaptiveLineY } from '../../services/timeseries/filtering.js';
import {
    setAdaptiveFilterColumn,
    setPendingAdaptivePoint,
    uiState,
} from '../../store/uiState.js';
import { chartState } from '../../store/chartState.js';
import type { DataObject } from '../../types/api.js';
import type { AdaptiveLineFilter } from '../../types/store.js';
import type { WorkspaceStore, WorkspaceSnapshot } from '../../contracts/workspace.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

/** Keep the adaptive picker inside the visible viewport, preferring the click's lower-right side. */
export function positionAdaptivePicker(
    anchor: { x: number; y: number },
    picker: { width: number; height: number },
    viewport: { width: number; height: number },
): { left: number; top: number } {
    const padding = 12;
    const gap = 8;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
    const left = anchor.x + picker.width + gap > viewport.width - padding
        ? anchor.x - picker.width - gap
        : anchor.x + gap;
    const top = anchor.y + picker.height + gap > viewport.height - padding
        ? anchor.y - picker.height - gap
        : anchor.y + gap;
    return {
        left: clamp(left, padding, viewport.width - picker.width - padding),
        top: clamp(top, padding, viewport.height - picker.height - padding),
    };
}

export function buildAdaptiveFilterFromPoints(
    data: DataObject | null,
    column: string,
    firstPoint: { x: number; y: number },
    secondPoint: { x: number; y: number },
    intent: Pick<WorkspaceSnapshot, 'selection' | 'filters'>,
    keepAboveOverride?: boolean,
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
        keepAbove: keepAboveOverride ?? above > below,
    };
}

export function initAdaptiveFilterGesture(
    deps: {
        workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'subscribe'>
            & Partial<Pick<WorkspaceStore, 'subscribeSelector'>>;
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
    let removeOutsidePickerListener: (() => void) | null = null;

    const dismissPicker = () => {
        removeOutsidePickerListener?.();
        removeOutsidePickerListener = null;
        _activePicker?.remove();
        _activePicker = null;
    };

    const colorForColumn = (column: string): string => getColumnSeriesColor(column);

    const openPicker = (picker: HTMLElement) => {
        dismissPicker();
        picker.style.left = '0px';
        picker.style.top = '0px';
        document.body.appendChild(picker);
        const rect = picker.getBoundingClientRect();
        const position = positionAdaptivePicker(
            { x: _lastClickX, y: _lastClickY },
            { width: rect.width, height: rect.height },
            { width: window.innerWidth, height: window.innerHeight },
        );
        picker.style.left = `${position.left}px`;
        picker.style.top = `${position.top}px`;
        _activePicker = picker;
        const onOutside = (event: MouseEvent) => {
            if (!picker.contains(event.target as Node)) dismissPicker();
        };
        document.addEventListener('click', onOutside, true);
        removeOutsidePickerListener = () => document.removeEventListener('click', onOutside, true);
    };

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

    const applyFilterForColumn = (column: string, p1: { x: number; y: number }, p2: { x: number; y: number }, keepAbove: boolean) => {
        setAdaptiveFilterColumn(column);
        const snapshot = deps.workspace.getSnapshot();
        const filter = buildAdaptiveFilterFromPoints(deps.getCurrentData(), column, p1, p2, snapshot, keepAbove);
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

    const showDirectionPicker = (column: string, p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        const recommendation = buildAdaptiveFilterFromPoints(deps.getCurrentData(), column, p1, p2, deps.workspace.getSnapshot());
        if (!recommendation) return;
        const picker = document.createElement('div');
        picker.className = 'adaptive-trace-picker adaptive-trace-picker--direction';
        const label = document.createElement('div');
        label.className = 'adaptive-trace-picker__label';
        label.textContent = `Filter ${column}: keep which side?`;
        const suggestion = document.createElement('p');
        suggestion.className = 'adaptive-trace-picker__suggestion';
        suggestion.textContent = `Suggested: keep ${recommendation.keepAbove ? 'above' : 'below'} the line`;
        picker.append(label, suggestion);
        for (const option of [{ keepAbove: true, label: 'Keep above' }, { keepAbove: false, label: 'Keep below' }]) {
            const button = document.createElement('button');
            button.className = 'adaptive-trace-picker__option' + (option.keepAbove === recommendation.keepAbove ? ' current' : '');
            button.type = 'button';
            button.style.setProperty('--pick-accent', colorForColumn(column));
            button.textContent = option.label;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                dismissPicker();
                applyFilterForColumn(column, p1, p2, option.keepAbove);
            });
            picker.appendChild(button);
        }
        openPicker(picker);
    };

    const showTracePicker = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        const cols = deps.workspace.getSnapshot().selection.columns;
        if (!cols?.length) return;
        if (cols.length === 1) { showDirectionPicker(cols[0], p1, p2); return; }

        const picker = document.createElement('div');
        picker.className = 'adaptive-trace-picker';

        const label = document.createElement('div');
        label.className = 'adaptive-trace-picker__label';
        label.textContent = 'Filter which trace?';
        picker.appendChild(label);

        cols.forEach((col) => {
            const color = colorForColumn(col);
            const isCurrentTarget = col === uiState.adaptiveFilterColumn;
            const btn = document.createElement('button');
            btn.className = 'adaptive-trace-picker__option' + (isCurrentTarget ? ' current' : '');
            btn.type = 'button';
            btn.style.setProperty('--pick-accent', color);
            btn.textContent = col;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissPicker();
                showDirectionPicker(col, p1, p2);
            });
            picker.appendChild(btn);
        });

        openPicker(picker);
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
    const unsubscribeWorkspace = deps.workspace.subscribeSelector
        ? deps.workspace.subscribeSelector(adaptiveLinesSignature, onAdaptiveChange)
        : deps.workspace.subscribe((snapshot) => {
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
