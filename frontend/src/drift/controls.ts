/**
 * Drift control wiring — all event listeners bound to drift page controls.
 *
 * Responsibilities:
 * - Column picker open/close/toggle
 * - Reference preset and custom time range
 * - Compute trigger, sort select, zoom reset
 * - Export buttons (PNG, CSV, JSON)
 * - Detail column select, plot type select (with debounce)
 * - Keyboard shortcuts
 *
 * This module does NOT import from driftPage.ts to avoid circular deps.
 * All drift chart functions and state are passed as callbacks.
 */

import { getDropdownValue } from '../ui/primitives/Dropdown.js';
import { appState } from '../store/index.js';
import { formatUtcDatetimeInputValue } from '../utils/datetimeInput.js';

export interface DriftControlCallbacks {
    getSelectedColumns: () => string[];
    runCompute: () => Promise<void>;
    exportDriftCsv: () => void;
    exportDriftJson: () => void;
    renderTimeline: () => void;
    renderDetail: () => void;
    renderWindowList: () => void;
    updateDetailStats: () => void;
    syncEmptyState: (show: boolean, message?: string) => void;
    scheduleDriftChartRefresh: () => void;
}

export interface DriftControlOptions {
    pageMetadata: any;
    colPickerBtn: HTMLButtonElement | null;
    colPickerPanel: HTMLElement | null;
    colPickerList: HTMLElement | null;
    colPickerLabel: HTMLElement | null;
    colSelectAllBtn: HTMLButtonElement | null;
    colSelectSingleBtn: HTMLButtonElement | null;
    colSelectNoneBtn: HTMLButtonElement | null;
    colSelect: HTMLSelectElement | null;
    windowSelect: HTMLElement | null;
    plotTypeSelect: HTMLElement | null;
    refPresetSelect: HTMLElement | null;
    evaluationModeSelect: HTMLElement | null;
    latestNInput: HTMLInputElement | null;
    refStartInput: HTMLInputElement | null;
    refEndInput: HTMLInputElement | null;
    computeBtn: HTMLButtonElement | null;
    zoomResetBtn: HTMLButtonElement | null;
    detailColumnSelect: HTMLElement | null;
    loadingOverlay: HTMLElement | null;
    emptyState: HTMLElement | null;
    driftLayoutEl: HTMLElement | null;
    sortSelect: HTMLElement | null;
    onDetailColumnChange: (column: string | null, windowIdx: number | null) => void;
    timelineChartDispatch: (action: { type: string; dataZoomIndex?: number; start?: number; end?: number }) => void;
    detailChartDispatch: (action: { type: string; dataZoomIndex?: number; start?: number; end?: number }) => void;
    exportTimelinePNG: () => void;
    exportDetailPNG: () => void;
}

// ── Column picker state (module-level to survive across page visits) ─────────
let selectedCols = new Set<string>();
let numericCols: string[] = [];
let pickerLabelEl: HTMLElement | null = null;
let hiddenColSelectEl: HTMLSelectElement | null = null;

export function getSelectedColumns(): string[] {
    return [...selectedCols];
}

export function resetDriftControlsState(): void {
    selectedCols = new Set<string>();
    numericCols = [];
    pickerLabelEl = null;
    hiddenColSelectEl = null;
}

function syncPickerLabel(): void {
    if (!pickerLabelEl) return;
    const n = selectedCols.size;
    pickerLabelEl.textContent = n === 0 ? 'Select columns' : n === 1 ? `${[...selectedCols][0]}` : `${n} columns`;
}

function syncHiddenSelect(allCols: string[]): void {
    if (!hiddenColSelectEl) return;
    hiddenColSelectEl.innerHTML = '';
    allCols.forEach((col) => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        opt.selected = selectedCols.has(col);
        hiddenColSelectEl?.appendChild(opt);
    });
}

function getCheckboxes(colPickerList: HTMLElement | null): NodeListOf<HTMLInputElement> {
    return (colPickerList ?? document).querySelectorAll<HTMLInputElement>('.drift-col-cb');
}

function syncCheckboxes(colPickerList: HTMLElement | null): void {
    getCheckboxes(colPickerList).forEach((cb) => {
        cb.checked = selectedCols.has(cb.value);
    });
    syncPickerLabel();
}

