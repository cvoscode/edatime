import { formatAnalysisNumber } from '../../utils/format.js';
import { computeBounds } from '../../services/timeseries/filtering.js';
import { chartState } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import type { DataObject } from '../../types/api.js';
import { buildRangeControls } from './rangeControls.js';
import { ColumnFilterModal } from '../../ui/composites/ColumnFilterModal.js';
import { getDropdownValue, setDropdownOptions } from '../../ui/primitives/Dropdown.js';
import type { FilterWorkspace } from './selectionIntent.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

export interface FilterModalControllerDeps {
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, source: string) => void;
    workspace: FilterWorkspace;
    openColumnFilter: (column: string | null) => void;
    getCurrentData: () => DataObject | null;
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage' | 'updateStage' | 'removeStage'>;
}

export interface ColumnFilterModalController {
    open(column: string | null): void;
    dispose(): void;
}

const activeModalBindings = new WeakMap<HTMLElement, ColumnFilterModalController>();

export function initFilterModalController(deps: FilterModalControllerDeps): ColumnFilterModalController {
    const modal = document.getElementById('column-filter-modal') as HTMLElement | null;
    const closeBtn = document.getElementById('column-filter-close-btn');
    const cancelBtn = document.getElementById('column-filter-cancel-btn');
    const applyBtn = document.getElementById('column-filter-apply-btn') as HTMLButtonElement | null;
    const clearBtn = document.getElementById('column-filter-clear-btn') as HTMLButtonElement | null;
    const colSelect = document.getElementById('column-filter-col') as HTMLElement | null;
    const minInput = document.getElementById('column-filter-min') as HTMLInputElement | null;
    const maxInput = document.getElementById('column-filter-max') as HTMLInputElement | null;
    const minRangeInput = document.getElementById('column-filter-min-range') as HTMLInputElement | null;
    const maxRangeInput = document.getElementById('column-filter-max-range') as HTMLInputElement | null;
    const rangeFill = document.getElementById('column-filter-range-fill') as HTMLElement | null;
    const rangeMinValue = document.getElementById('column-filter-range-min-value') as HTMLElement | null;
    const rangeMaxValue = document.getElementById('column-filter-range-max-value') as HTMLElement | null;
    const hint = document.getElementById('column-filter-hint') as HTMLElement | null;
    const openBtn = document.getElementById('column-filter-open-btn');
    const openBtns = [openBtn].filter(Boolean) as HTMLElement[];

    if (
        !modal || !closeBtn || !cancelBtn || !applyBtn || !clearBtn ||
        !colSelect || !minInput || !maxInput || !minRangeInput || !maxRangeInput ||
        !rangeFill || !rangeMinValue || !rangeMaxValue || !hint
    ) return { open: () => {}, dispose: () => {} };

    const existingBinding = activeModalBindings.get(modal);
    if (existingBinding) return existingBinding;

    const modalEl = modal;
    const closeButton = closeBtn;
    const cancelButton = cancelBtn;
    const applyButton = applyBtn;
    const clearButton = clearBtn;
    const columnSelect = colSelect;
    const minTextInput = minInput;
    const maxTextInput = maxInput;
    const minSliderInput = minRangeInput;
    const maxSliderInput = maxRangeInput;
    const rangeFillEl = rangeFill;
    const rangeMinValueEl = rangeMinValue;
    const rangeMaxValueEl = rangeMaxValue;
    const hintEl = hint;
    const abortController = new AbortController();
    const { signal } = abortController;
    const listen = (target: EventTarget, type: string, listener: EventListener) => {
        target.addEventListener(type, listener, { signal });
    };

    let activeBounds: { min: number; max: number } | null = null;

    function setColumnRange(col: string, range: { from: number; to: number }): void {
        const plan = deps.cleaningPlanStore?.getSnapshot();
        if (plan && deps.cleaningPlanStore) {
            const existing = [...plan.stages]
                .reverse()
                .find((stage) => stage.kind === 'columnRange' && stage.sourcePage === 'timeseries' && stage.column === col);
            if (existing) {
                deps.cleaningPlanStore.updateStage(existing.id, {
                    from: range.from,
                    to: range.to,
                    enabled: true,
                } as never);
            } else {
                deps.cleaningPlanStore.addStage({
                    kind: 'columnRange',
                    executionClass: 'polarsExpression',
                    scope: 'row',
                    enabled: true,
                    sourcePage: 'timeseries',
                    label: `Keep ${col} in selected range`,
                    column: col,
                    from: range.from,
                    to: range.to,
                    mode: 'keepInside',
                });
            }
            return;
        }
        const filters = deps.workspace.getSnapshot().filters;
        deps.workspace.setFilters({
            ...filters,
            columnRanges: { ...filters.columnRanges, [col]: range },
        });
    }

    function clearColumnRange(col: string, full: { from: number; to: number }): void {
        const plan = deps.cleaningPlanStore?.getSnapshot();
        if (plan && deps.cleaningPlanStore) {
            for (const stage of plan.stages) {
                if (stage.kind === 'columnRange' && stage.sourcePage === 'timeseries' && stage.column === col) {
                    deps.cleaningPlanStore.removeStage(stage.id);
                }
            }
            return;
        }
        setColumnRange(col, full);
    }

    function setHint(text: string) { hintEl.textContent = text || ''; }

    function formatInputValue(value: number): string {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(2) : '';
    }

    function clampToBounds(value: number, bounds: { min: number; max: number } | null): number {
        if (!bounds || !Number.isFinite(value)) return value;
        return Math.min(bounds.max, Math.max(bounds.min, value));
    }

    function computeSliderStep(bounds: { min: number; max: number } | null): number {
        if (!bounds) return 0.01;
        const span = Math.abs(bounds.max - bounds.min);
        if (!(span > 0)) return 0.01;
        return Math.max(span / 500, 0.01);
    }

    function updateRangeFill(from: number, to: number) {
        rangeMinValueEl.textContent = formatAnalysisNumber(from);
        rangeMaxValueEl.textContent = formatAnalysisNumber(to);

        if (!activeBounds) {
            rangeFillEl.style.left = '0%';
            rangeFillEl.style.width = '0%';
            return;
        }

        const span = activeBounds.max - activeBounds.min;
        if (!(span > 0)) {
            rangeFillEl.style.left = '0%';
            rangeFillEl.style.width = '100%';
            return;
        }

        const leftPct = ((from - activeBounds.min) / span) * 100;
        const rightPct = ((to - activeBounds.min) / span) * 100;
        const clampedLeft = Math.max(0, Math.min(100, leftPct));
        const clampedRight = Math.max(clampedLeft, Math.min(100, rightPct));

        rangeFillEl.style.left = `${clampedLeft}%`;
        rangeFillEl.style.width = `${Math.max(0, clampedRight - clampedLeft)}%`;
    }

    function updateSliderConfig(bounds: { min: number; max: number } | null) {
        activeBounds = bounds;
        if (!bounds) {
            minSliderInput.disabled = true;
            maxSliderInput.disabled = true;
            updateRangeFill(0, 0);
            return;
        }

        const step = computeSliderStep(bounds);
        const min = String(bounds.min);
        const max = String(bounds.max);
        const disabled = !(bounds.max > bounds.min);

        for (const input of [minSliderInput, maxSliderInput]) {
            input.min = min;
            input.max = max;
            input.step = String(step);
            input.disabled = disabled;
        }

        updateRangeFill(bounds.min, bounds.max);
    }

    function syncSliderValues(from: number, to: number) {
        minSliderInput.value = String(from);
        maxSliderInput.value = String(to);
    }

    function syncInputsFromValues(from: number, to: number) {
        minTextInput.value = formatInputValue(from);
        maxTextInput.value = formatInputValue(to);
        syncSliderValues(from, to);
        updateRangeFill(from, to);
    }

    function readInputs(): { from: number; to: number } {
        let from = Number.parseFloat(minTextInput.value);
        let to = Number.parseFloat(maxTextInput.value);

        if (activeBounds) {
            if (!Number.isFinite(from)) from = activeBounds.min;
            if (!Number.isFinite(to)) to = activeBounds.max;
            from = clampToBounds(from, activeBounds);
            to = clampToBounds(to, activeBounds);
        }

        if (from > to) {
            const tmp = from;
            from = to;
            to = tmp;
        }

        return { from, to };
    }

    function syncFromNumericInputs() {
        const { from, to } = readInputs();
        syncInputsFromValues(from, to);
    }

    function syncFromRangeInputs(changed: 'min' | 'max') {
        let from = Number.parseFloat(minSliderInput.value);
        let to = Number.parseFloat(maxSliderInput.value);

        if (changed === 'min' && from > to) to = from;
        if (changed === 'max' && to < from) from = to;

        if (activeBounds) {
            from = clampToBounds(from, activeBounds);
            to = clampToBounds(to, activeBounds);
        }

        syncInputsFromValues(from, to);
    }

    function getFullBoundsForCol(col: string): { min: number; max: number } | null {
        const currentData = deps.getCurrentData();
        const rawValues = currentData?.values?.[col];
        const filteredSeries = (currentData as unknown as { series?: Record<string, { y?: Float64Array }> })?.series;
        const filteredValues = filteredSeries?.[col]?.y;
        const dataBounds = computeBounds(rawValues || filteredValues || new Float64Array(0));
        if (dataBounds) return dataBounds;

        const profile = (datasetState.metadata?.column_profiles || []).find((item) => item?.name === col);
        const min = Number(profile?.min);
        const max = Number(profile?.max);
        if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };

        return null;
    }

    function populateColumns(selectedCol: string | null = null) {
        const cols = deps.workspace.getSnapshot().selection.columns;
        if (cols.length === 0) {
            setDropdownOptions('column-filter-col', [
                { value: '', label: 'No series selected' },
            ], { preferredValue: '' });
            return;
        }
        setDropdownOptions('column-filter-col', cols.map((col) => ({ value: col, label: col })), {
            preferredValue: selectedCol && cols.includes(selectedCol) ? selectedCol : cols[0] || '',
            searchable: true,
        });
    }

    function refreshInputsForCol(col: string) {
        if (!col) {
            minTextInput.value = '';
            maxTextInput.value = '';
            updateSliderConfig(null);
            applyButton.disabled = true;
            clearButton.disabled = true;
            setHint('Select a column to filter.');
            return;
        }
        if (!deps.getCurrentData()) {
            updateSliderConfig(null);
            applyButton.disabled = true;
            clearButton.disabled = true;
            setHint('Data not loaded yet.');
            return;
        }
        const full = getFullBoundsForCol(col);
        if (!full) {
            applyButton.disabled = true;
            clearButton.disabled = true;
            updateSliderConfig(null);
            setHint('No numeric range is available for this column.');
            return;
        }
        const cur = deps.workspace.getSnapshot().filters.columnRanges[col]
            ?? { from: full.min, to: full.max };
        updateSliderConfig(full);
        syncInputsFromValues(cur.from, cur.to);
        applyButton.disabled = false;
        clearButton.disabled = false;
        setHint(`Available range: ${formatAnalysisNumber(full.min)} → ${formatAnalysisNumber(full.max)}`);
    }

    let disposed = false;

    function openModalForCol(col: string | null) {
        if (disposed) return;
        populateColumns(col || getDropdownValue('column-filter-col') || deps.workspace.getSnapshot().selection.columns[0] || null);
        refreshInputsForCol(getDropdownValue('column-filter-col'));
        modalEl.hidden = false;
        try { minTextInput.focus(); } catch { }
    }

    function closeModal() {
        modalEl.hidden = true;
        setHint('');
    }

    for (const btn of openBtns) {
        listen(btn, 'click', () => openModalForCol(null));
    }

    // Wire the modal event shell via the canonical ColumnFilterModal bind surface.
    // Keep all Timeseries-specific logic (slider sync, bounds computation,
    // apply/clear side effects, Y range fitting) in this file.
    ColumnFilterModal({
        bind: {
            root: modalEl,
            applyBtn: applyButton,
            cancelBtn: cancelButton,
            closeBtn: closeButton,
            minInput: minTextInput,
            maxInput: maxTextInput,
            minRangeInput: minSliderInput,
            maxRangeInput: maxSliderInput,
            signal,
        },
        onApply: (from: string, to: string) => {
            const col = getDropdownValue('column-filter-col');
            if (!col) return;
            let fromNum = Number.parseFloat(from);
            let toNum = Number.parseFloat(to);
            const full = getFullBoundsForCol(col);
            if (full) {
                if (!Number.isFinite(fromNum)) fromNum = full.min;
                if (!Number.isFinite(toNum)) toNum = full.max;
            }
            if (!Number.isFinite(fromNum) || !Number.isFinite(toNum)) {
                setHint('Enter a valid min and max.');
                return;
            }
            if (fromNum > toNum) { [fromNum, toNum] = [toNum, fromNum]; }
            setColumnRange(col, { from: fromNum, to: toNum });
            buildRangeControls(deps.workspace, deps.openColumnFilter);
            deps.renderCurrentData();
            chartState.chart?.fitYToData?.();
            const yr = chartState.chart?.getYRange?.();
            if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'filter');
            closeModal();
        },
        onCancel: closeModal,
    });

    listen(columnSelect, 'change', () => refreshInputsForCol(getDropdownValue('column-filter-col')));
    listen(minTextInput, 'input', syncFromNumericInputs);
    listen(maxTextInput, 'input', syncFromNumericInputs);
    listen(minSliderInput, 'input', () => syncFromRangeInputs('min'));
    listen(maxSliderInput, 'input', () => syncFromRangeInputs('max'));

    listen(clearButton, 'click', () => {
        const col = getDropdownValue('column-filter-col');
        const full = getFullBoundsForCol(col);
        if (!col || !full) return;
        clearColumnRange(col, { from: full.min, to: full.max });
        buildRangeControls(deps.workspace, deps.openColumnFilter);
        deps.renderCurrentData();
        chartState.chart?.fitYToData?.();
        const yr = chartState.chart?.getYRange?.();
        if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'filter');
        refreshInputsForCol(col);
    });

    modalEl.dataset.bound = '1';
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        abortController.abort();
        modalEl.hidden = true;
        modalEl.removeAttribute('data-bound');
        activeModalBindings.delete(modalEl);
    };
    const controller = { open: openModalForCol, dispose };
    activeModalBindings.set(modalEl, controller);
    return controller;
}
