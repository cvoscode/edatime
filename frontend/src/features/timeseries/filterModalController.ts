import { formatAnalysisNumber } from '../../utils/format.js';
import { computeBounds } from '../../services/timeseries/filtering.js';
import { primaryChart } from '../../charts/primaryChart.js';
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
    rebuildColumns?: () => void;
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
    const rangeControl = document.getElementById('column-filter-range-control') as HTMLElement | null;
    const rangeFill = document.getElementById('column-filter-range-fill') as HTMLElement | null;
    const rangeMinValue = document.getElementById('column-filter-range-min-value') as HTMLElement | null;
    const rangeMaxValue = document.getElementById('column-filter-range-max-value') as HTMLElement | null;
    const hint = document.getElementById('column-filter-hint') as HTMLElement | null;
    const openBtn = document.getElementById('column-filter-open-btn');
    const openBtns = [openBtn].filter(Boolean) as HTMLElement[];

    if (
        !modal || !closeBtn || !cancelBtn || !applyBtn || !clearBtn ||
        !colSelect || !minInput || !maxInput || !minRangeInput || !maxRangeInput || !rangeControl ||
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
    const rangeControlEl = rangeControl;
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
    let rangeDrag: { pointerId: number; handle: 'min' | 'max' } | null = null;
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
            // The plan is the durable, server-side representation, while the
            // workspace drives the Signals chips and client-side render mask.
            // Keep both in step so applying a range does not make it appear
            // to disappear from Signals.
            const filters = deps.workspace.getSnapshot().filters;
            deps.workspace.setFilters({
                ...filters,
                columnRanges: { ...filters.columnRanges, [col]: range },
            });
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
            const filters = deps.workspace.getSnapshot().filters;
            const { [col]: _removed, ...columnRanges } = filters.columnRanges;
            deps.workspace.setFilters({ ...filters, columnRanges });
            return;
        }
        setColumnRange(col, full);
    }

    function setHint(text: string) { hintEl.textContent = text || ''; }

    function boundsHint(bounds: { min: number; max: number }, column: string): string {
        const scope = deps.workspace.getSnapshot().filters.columnRanges[column]
            ? 'filter'
            : 'source profile';
        return `Bounds scope: ${scope} (${formatAnalysisNumber(bounds.min)} → ${formatAnalysisNumber(bounds.max)}). Trace filters replace excluded values with null; timestamps and other traces stay unchanged. The chart viewport does not redefine these bounds. Text values are preserved exactly.`;
    }

    function setOutOfRangeHint(value: number, bounds: { min: number; max: number }): void {
        hintEl.replaceChildren();
        hintEl.append(document.createTextNode(
            `Value ${formatAnalysisNumber(value)} outside data range (${formatAnalysisNumber(bounds.min)} to ${formatAnalysisNumber(bounds.max)}). `,
        ));
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'btn btn-ghost btn-sm';
        reset.textContent = 'Reset';
        reset.addEventListener('click', () => {
            syncInputsFromValues(bounds.min, bounds.max);
            validateTextInputs();
            minTextInput.focus();
        }, { signal });
        hintEl.append(reset);
    }

    function formatInputValue(value: number): string {
        const n = Number(value);
        // Keep a readable two-decimal display while storing the canonical
        // value in a data attribute below. This preserves the existing compact
        // control while reopening/applying an unchanged rule retains every bit
        // of the original boundary precision.
        return Number.isFinite(n) ? n.toFixed(2) : '';
    }

    function isWithinDisplayedBounds(value: number, bounds: { min: number; max: number }): boolean {
        // Text fields expose two decimals. Validate at that same precision so
        // a displayed endpoint such as 36.44 remains valid when the exact
        // profile maximum is 36.438999.... Untouched endpoints still retain
        // their canonical precision through data-exact-value on apply.
        return value >= bounds.min - 0.005 && value <= bounds.max + 0.005;
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

    function syncTextInput(input: HTMLInputElement, value: number) {
        input.value = formatInputValue(value);
        input.dataset.exactValue = String(value);
        input.dataset.exactDisplay = input.value;
        input.title = `Stored ${input === minTextInput ? 'lower' : 'upper'} bound: ${input.value}`;
    }

    function readExactBound(input: HTMLInputElement, fallback: number): number {
        const value = input.value === input.dataset.exactDisplay
            ? Number.parseFloat(input.dataset.exactValue ?? '')
            : Number.parseFloat(input.value);
        return Number.isFinite(value) ? value : fallback;
    }

    function syncInputsFromValues(from: number, to: number) {
        syncTextInput(minTextInput, from);
        syncTextInput(maxTextInput, to);
        syncSliderValues(from, to);
        updateRangeFill(from, to);
    }

    function readInputs(): { from: number; to: number; valid: boolean; reason?: 'number' | 'order' | 'bounds'; outsideValue?: number } {
        const fromText = minTextInput.value.trim();
        const toText = maxTextInput.value.trim();
        if ((fromText && !Number.isFinite(Number.parseFloat(fromText)))
            || (toText && !Number.isFinite(Number.parseFloat(toText)))) {
            return { from: Number.NaN, to: Number.NaN, valid: false, reason: 'number' };
        }
        let from = Number.parseFloat(fromText);
        let to = Number.parseFloat(toText);

        if (activeBounds) {
            if (!Number.isFinite(from)) from = activeBounds.min;
            if (!Number.isFinite(to)) to = activeBounds.max;
        }

        if (!Number.isFinite(from) || !Number.isFinite(to)) {
            return { from, to, valid: false, reason: 'number' };
        }
        if (from >= to) return { from, to, valid: false, reason: 'order' };
        if (activeBounds && !isWithinDisplayedBounds(from, activeBounds)) {
            return { from, to, valid: false, reason: 'bounds', outsideValue: from };
        }
        if (activeBounds && !isWithinDisplayedBounds(to, activeBounds)) {
            return { from, to, valid: false, reason: 'bounds', outsideValue: to };
        }
        return { from, to, valid: true };
    }

    function validateTextInputs(): { from: number; to: number } | null {
        const result = readInputs();
        minTextInput.setAttribute('aria-invalid', String(!result.valid));
        maxTextInput.setAttribute('aria-invalid', String(!result.valid));
        applyButton.disabled = !result.valid;
        if (!result.valid) {
            if (result.reason === 'order') setHint('Min must be less than Max');
            else if (result.reason === 'bounds' && activeBounds && Number.isFinite(result.outsideValue)) {
                setOutOfRangeHint(result.outsideValue!, activeBounds);
            } else setHint('Enter valid numeric bounds, or leave a bound empty to use the source-profile edge.');
            return null;
        }
        if (activeBounds) setHint(boundsHint(activeBounds, getDropdownValue('column-filter-col')));
        return { from: result.from, to: result.to };
    }

    function syncFromNumericInputs() {
        const values = validateTextInputs();
        // Preserve the user's exact typed text. Only the slider and fill need
        // to follow it while the range is valid.
        if (!values) return;
        syncSliderValues(values.from, values.to);
        updateRangeFill(values.from, values.to);
    }

    function syncFromRangeInputs(changed: 'min' | 'max') {
        // Native sliders round to their step. Read the untouched endpoint from
        // its text field so dragging one handle preserves the other exactly.
        let from = changed === 'min'
            ? Number.parseFloat(minSliderInput.value)
            : readExactBound(minTextInput, activeBounds?.min ?? Number.NaN);
        let to = changed === 'max'
            ? Number.parseFloat(maxSliderInput.value)
            : readExactBound(maxTextInput, activeBounds?.max ?? Number.NaN);

        // Each end of the dual slider owns only its corresponding bound.
        // Crossing clamps the active handle instead of pushing the other one.
        if (changed === 'min' && from > to) from = to;
        if (changed === 'max' && to < from) to = from;

        if (activeBounds) {
            from = clampToBounds(from, activeBounds);
            to = clampToBounds(to, activeBounds);
        }

        if (changed === 'min') syncTextInput(minTextInput, from);
        else syncTextInput(maxTextInput, to);
        syncSliderValues(from, to);
        updateRangeFill(from, to);
        validateTextInputs();
    }

    function setActiveRangeHandle(handle: 'min' | 'max') {
        minSliderInput.classList.toggle('is-active', handle === 'min');
        maxSliderInput.classList.toggle('is-active', handle === 'max');
    }

    function valueFromRangePointer(clientX: number): number | null {
        if (!activeBounds || !(activeBounds.max > activeBounds.min)) return null;

        const rect = rangeControlEl.getBoundingClientRect();
        const handleRadius = 8;
        const usableWidth = Math.max(1, rect.width - (handleRadius * 2));
        const position = Math.max(0, Math.min(1, (clientX - rect.left - handleRadius) / usableWidth));
        const rawValue = activeBounds.min + (position * (activeBounds.max - activeBounds.min));
        const step = Number.parseFloat(minSliderInput.step) || computeSliderStep(activeBounds);
        const steppedValue = activeBounds.min + (Math.round((rawValue - activeBounds.min) / step) * step);
        return clampToBounds(steppedValue, activeBounds);
    }

    function moveNearestRangeHandle(event: PointerEvent) {
        if (event.button !== 0 || rangeDrag || minSliderInput.disabled || maxSliderInput.disabled) return;
        if (event.target === minSliderInput || event.target === maxSliderInput) return;

        const value = valueFromRangePointer(event.clientX);
        if (value === null) return;

        const from = Number.parseFloat(minSliderInput.value);
        const to = Number.parseFloat(maxSliderInput.value);
        const minDistance = Math.abs(value - from);
        const maxDistance = Math.abs(value - to);
        const handle: 'min' | 'max' = minDistance === maxDistance
            ? (value <= from ? 'min' : 'max')
            : (minDistance < maxDistance ? 'min' : 'max');
        const input = handle === 'min' ? minSliderInput : maxSliderInput;

        setActiveRangeHandle(handle);
        input.value = String(value);
        syncFromRangeInputs(handle);
        input.focus();
        rangeDrag = { pointerId: event.pointerId, handle };
        rangeControlEl.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    function moveDraggedRangeHandle(event: PointerEvent) {
        if (!rangeDrag || event.pointerId !== rangeDrag.pointerId) return;
        const value = valueFromRangePointer(event.clientX);
        if (value === null) return;
        const input = rangeDrag.handle === 'min' ? minSliderInput : maxSliderInput;
        input.value = String(value);
        syncFromRangeInputs(rangeDrag.handle);
        event.preventDefault();
    }

    function stopRangeDrag() {
        if (!rangeDrag) return;
        const { pointerId } = rangeDrag;
        rangeDrag = null;
        if (rangeControlEl.hasPointerCapture?.(pointerId)) rangeControlEl.releasePointerCapture(pointerId);
    }

    function endRangeDrag(event: PointerEvent) {
        if (event.pointerId === rangeDrag?.pointerId) stopRangeDrag();
    }

    function getFullBoundsForCol(col: string): { min: number; max: number } | null {
        // Profile bounds describe the source/effective pipeline distribution.
        // The currently fetched chart window may be zoomed, downsampled, or
        // lookaround-expanded and must never silently redefine a saved rule.
        const profile = (deps.workspace.getSnapshot().dataset.metadata?.column_profiles || []).find((item) => item?.name === col);
        const profileMin = Number(profile?.min);
        const profileMax = Number(profile?.max);
        let bounds: { min: number; max: number } | null = null;
        if (Number.isFinite(profileMin) && Number.isFinite(profileMax) && profileMax >= profileMin) {
            bounds = { min: profileMin, max: profileMax };
        }
        if (!bounds) {
            const currentData = deps.getCurrentData();
            const rawValues = currentData?.values?.[col];
            const filteredSeries = (currentData as unknown as { series?: Record<string, { y?: Float64Array }> })?.series;
            const filteredValues = filteredSeries?.[col]?.y;
            bounds = computeBounds(rawValues || filteredValues || new Float64Array(0));
        }

        // When deferred profile metadata is unavailable, currentData may
        // already reflect this saved filter. Its observed min/max can then be
        // narrower than the rule that produced it (for example 5.03–11.98 for
        // a saved 5.00–12.00 range). Keep the canonical saved endpoints inside
        // the validation envelope so reopening and applying an unchanged rule
        // is always a valid no-op.
        const savedRange = deps.workspace.getSnapshot().filters.columnRanges[col];
        const savedFrom = Number(savedRange?.from);
        const savedTo = Number(savedRange?.to);
        if (Number.isFinite(savedFrom) && Number.isFinite(savedTo)) {
            const savedMin = Math.min(savedFrom, savedTo);
            const savedMax = Math.max(savedFrom, savedTo);
            bounds = bounds
                ? { min: Math.min(bounds.min, savedMin), max: Math.max(bounds.max, savedMax) }
                : { min: savedMin, max: savedMax };
        }

        return bounds;
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
        stopRangeDrag();
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
        clearButton.disabled = false;
        validateTextInputs();
    }

    let disposed = false;

    function openModalForCol(col: string | null) {
        if (disposed) return;
        populateColumns(col || getDropdownValue('column-filter-col') || deps.workspace.getSnapshot().selection.columns[0] || null);
        refreshInputsForCol(getDropdownValue('column-filter-col'));
        modalEl.hidden = false;
        try { minTextInput.focus(); } catch { /* focus is a convenience; the input may be detached */ }
    }

    function closeModal() {
        stopRangeDrag();
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
            const validated = validateTextInputs();
            if (!validated) return;
            let fromNum = validated.from;
            let toNum = validated.to;
            if (from === minTextInput.dataset.exactDisplay && minTextInput.dataset.exactValue) {
                fromNum = Number(minTextInput.dataset.exactValue);
            }
            if (to === maxTextInput.dataset.exactDisplay && maxTextInput.dataset.exactValue) {
                toNum = Number(maxTextInput.dataset.exactValue);
            }
            const full = getFullBoundsForCol(col);
            if (full) {
                if (!Number.isFinite(fromNum)) fromNum = full.min;
                if (!Number.isFinite(toNum)) toNum = full.max;
            }
            if (!Number.isFinite(fromNum) || !Number.isFinite(toNum)) {
                setHint('Enter a valid min and max.');
                return;
            }
            setColumnRange(col, { from: fromNum, to: toNum });
            deps.rebuildColumns?.();
            buildRangeControls(deps.workspace, deps.openColumnFilter);
            deps.renderCurrentData();
            primaryChart.current?.fitYToData?.();
            const yr = primaryChart.current?.getYRange?.();
            if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'filter');
            closeModal();
        },
        onCancel: closeModal,
    });

    listen(columnSelect, 'change', () => refreshInputsForCol(getDropdownValue('column-filter-col')));
    listen(minTextInput, 'input', syncFromNumericInputs);
    listen(maxTextInput, 'input', syncFromNumericInputs);
    listen(minSliderInput, 'input', () => {
        setActiveRangeHandle('min');
        syncFromRangeInputs('min');
    });
    listen(maxSliderInput, 'input', () => {
        setActiveRangeHandle('max');
        syncFromRangeInputs('max');
    });
    listen(minSliderInput, 'focus', () => setActiveRangeHandle('min'));
    listen(maxSliderInput, 'focus', () => setActiveRangeHandle('max'));
    listen(rangeControlEl, 'pointerdown', moveNearestRangeHandle as EventListener);
    listen(rangeControlEl, 'pointermove', moveDraggedRangeHandle as EventListener);
    listen(rangeControlEl, 'pointerup', endRangeDrag as EventListener);
    listen(rangeControlEl, 'pointercancel', endRangeDrag as EventListener);
    listen(rangeControlEl, 'lostpointercapture', endRangeDrag as EventListener);

    listen(clearButton, 'click', () => {
        const col = getDropdownValue('column-filter-col');
        const full = getFullBoundsForCol(col);
        if (!col || !full) return;
        clearColumnRange(col, { from: full.min, to: full.max });
        deps.rebuildColumns?.();
        buildRangeControls(deps.workspace, deps.openColumnFilter);
        deps.renderCurrentData();
        primaryChart.current?.fitYToData?.();
        const yr = primaryChart.current?.getYRange?.();
        if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'filter');
        refreshInputsForCol(col);
    });

    modalEl.dataset.bound = '1';
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        stopRangeDrag();
        abortController.abort();
        modalEl.hidden = true;
        modalEl.removeAttribute('data-bound');
        activeModalBindings.delete(modalEl);
    };
    const controller = { open: openModalForCol, dispose };
    activeModalBindings.set(modalEl, controller);
    return controller;
}