function openPicker(colPickerPanel: HTMLElement | null, colPickerBtn: HTMLButtonElement | null): void {
    if (!colPickerPanel || !colPickerBtn) return;
    if (colPickerPanel.parentElement !== document.body) {
        document.body.appendChild(colPickerPanel);
    }
    const rect = colPickerBtn.getBoundingClientRect();
    colPickerPanel.style.position = 'fixed';
    colPickerPanel.style.top = `${rect.bottom + 4}px`;
    colPickerPanel.style.left = `${rect.left}px`;
    colPickerPanel.style.bottom = 'auto';
    colPickerPanel.style.right = 'auto';
    colPickerPanel.hidden = false;
    colPickerBtn.setAttribute('aria-expanded', 'true');
}

function closePicker(colPickerPanel: HTMLElement | null, colPickerBtn: HTMLButtonElement | null): void {
    if (!colPickerPanel || !colPickerBtn) return;
    colPickerPanel.hidden = true;
    colPickerBtn.setAttribute('aria-expanded', 'false');
}

function repopulateColumnSelect(
    colPickerList: HTMLElement | null,
    allCols: string[],
): void {
    selectedCols = new Set([...selectedCols].filter((c) => allCols.includes(c)));
    if (selectedCols.size === 0 && allCols.length > 0) selectedCols.add(allCols[0]!);

    if (!colPickerList) return;
    colPickerList.innerHTML = '';
    allCols.forEach((col) => {
        const label = document.createElement('label');
        label.className = 'drift-col-picker-item';
        label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:0.75rem;color:var(--text-dim,#788bae);user-select:none;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'drift-col-cb';
        cb.value = col;
        cb.checked = selectedCols.has(col);
        cb.addEventListener('change', () => {
            if (cb.checked) {
                selectedCols.add(col);
            } else {
                selectedCols.delete(col);
                if (selectedCols.size === 0 && allCols.length > 0) selectedCols.add(allCols[0]!);
                syncCheckboxes(colPickerList);
            }
            syncPickerLabel();
            syncHiddenSelect(allCols);
        });
        const span = document.createElement('span');
        span.textContent = col;
        label.appendChild(cb);
        label.appendChild(span);
        colPickerList.appendChild(label);
    });
    syncPickerLabel();
    syncHiddenSelect(allCols);
}

// ── Main bind function ───────────────────────────────────────────────────────
export function bindDriftControls(cb: DriftControlCallbacks, opts: DriftControlOptions): void {
    const {
        pageMetadata,
        colPickerBtn,
        colPickerPanel,
        colPickerList,
        colPickerLabel,
        colSelectAllBtn,
        colSelectSingleBtn,
        colSelectNoneBtn,
        colSelect,
        windowSelect,
        plotTypeSelect,
        refPresetSelect,
        evaluationModeSelect,
        latestNInput,
        refStartInput,
        refEndInput,
        computeBtn,
        zoomResetBtn,
        detailColumnSelect,
        sortSelect,
        onDetailColumnChange,
        timelineChartDispatch,
        detailChartDispatch,
        exportTimelinePNG,
        exportDetailPNG,
    } = opts;

    numericCols = Array.isArray(pageMetadata?.numeric_columns)
        ? pageMetadata.numeric_columns.filter((c: string) => c && c.toLowerCase() !== 'ts')
        : [];

    selectedCols = new Set(numericCols.length > 0 ? [numericCols[0]!] : []);
    pickerLabelEl = colPickerLabel;
    hiddenColSelectEl = colSelect;

    // ── Picker event listeners ──────────────────────────────────────────────
    colPickerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (colPickerPanel?.hidden === false) {
            closePicker(colPickerPanel, colPickerBtn);
        } else {
            openPicker(colPickerPanel, colPickerBtn);
        }
    });

    document.addEventListener('click', (e) => {
        if (!colPickerPanel || colPickerPanel.hidden) return;
        const wrap = document.getElementById('drift-col-picker-wrap');
        const target = e.target as Node;
        if (wrap && !wrap.contains(target) && !colPickerPanel.contains(target)) {
            closePicker(colPickerPanel, colPickerBtn);
        }
    });

    colPickerPanel?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') { closePicker(colPickerPanel, colPickerBtn); colPickerBtn?.focus(); }
    });

    repopulateColumnSelect(colPickerList, numericCols);

    // ── Reference preset ───────────────────────────────────────────────────
    const timeRange = pageMetadata?.time_range as { min: number; max: number } | undefined;
    function applyReferencePreset(preset: string): void {
        if (preset === 'custom') return;
        if (preset === 'viewport') {
            const start = Number(appState.currentStart);
            const end = Number(appState.currentEnd);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                if (refStartInput) refStartInput.value = formatUtcDatetimeInputValue(start);
                if (refEndInput) refEndInput.value = formatUtcDatetimeInputValue(end);
            }
            return;
        }
        if (!timeRange) return;
        const pct = Number(preset);
        if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return;
        const end = timeRange.min + ((timeRange.max - timeRange.min) * pct) / 100;
        if (refStartInput) refStartInput.value = formatUtcDatetimeInputValue(timeRange.min);
        if (refEndInput) refEndInput.value = formatUtcDatetimeInputValue(end);
    }
    applyReferencePreset(getDropdownValue('drift-ref-preset') || '50');

    // ── Compute button ─────────────────────────────────────────────────────
    computeBtn?.addEventListener('click', () => {
        cb.runCompute();
    });

    // ── Sort select ─────────────────────────────────────────────────────────
    sortSelect?.addEventListener('change', () => {
        cb.renderWindowList();
    });

    // ── Detail column select ─────────────────────────────────────────────────
    detailColumnSelect?.addEventListener('change', () => {
        const column = getDropdownValue('drift-detail-col-select') || null;
        onDetailColumnChange(column, null);
    });

    // ── Plot type select (debounced) ─────────────────────────────────────────
    let plotTypeDebounce: ReturnType<typeof setTimeout> | null = null;
    plotTypeSelect?.addEventListener('change', () => {
        if (plotTypeDebounce !== null) clearTimeout(plotTypeDebounce);
        plotTypeDebounce = setTimeout(() => {
            plotTypeDebounce = null;
            cb.renderDetail();
        }, 80);
    });

    function syncEvaluationModeUi(): void {
        if (!latestNInput) return;
        latestNInput.disabled = getDropdownValue('drift-evaluation-mode') !== 'latest-n';
    }
    syncEvaluationModeUi();
    evaluationModeSelect?.addEventListener('change', syncEvaluationModeUi);

    // ── Reference preset select ─────────────────────────────────────────────
    refPresetSelect?.addEventListener('change', () => {
        applyReferencePreset(getDropdownValue('drift-ref-preset') || 'custom');
    });

    // ── Column picker bulk actions ─────────────────────────────────────────
    colSelectAllBtn?.addEventListener('click', () => {
        numericCols.forEach((c) => selectedCols.add(c));
        syncCheckboxes(colPickerList);
        syncHiddenSelect(numericCols);
        closePicker(colPickerPanel, colPickerBtn);
    });

    colSelectSingleBtn?.addEventListener('click', () => {
        const keep = [...selectedCols][0] || numericCols[0];
        if (keep) {
            selectedCols = new Set([keep]);
            syncCheckboxes(colPickerList);
            syncHiddenSelect(numericCols);
        }
        closePicker(colPickerPanel, colPickerBtn);
    });

    colSelectNoneBtn?.addEventListener('click', () => {
        selectedCols = new Set(numericCols.length > 0 ? [numericCols[0]!] : []);
        syncCheckboxes(colPickerList);
        syncHiddenSelect(numericCols);
    });

    // ── Zoom reset ──────────────────────────────────────────────────────────
    zoomResetBtn?.addEventListener('click', () => {
        timelineChartDispatch({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        timelineChartDispatch({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
        detailChartDispatch({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        detailChartDispatch({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    });

    // ── Export buttons ─────────────────────────────────────────────────────
    document.getElementById('drift-export-png')?.addEventListener('click', exportTimelinePNG);
    document.getElementById('drift-export-detail-png')?.addEventListener('click', exportDetailPNG);
    document.getElementById('drift-export-csv')?.addEventListener('click', cb.exportDriftCsv);
    document.getElementById('drift-export-json')?.addEventListener('click', cb.exportDriftJson);

    // ── Keyboard shortcuts ─────────────────────────────────────────────────
    const driftPage = document.getElementById('page-drift');
    driftPage?.addEventListener('keydown', (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        switch (e.key) {
            case 'Enter':
            case 'd':
            case 'D':
                e.preventDefault();
                cb.runCompute();
                break;
            case 'e':
            case 'E':
                e.preventDefault();
                cb.exportDriftCsv();
                break;
            case 'j':
            case 'J':
                e.preventDefault();
                cb.exportDriftJson();
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                exportTimelinePNG();
                break;
        }
    });

    // ── Page change listener (repopulate columns on page show) ─────────────
    window.addEventListener('edatime:page-change', (e: any) => {
        if (e?.detail?.page !== 'drift') return;
        const cols: string[] = Array.isArray(pageMetadata?.numeric_columns)
            ? pageMetadata.numeric_columns.filter((c: string) => c && c.toLowerCase() !== 'ts')
            : [];
        numericCols = cols;
        selectedCols = new Set(numericCols.length > 0 ? [numericCols[0]!] : []);
        repopulateColumnSelect(colPickerList, cols);
        cb.scheduleDriftChartRefresh();
    });
}
