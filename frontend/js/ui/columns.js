/**
 * Column toggle chip UI + column range filter controls.
 */

import {
    appState, SERIES_COLORS, formatAnalysisNumber,
    computeBounds, buildMetaBar, sanitizeSelectedColumns,
} from '../state.js';

// ─── Column toggles (chips) ─────────────────────────────────────────────────

export function buildColumnToggles(fetchAndRender, buildRangeControlsFn) {
    sanitizeSelectedColumns();
    const container = document.getElementById('column-toggles');
    if (!container) return;
    container.innerHTML = '';

    // Double-click a chip to open the filter modal for that column.
    if (!container.dataset.dblBound) {
        container.addEventListener('dblclick', (e) => {
            const chip = e.target?.closest?.('.series-chip');
            if (!chip) return;
            const input = chip.querySelector('input[type="checkbox"]');
            const col = input?.value;
            if (!col) return;
            const open = window.__edatime?.openFilterForCol;
            if (typeof open !== 'function') return;
            e.preventDefault();
            e.stopPropagation();
            open(col);
        });
        container.dataset.dblBound = '1';
    }

    const visibleCols = appState.numericCols.filter((col) => {
        if (!appState.filterText) return true;
        return col.toLowerCase().includes(appState.filterText);
    });

    if (visibleCols.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'series-empty';
        empty.textContent = 'No matching columns';
        container.appendChild(empty);
        return;
    }

    visibleCols.forEach((col, idx) => {
        const color = SERIES_COLORS[idx % SERIES_COLORS.length];
        const isActive = appState.selectedCols.includes(col);

        const chip = document.createElement('label');
        chip.className = 'series-chip' + (isActive ? ' active' : '');
        chip.innerHTML = `
            <input type="checkbox" ${isActive ? 'checked' : ''} value="${col}">
            <span class="chip-dot" style="background:${color}"></span>
            <span class="chip-label">${col}</span>
        `;

        chip.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!appState.selectedCols.includes(col)) appState.selectedCols.push(col);
                chip.classList.add('active');
            } else {
                appState.selectedCols = appState.selectedCols.filter(c => c !== col);
                chip.classList.remove('active');
            }
            if (appState.selectedCols.length === 0) {
                e.target.checked = true;
                appState.selectedCols.push(col);
                chip.classList.add('active');
            }
            buildMetaBar(appState.metadata);
            buildRangeControlsFn();
            fetchAndRender();
        });

        container.appendChild(chip);
    });
}

// ─── Range control chips ────────────────────────────────────────────────────

export function buildRangeControls() {
    const container = document.getElementById('column-range-controls');
    if (!container) return;
    container.innerHTML = '';

    for (const col of appState.selectedCols) {
        const range = appState.columnRanges[col];
        if (!range) continue;

        const chip = document.createElement('div');
        chip.className = 'range-chip range-chip--clickable';
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', `Filter ${col}`);
        chip.innerHTML = `
            <span class="name">${col}</span>
            <span class="range">${formatAnalysisNumber(range.from)} → ${formatAnalysisNumber(range.to)}</span>
        `;

        const open = () => {
            const fn = window.__edatime?.openFilterForCol;
            if (typeof fn === 'function') fn(col);
        };

        chip.addEventListener('click', open);
        chip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
        container.appendChild(chip);
    }
}

// ─── Column filter modal ───────────────────────────────────────────────────

export function initColumnFilterModal(renderCurrentData, updateAnalysisYRange) {
    const modal = document.getElementById('column-filter-modal');
    const closeBtn = document.getElementById('column-filter-close-btn');
    const cancelBtn = document.getElementById('column-filter-cancel-btn');
    const applyBtn = document.getElementById('column-filter-apply-btn');
    const clearBtn = document.getElementById('column-filter-clear-btn');
    const colSelect = document.getElementById('column-filter-col');
    const minInput = document.getElementById('column-filter-min');
    const maxInput = document.getElementById('column-filter-max');
    const hint = document.getElementById('column-filter-hint');
    const openBtn = document.getElementById('column-filter-open-btn');
    const openBtns = [openBtn].filter(Boolean);

    if (!modal || !closeBtn || !cancelBtn || !applyBtn || !clearBtn || !colSelect || !minInput || !maxInput || !hint) return;
    if (modal.dataset.bound) return;

    function setHint(text) { hint.textContent = text || ''; }

    function getFullBoundsForCol(col) {
        const values = appState.lastFetchedData?.values?.[col];
        if (!values) return null;
        return computeBounds(values);
    }

    function populateColumns(selectedCol = null) {
        const cols = appState.selectedCols || [];
        colSelect.innerHTML = '';
        if (cols.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No series selected';
            colSelect.appendChild(opt);
            colSelect.value = '';
            return;
        }
        for (const col of cols) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            colSelect.appendChild(opt);
        }
        if (selectedCol && cols.includes(selectedCol)) colSelect.value = selectedCol;
        else colSelect.value = cols[0];
    }

    function refreshInputsForCol(col) {
        if (!col) {
            minInput.value = '';
            maxInput.value = '';
            applyBtn.disabled = true;
            clearBtn.disabled = true;
            setHint('Select a column to filter.');
            return;
        }
        if (!appState.lastFetchedData) {
            applyBtn.disabled = true;
            clearBtn.disabled = true;
            setHint('Data not loaded yet.');
            return;
        }
        const full = getFullBoundsForCol(col);
        if (!full) {
            applyBtn.disabled = true;
            clearBtn.disabled = true;
            setHint('No data for this column in the current range.');
            return;
        }
        const cur = appState.columnRanges[col] ?? { from: full.min, to: full.max };
        minInput.value = String(cur.from);
        maxInput.value = String(cur.to);
        applyBtn.disabled = false;
        clearBtn.disabled = false;
        setHint(`Full range: ${formatAnalysisNumber(full.min)} → ${formatAnalysisNumber(full.max)}`);
    }

    function openModalForCol(col) {
        populateColumns(col || colSelect.value || appState.selectedCols?.[0] || null);
        refreshInputsForCol(colSelect.value);
        modal.hidden = false;
        try { minInput.focus(); } catch (_) {}
    }

    function closeModal() {
        modal.hidden = true;
        setHint('');
    }

    window.__edatime = window.__edatime || {};
    window.__edatime.openFilterForCol = openModalForCol;

    for (const btn of openBtns) {
        btn.addEventListener('click', () => openModalForCol(null));
    }
    closeBtn.addEventListener('click', () => closeModal());
    cancelBtn.addEventListener('click', () => closeModal());
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('keydown', (e) => {
        if (modal.hidden) return;
        if (e.key === 'Escape') closeModal();
    });

    colSelect.addEventListener('change', () => refreshInputsForCol(colSelect.value));

    clearBtn.addEventListener('click', () => {
        const col = colSelect.value;
        const full = getFullBoundsForCol(col);
        if (!col || !full) return;
        appState.columnRanges[col] = { from: full.min, to: full.max };
        buildRangeControls();
        renderCurrentData();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'filter');
        refreshInputsForCol(col);
    });

    applyBtn.addEventListener('click', () => {
        const col = colSelect.value;
        if (!col) return;
        let from = Number.parseFloat(minInput.value);
        let to = Number.parseFloat(maxInput.value);
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
        closeModal();
    });

    modal.dataset.bound = '1';
}
