/**
 * Column toggle chip UI + column range filter controls.
 */

import { buildMetaBar } from '../../ui/metaBar.js';
import { formatAnalysisNumber } from '../../utils/format.js';
import { computeBounds } from '../../services/timeseries/filtering.js';
import {
    appStateComposite as appState,
    getSeriesColor,
    setAdaptiveFilterColumn,
    setAdaptiveLineFilters,
    setPendingAdaptivePoint,
    setSelectedCols,
    setSeriesColor,
} from '../../store/index.js';
import { SeriesChip } from '../../ui/composites/SeriesChip.js';
import { renderSeriesChipList } from '../../ui/index.js';
import { sanitizeSelectedColumns, ensureAdaptiveTargetStillValid } from './columnSelection.js';
import { renderColorByControl } from './colorByControl.js';
import { buildRangeControls } from './rangeControls.js';
import { applyCollapse } from './seriesCollapse.js';
import { bindChipContextMenu } from './chipContextMenu.js';
import { composeChipListItems, bindChipCtrlClick } from './chipComposition.js';
export { initSeriesCollapse } from './seriesCollapse.js';

// ─── Column toggles (chips) ─────────────────────────────────────────────────

export function buildColumnToggles(
    fetchAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn: (() => void) | null = null,
): void {
    const container = document.getElementById('column-toggles');
    if (!container || (container as any)?.dataset?.rebuilding) return;
    container.dataset.rebuilding = '1';
    sanitizeSelectedColumns();
    ensureAdaptiveTargetStillValid();
    container.innerHTML = '';
    const finish = () => { container.dataset.rebuilding = ''; };

    bindChipContextMenu(container);

    const items = composeChipListItems({
        filterText: appState.filterText ?? '',
        buildRangeControlsFn,
        fetchAndRender,
        renderCurrentDataFn,
    });

    if (items.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'series-empty';
        empty.textContent = 'No matching columns';
        container.appendChild(empty);
        return;
    }

    renderSeriesChipList({
        container,
        items: items.map((item) => ({ ...item, onToggle: item.onToggle })),
        chipClass: 'timeseries-chip',
        onColorUpdate: (col, color) => {
            const chip = container.querySelector(`[data-col="${col}"]`) as HTMLElement | null;
            if (chip) chip.style.setProperty('--chip-accent', color);
        },
    });

    bindChipCtrlClick(
        container,
        () => {
            buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
            buildRangeControlsFn();
        },
        buildRangeControlsFn,
        renderCurrentDataFn,
        fetchAndRender,
    );
    finish();
    applyCollapse();
}

// ─── Range control chips (delegated) ──────────────────────────────────────────
export { buildRangeControls } from './rangeControls.js';

// ─── Column filter modal ───────────────────────────────────────────────────

