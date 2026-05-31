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

let _seriesCollapsed = false;

// ─── Collapse toggle ───────────────────────────────────────────────────────

export function initSeriesCollapse(): void {
    const btn = document.getElementById('collapse-series-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        _seriesCollapsed = !_seriesCollapsed;
        updateCollapseButton(btn);
        applyCollapse();
    });
}

function updateCollapseButton(btn: HTMLElement): void {
    btn.title = _seriesCollapsed ? 'Expand series list' : 'Collapse series list';
    btn.setAttribute('aria-label', _seriesCollapsed ? 'Expand series list' : 'Collapse series list');
    const svg = btn.querySelector('svg');
    if (svg) {
        svg.style.transform = _seriesCollapsed ? 'rotate(180deg)' : '';
    }
}

function applyCollapse(): void {
    const chips = document.querySelectorAll<HTMLElement>('#column-toggles .series-chip');
    const collapseThreshold = 3;
    chips.forEach((chip, i) => {
        if (!_seriesCollapsed || i < collapseThreshold) {
            (chip as HTMLElement).style.display = '';
        } else {
            (chip as HTMLElement).style.display = 'none';
        }
    });

    const container = document.getElementById('column-toggles');
    if (_seriesCollapsed && container) {
        let existingBadge = container.querySelector('.collapse-badge');
        if (!existingBadge) {
            const badge = document.createElement('span');
            badge.className = 'collapse-badge';
            badge.id = 'series-collapse-badge';
            container.appendChild(badge);
        }
        const badge = container.querySelector('#series-collapse-badge');
        if (badge) {
            badge.textContent = `+${chips.length - collapseThreshold} more`;
            (badge as HTMLElement).style.display = '';
        }
    } else {
        const badge = document.getElementById('series-collapse-badge');
        if (badge) (badge as HTMLElement).style.display = 'none';
    }
}

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

    // Double-right-click a chip to open the filter modal for that column.
    if (!container.dataset.ctxBound) {
        let lastContextTs = 0;
        let lastContextCol = '';
        container.addEventListener('contextmenu', (e: MouseEvent) => {
            const chip = (e.target as HTMLElement)?.closest?.('.series-chip');
            if (!chip) return;
            const input = chip.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
            const col = input?.value;
            if (!col) return;
            e.preventDefault();
            e.stopPropagation();

            const now = performance.now();
            const isDoubleContext = lastContextCol === col && (now - lastContextTs) <= 450;
            lastContextTs = now;
            lastContextCol = col;
            if (!isDoubleContext) return;

            lastContextTs = 0;
            lastContextCol = '';
            const open = window.__edatime?.openFilterForCol;
            if (typeof open !== 'function') return;
            open(col);
        });
        container.dataset.ctxBound = '1';
    }

    const visibleCols = appState.numericCols.filter((col) => {
        if (!appState.filterText) return true;
        return col.toLowerCase().includes(appState.filterText);
    });

    renderColorByControl({
        onColorColumnChange: () => {
            if (typeof fetchAndRender === 'function') fetchAndRender();
        },
        slotId: 'timeseries-color-slot',
    });

    if (visibleCols.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'series-empty';
        empty.textContent = 'No matching columns';
        container.appendChild(empty);
        return;
    }

    const chipListItems = visibleCols.map((col) => {
        const colIdx = appState.numericCols.indexOf(col);
        const color = getSeriesColor(col, colIdx >= 0 ? colIdx : 0);
        const isActive = appState.selectedCols.includes(col);
        const isAdaptiveTarget = isActive && appState.adaptiveFilterColumn === col;

        const chipTitle = isAdaptiveTarget
            ? `Adaptive filter target: ${col}`
            : `Ctrl+click to target adaptive filters to ${col}`;

        return {
            column: col,
            checked: isActive,
            color,
            adaptiveTarget: isAdaptiveTarget,
            title: chipTitle,
            onToggle: (checked: boolean) => {
                if (checked) {
                    if (!appState.selectedCols.includes(col)) setSelectedCols([...appState.selectedCols, col]);
                } else {
                    setSelectedCols(appState.selectedCols.filter((c) => c !== col));
                }
                ensureAdaptiveTargetStillValid();
                buildRangeControlsFn();
                (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
                fetchAndRender();
            },
            onColorInput: (nextColor: string) => {
                const updated = setSeriesColor(col, nextColor);
                if (!updated) return;
                renderCurrentDataFn?.();
            },
            onMenuClick: () => {
                const open = window.__edatime?.openFilterForCol;
                if (typeof open === 'function') open(col);
            },
            menuLabel: `Filter range for ${col}`,
        };
    });

    renderSeriesChipList({
        container,
        items: chipListItems,
        chipClass: 'timeseries-chip',
        onColorUpdate: (col, color) => {
            const chip = container.querySelector(`[data-col="${col}"]`) as HTMLElement | null;
            if (chip) chip.style.setProperty('--chip-accent', color);
        },
    });

    // Re-attach Ctrl+click adaptive-target handler to chips.
    // The chip-color-picker click is excluded so color changes don't trigger it.
    for (const chip of container.querySelectorAll<HTMLElement>('.series-chip')) {
        chip.addEventListener(
            'click',
            (e: MouseEvent) => {
                if ((e.target as HTMLElement)?.closest?.('.chip-color-picker')) return;
                if (!e.ctrlKey) return;
                e.preventDefault();
                e.stopPropagation();

                const input = chip.querySelector<HTMLInputElement>('input[type="checkbox"]');
                const col = input?.value;
                if (!col) return;

                const hadColumn = appState.selectedCols.includes(col);
                if (!hadColumn) setSelectedCols([...appState.selectedCols, col]);
                setAdaptiveFilterColumn(col);
                setPendingAdaptivePoint(null);

                buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
                buildRangeControlsFn();
                (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();

                if (!hadColumn) fetchAndRender();
            },
            true, // capture phase
        );
    }
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
