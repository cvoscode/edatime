import { formatAnalysisNumber } from '../../utils/format.js';
import { computeBounds } from '../../services/timeseries/filtering.js';
import { appStateComposite as appState } from '../../store/index.js';
import { buildRangeControls } from './rangeControls.js';

export interface FilterModalControllerDeps {
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, source: string) => void;
}

export function initFilterModalController(deps: FilterModalControllerDeps): void {
    const modal = document.getElementById('column-filter-modal') as HTMLElement | null;
    const closeBtn = document.getElementById('column-filter-close-btn');
    const cancelBtn = document.getElementById('column-filter-cancel-btn');
    const applyBtn = document.getElementById('column-filter-apply-btn') as HTMLButtonElement | null;
    const clearBtn = document.getElementById('column-filter-clear-btn') as HTMLButtonElement | null;
    const colSelect = document.getElementById('column-filter-col') as HTMLSelectElement | null;
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
    ) return;
    if (modal.dataset.bound) return;

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

    let activeBounds: { min: number; max: number } | null = null;

    function emitColumnFiltersChange() {
        window.dispatchEvent(new CustomEvent('edatime:column-filters-change'));
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
        const rawValues = appState.lastFetchedData?.values?.[col];
        const filteredSeries = (appState.lastFetchedData as unknown as { series?: Record<string, { y?: Float64Array }> })?.series;
        const filteredValues = filteredSeries?.[col]?.y;
        const dataBounds = computeBounds(rawValues || filteredValues || new Float64Array(0));
        if (dataBounds) return dataBounds;

        const profile = (appState.metadata?.column_profiles || []).find((item) => item?.name === col);
        const min = Number(profile?.min);
        const max = Number(profile?.max);
        if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };

        return null;
    }

    function populateColumns(selectedCol: string | null = null) {
        const cols = appState.selectedCols || [];
        columnSelect.innerHTML = '';
        if (cols.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No series selected';
            columnSelect.appendChild(opt);
            columnSelect.value = '';
            return;
        }
        for (const col of cols) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            columnSelect.appendChild(opt);
        }
        if (selectedCol && cols.includes(selectedCol)) columnSelect.value = selectedCol;
        else columnSelect.value = cols[0];
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
        if (!appState.lastFetchedData) {
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
        const cur = appState.columnRanges[col] ?? { from: full.min, to: full.max };
        updateSliderConfig(full);
        syncInputsFromValues(cur.from, cur.to);
        applyButton.disabled = false;
        clearButton.disabled = false;
        setHint(`Available range: ${formatAnalysisNumber(full.min)} → ${formatAnalysisNumber(full.max)}`);
    }

    function openModalForCol(col: string | null) {
        populateColumns(col || columnSelect.value || appState.selectedCols?.[0] || null);
        refreshInputsForCol(columnSelect.value);
        modalEl.hidden = false;
        try { minTextInput.focus(); } catch { }
    }

    function closeModal() {
        modalEl.hidden = true;
        setHint('');
    }

    window.__edatime = window.__edatime || {};
    window.__edatime.openFilterForCol = openModalForCol;

    for (const btn of openBtns) {
        btn.addEventListener('click', () => openModalForCol(null));
    }
    closeButton.addEventListener('click', closeModal);
    cancelButton.addEventListener('click', closeModal);
    modalEl.addEventListener('click', (event) => { if (event.target === modalEl) closeModal(); });
    window.addEventListener('keydown', (event) => {
        if (modalEl.hidden) return;
        if (event.key === 'Escape') closeModal();
    });

    columnSelect.addEventListener('change', () => refreshInputsForCol(columnSelect.value));
    minTextInput.addEventListener('input', syncFromNumericInputs);
    maxTextInput.addEventListener('input', syncFromNumericInputs);
    minSliderInput.addEventListener('input', () => syncFromRangeInputs('min'));
    maxSliderInput.addEventListener('input', () => syncFromRangeInputs('max'));

    clearButton.addEventListener('click', () => {
        const col = columnSelect.value;
        const full = getFullBoundsForCol(col);
        if (!col || !full) return;
        appState.columnRanges[col] = { from: full.min, to: full.max };
        buildRangeControls();
        deps.renderCurrentData();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'filter');
        emitColumnFiltersChange();
        refreshInputsForCol(col);
    });

    applyButton.addEventListener('click', () => {
        const col = columnSelect.value;
        if (!col) return;
        let { from, to } = readInputs();
        const full = getFullBoundsForCol(col);
        if (full) {
            if (!Number.isFinite(from)) from = full.min;
            if (!Number.isFinite(to)) to = full.max;
        }
        if (!Number.isFinite(from) || !Number.isFinite(to)) {
            setHint('Enter a valid min and max.');
            return;
        }
        if (from > to) {
            const tmp = from;
            from = to;
            to = tmp;
        }
        appState.columnRanges[col] = { from, to };
        buildRangeControls();
        deps.renderCurrentData();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'filter');
        emitColumnFiltersChange();
        closeModal();
    });

    modalEl.dataset.bound = '1';
}