export function initColumnFilterModal(
    renderCurrentData: () => void,
    updateAnalysisYRange: (min: number, max: number, source: string) => void,
): void {
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

    let activeBounds: { min: number; max: number } | null = null;

    function emitColumnFiltersChange() {
        window.dispatchEvent(new CustomEvent('edatime:column-filters-change'));
    }

    function setHint(text: string) { hint!.textContent = text || ''; }

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
        rangeMinValue!.textContent = formatAnalysisNumber(from);
        rangeMaxValue!.textContent = formatAnalysisNumber(to);

        if (!activeBounds) {
            rangeFill!.style.left = '0%';
            rangeFill!.style.width = '0%';
            return;
        }

        const span = activeBounds.max - activeBounds.min;
        if (!(span > 0)) {
            rangeFill!.style.left = '0%';
            rangeFill!.style.width = '100%';
            return;
        }

        const leftPct = ((from - activeBounds.min) / span) * 100;
        const rightPct = ((to - activeBounds.min) / span) * 100;
        const clampedLeft = Math.max(0, Math.min(100, leftPct));
        const clampedRight = Math.max(clampedLeft, Math.min(100, rightPct));

        rangeFill!.style.left = `${clampedLeft}%`;
        rangeFill!.style.width = `${Math.max(0, clampedRight - clampedLeft)}%`;
    }

    function updateSliderConfig(bounds: { min: number; max: number } | null) {
        activeBounds = bounds;
        if (!bounds) {
            minRangeInput!.disabled = true;
            maxRangeInput!.disabled = true;
            updateRangeFill(0, 0);
            return;
        }

        const step = computeSliderStep(bounds);
        const min = String(bounds.min);
        const max = String(bounds.max);
        const disabled = !(bounds.max > bounds.min);

        for (const input of [minRangeInput!, maxRangeInput!]) {
            input.min = min;
            input.max = max;
            input.step = String(step);
            input.disabled = disabled;
        }

        updateRangeFill(bounds.min, bounds.max);
    }

    function syncSliderValues(from: number, to: number) {
        minRangeInput!.value = String(from);
        maxRangeInput!.value = String(to);
    }

    function syncInputsFromValues(from: number, to: number) {
        minInput!.value = formatInputValue(from);
        maxInput!.value = formatInputValue(to);
        syncSliderValues(from, to);
        updateRangeFill(from, to);
    }

    function readInputs(): { from: number; to: number } {
        let from = Number.parseFloat(minInput!.value);
        let to = Number.parseFloat(maxInput!.value);

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
        let from = Number.parseFloat(minRangeInput!.value);
        let to = Number.parseFloat(maxRangeInput!.value);

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
        colSelect!.innerHTML = '';
        if (cols.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No series selected';
            colSelect!.appendChild(opt);
            colSelect!.value = '';
            return;
        }
        for (const col of cols) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            colSelect!.appendChild(opt);
        }
        if (selectedCol && cols.includes(selectedCol)) colSelect!.value = selectedCol;
        else colSelect!.value = cols[0];
    }

    function refreshInputsForCol(col: string) {
        if (!col) {
            minInput!.value = '';
            maxInput!.value = '';
            updateSliderConfig(null);
            applyBtn!.disabled = true;
            clearBtn!.disabled = true;
            setHint('Select a column to filter.');
            return;
        }
        if (!appState.lastFetchedData) {
            updateSliderConfig(null);
            applyBtn!.disabled = true;
            clearBtn!.disabled = true;
            setHint('Data not loaded yet.');
            return;
        }
        const full = getFullBoundsForCol(col);
        if (!full) {
            applyBtn!.disabled = true;
            clearBtn!.disabled = true;
            updateSliderConfig(null);
            setHint('No numeric range is available for this column.');
            return;
        }
        const cur = appState.columnRanges[col] ?? { from: full.min, to: full.max };
        updateSliderConfig(full);
        syncInputsFromValues(cur.from, cur.to);
        applyBtn!.disabled = false;
        clearBtn!.disabled = false;
        setHint(`Available range: ${formatAnalysisNumber(full.min)} → ${formatAnalysisNumber(full.max)}`);
    }

    function openModalForCol(col: string | null) {
        populateColumns(col || colSelect!.value || appState.selectedCols?.[0] || null);
        refreshInputsForCol(colSelect!.value);
        modal!.hidden = false;
        try { minInput!.focus(); } catch { /* ignore */ }
    }

    function closeModal() {
        modal!.hidden = true;
        setHint('');
    }

    window.__edatime = window.__edatime || {};
    window.__edatime.openFilterForCol = openModalForCol;

    for (const btn of openBtns) {
        btn.addEventListener('click', () => openModalForCol(null));
    }
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('keydown', (e) => {
        if (modal!.hidden) return;
        if (e.key === 'Escape') closeModal();
    });

    colSelect.addEventListener('change', () => refreshInputsForCol(colSelect!.value));
    minInput.addEventListener('input', syncFromNumericInputs);
    maxInput.addEventListener('input', syncFromNumericInputs);
    minRangeInput.addEventListener('input', () => syncFromRangeInputs('min'));
    maxRangeInput.addEventListener('input', () => syncFromRangeInputs('max'));

    clearBtn.addEventListener('click', () => {
        const col = colSelect!.value;
        const full = getFullBoundsForCol(col);
        if (!col || !full) return;
        appState.columnRanges[col] = { from: full.min, to: full.max };
        buildRangeControls();
        renderCurrentData();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'filter');
        emitColumnFiltersChange();
        refreshInputsForCol(col);
    });

    applyBtn.addEventListener('click', () => {
        const col = colSelect!.value;
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
        if (from > to) { const tmp = from; from = to; to = tmp; }
        appState.columnRanges[col] = { from, to };
        buildRangeControls();
        renderCurrentData();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'filter');
        emitColumnFiltersChange();
        closeModal();
    });

    modal.dataset.bound = '1';
}
