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

import { getDropdownValue } from '../../ui/primitives/Dropdown.js';
import { renderSeriesChipList } from '../../ui/seriesChipList.js';
import { formatUtcDatetimeInputValue } from '../../utils/datetimeInput.js';
import { getColumnSeriesColor } from '../../utils/seriesColors.js';
import { onNavigationChange } from '../../platform/navigationEvents.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { setWindowSort } from './selection.js';

export interface DriftControlCallbacks {
    getSelectedColumns: () => string[];
    runCompute: () => Promise<void>;
    onSelectionChange: () => void;
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
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
    pageMetadata: any;
    colPickerBtn: HTMLButtonElement | null;
    colPickerPanel: HTMLElement | null;
    colPickerList: HTMLElement | null;
    colPickerLabel: HTMLElement | null;
    colSelectAllBtn: HTMLButtonElement | null;
    colSelectSingleBtn: HTMLButtonElement | null;
    colSelectNoneBtn: HTMLButtonElement | null;
    windowSelect: HTMLElement | null;
    plotTypeSelect: HTMLElement | null;
    refPresetSelect: HTMLElement | null;
    evaluationModeSelect: HTMLElement | null;
    latestNInput: HTMLInputElement | null;
    latestNHelper: HTMLElement | null;
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
let selectionChangeCallback: (() => void) | null = null;

export function getSelectedColumns(): string[] {
    return [...selectedCols];
}

export function resetDriftControlsState(): void {
    selectedCols = new Set<string>();
    numericCols = [];
    pickerLabelEl = null;
    selectionChangeCallback = null;
}

function syncPickerLabel(allCols: string[] = numericCols): void {
    if (!pickerLabelEl) return;
    const total = allCols.length;
    const selected = selectedCols.size;
    pickerLabelEl.textContent = total === 0 ? 'No numeric columns' : `${selected} of ${total} selected`;
}

function renderColumnChips(colPickerList: HTMLElement | null, allCols: string[]): void {
    if (!colPickerList) return;
    renderSeriesChipList({
        container: colPickerList,
        items: allCols.map((col) => ({
            column: col,
            checked: selectedCols.has(col),
            color: getColumnSeriesColor(col),
            title: `Toggle ${col} for drift analysis`,
            onToggle: (checked) => {
                if (checked) {
                    selectedCols.add(col);
                } else {
                    selectedCols.delete(col);
                    if (selectedCols.size === 0 && allCols.length > 0) selectedCols.add(allCols[0]!);
                }
                renderColumnChips(colPickerList, allCols);
                selectionChangeCallback?.();
            },
        })),
        chipClass: 'fft-trace-chip',
        postChipAttributes: { role: 'button', tabIndex: '0' },
    });
    syncPickerLabel(allCols);
}

function openPicker(colPickerPanel: HTMLElement | null, colPickerBtn: HTMLButtonElement | null): void {
    if (!colPickerPanel || !colPickerBtn) return;
    if (colPickerPanel.parentElement !== document.body) {
        document.body.appendChild(colPickerPanel);
    }
    colPickerPanel.classList.remove('drift-col-picker-panel--inline');
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

    renderColumnChips(colPickerList, allCols);
}

// ── Main bind function ───────────────────────────────────────────────────────
export function bindDriftControls(cb: DriftControlCallbacks, opts: DriftControlOptions): () => void {
    const abortController = new AbortController();
    const listenerOptions = { signal: abortController.signal };
    const {
        pageMetadata,
        workspace,
        colPickerBtn,
        colPickerPanel,
        colPickerList,
        colPickerLabel,
        colSelectAllBtn,
        colSelectSingleBtn,
        colSelectNoneBtn,
        windowSelect,
        plotTypeSelect,
        refPresetSelect,
        evaluationModeSelect,
        latestNInput,
        latestNHelper,
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

    selectedCols = new Set(numericCols);
    pickerLabelEl = colPickerLabel;
    selectionChangeCallback = cb.onSelectionChange;

    // ── Picker event listeners ──────────────────────────────────────────────
    colPickerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (colPickerPanel?.hidden === false) {
            closePicker(colPickerPanel, colPickerBtn);
        } else {
            openPicker(colPickerPanel, colPickerBtn);
        }
    }, listenerOptions);

    document.addEventListener('click', (e) => {
        if (!colPickerPanel || colPickerPanel.hidden) return;
        const wrap = document.getElementById('drift-col-picker-wrap');
        const target = e.target as Node;
        if (wrap && !wrap.contains(target) && !colPickerPanel.contains(target)) {
            closePicker(colPickerPanel, colPickerBtn);
        }
    }, listenerOptions);

    colPickerPanel?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') { closePicker(colPickerPanel, colPickerBtn); colPickerBtn?.focus(); }
    }, listenerOptions);

    repopulateColumnSelect(colPickerList, numericCols);

    // ── Reference preset ───────────────────────────────────────────────────
    const timeRange = pageMetadata?.time_range as { min: number; max: number } | undefined;
    function applyReferencePreset(preset: string): void {
        if (preset === 'custom') return;
        if (preset === 'viewport') {
            const viewport = workspace?.getSnapshot().viewport;
            const start = Number(viewport?.xMin);
            const end = Number(viewport?.xMax);
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
    }, listenerOptions);

    // ── Sort select ─────────────────────────────────────────────────────────
    sortSelect?.addEventListener('change', () => {
        setWindowSort(getDropdownValue('drift-sort-select') || 'time-desc');
        cb.renderWindowList();
    }, listenerOptions);

    // ── Detail column select ─────────────────────────────────────────────────
    detailColumnSelect?.addEventListener('change', () => {
        const column = getDropdownValue('drift-detail-col-select') || null;
        onDetailColumnChange(column, null);
    }, listenerOptions);

    // ── Plot type select (debounced) ─────────────────────────────────────────
    let plotTypeDebounce: ReturnType<typeof setTimeout> | null = null;
    plotTypeSelect?.addEventListener('change', () => {
        if (plotTypeDebounce !== null) clearTimeout(plotTypeDebounce);
        plotTypeDebounce = setTimeout(() => {
            plotTypeDebounce = null;
            cb.renderDetail();
        }, 80);
    }, listenerOptions);

    function syncEvaluationModeUi(): void {
        if (!latestNInput) return;
        const enabled = getDropdownValue('drift-evaluation-mode') === 'latest-n';
        latestNInput.disabled = !enabled;
        // Hide the entire field container (label + input + helper) when
        // Latest-N is not the active mode — usage_issue.md H4 — so the
        // toolbar only surfaces relevant knobs and the helper hint does
        // not float as a stray tooltip in the toolbar's right gutter.
        const fieldContainer = latestNInput.closest<HTMLElement>('.scatter-toolbar__field, .drift-toolbar__field');
        if (fieldContainer) {
            fieldContainer.hidden = !enabled;
            fieldContainer.style.display = enabled ? '' : 'none';
        }
        if (latestNHelper) {
            latestNHelper.hidden = enabled;
            latestNHelper.textContent = "Used only with 'Latest N windows' mode.";
        }
        if (!enabled) latestNInput.setAttribute('aria-describedby', 'drift-latest-n-helper');
        else latestNInput.removeAttribute('aria-describedby');
    }
    syncEvaluationModeUi();
    evaluationModeSelect?.addEventListener('change', syncEvaluationModeUi, listenerOptions);

    // ── Reference preset select ─────────────────────────────────────────────
    refPresetSelect?.addEventListener('change', () => {
        applyReferencePreset(getDropdownValue('drift-ref-preset') || 'custom');
    }, listenerOptions);

    // ── Column picker bulk actions ─────────────────────────────────────────
    colSelectAllBtn?.addEventListener('click', () => {
        numericCols.forEach((c) => selectedCols.add(c));
        renderColumnChips(colPickerList, numericCols);
        selectionChangeCallback?.();
        closePicker(colPickerPanel, colPickerBtn);
    }, listenerOptions);

    colSelectSingleBtn?.addEventListener('click', () => {
        const keep = [...selectedCols][0] || numericCols[0];
        if (keep) {
            selectedCols = new Set([keep]);
            renderColumnChips(colPickerList, numericCols);
            selectionChangeCallback?.();
        }
        closePicker(colPickerPanel, colPickerBtn);
    }, listenerOptions);

    colSelectNoneBtn?.addEventListener('click', () => {
        selectedCols = new Set(numericCols);
        renderColumnChips(colPickerList, numericCols);
        selectionChangeCallback?.();
    }, listenerOptions);

    // ── Zoom reset ──────────────────────────────────────────────────────────
    zoomResetBtn?.addEventListener('click', () => {
        timelineChartDispatch({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        timelineChartDispatch({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
        detailChartDispatch({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        detailChartDispatch({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    }, listenerOptions);

    // ── Export buttons ─────────────────────────────────────────────────────
    document.getElementById('drift-export-png')?.addEventListener('click', exportTimelinePNG, listenerOptions);
    document.getElementById('drift-export-detail-png')?.addEventListener('click', exportDetailPNG, listenerOptions);
    document.getElementById('drift-export-csv')?.addEventListener('click', cb.exportDriftCsv, listenerOptions);
    document.getElementById('drift-export-json')?.addEventListener('click', cb.exportDriftJson, listenerOptions);

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
    }, listenerOptions);

    // ── Page change listener (repopulate columns on page show) ─────────────
    const unsubscribeNavigation = onNavigationChange((change) => {
        if (change.page !== 'drift') return;
        const cols: string[] = Array.isArray(pageMetadata?.numeric_columns)
            ? pageMetadata.numeric_columns.filter((c: string) => c && c.toLowerCase() !== 'ts')
            : [];
        numericCols = cols;
        selectedCols = new Set(numericCols);
        repopulateColumnSelect(colPickerList, cols);
        selectionChangeCallback?.();
        cb.scheduleDriftChartRefresh();
    });

    return () => {
        abortController.abort();
        unsubscribeNavigation();
        if (plotTypeDebounce !== null) clearTimeout(plotTypeDebounce);
    };
}
