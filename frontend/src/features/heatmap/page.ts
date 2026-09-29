import { downloadBlob } from '../../utils/dom.js';
import { fetchCorrelationMatrix } from '../../services/api/index.js';
import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { exportElementPNG, exportElementSVG, exportElementHTML, exportMatrixCSV } from '../../utils/chartExport.js';
import { getDropdownValue, setDropdownDisabled, setDropdownValue } from '../../ui/primitives/Dropdown.js';
import { bindInfoPopovers } from '../../ui/infoPopovers.js';
import { initHeatmapHelp } from './help.js';
import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import { initToolbarPopovers } from '../../ui/toolbarPopovers.js';
import {
    getCorrelationModeGuide,
    getCorrelationModeLabel,
    normalizeCorrelationMetric,
    type CorrelationMetric,
} from '../../utils/correlationModes.js';
import { getSetting, updateSetting } from '../../utils/settings.js';
import {
    escapeHtmlAttribute as escapeAttr,
    correlationScaleGradient,
    formatScaleTick,
    getColorDomainMax,
} from './colorScale.js';
import {
    buildHeatmapStatus,
    getSelectedCorrelationMatrix,
    getUnavailableMatrixMessage,
} from './matrixPolicy.js';
import { buildHeatmapGridLayout } from './gridLayout.js';
import { buildHeatmapRenderOrder } from './orderingPolicy.js';
import { buildHeatmapCellPresentation } from './cellPresentation.js';
import { classifyHeatmapLoadError } from './loadErrorPolicy.js';
import { cleaningPlanStore, getCleaningPlanHash, type CleaningPlanStore } from '../../cleaning/store.js';
import type { WorkspaceStore, WorkspaceSnapshot } from '../../contracts/workspace.js';
import { buildScatterQueryContext, type ScatterQueryContext } from '../scatter/state.js';
import { toast } from '../../utils/toast.js';
import { requestScatterPair } from '../scatter/pairIntent.js';
import { copyTextToClipboard } from '../../utils/copyText.js';
import { beginCompletedAnalysisExportContext } from '../../utils/exportProvenanceContext.js';
import { MATRIX_POINT_LIMIT } from '../scatter/helpers.js';
import {
    readHeatmapDisplayModes,
    writeHeatmapDiagonalMode,
    writeHeatmapPairMode,
} from './displayModes.js';

interface HeatmapPageDeps {
    showPage: (pageName: string) => void;
    /** Optional so the page stays embeddable in isolated visual tests. */
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage'>;
    onPlanChanged?: () => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>;
}

let heatmapCellSize = 36;
let heatmapClusterEnabled = true;
// When `heatmapFitToScreen` is on, the matrix snaps to fill the available
// panel width regardless of the cell-size slider. The slider still drives
// the cell-size slider's display value, but its max is bypassed for layout.
// Default to fit-on so the matrix fills the available panel width on first
// load; users can still turn it off when they want slider-driven overflow.
let heatmapFitToScreen = true;
let heatmapAxisFit = false;
let heatmapOrderLocked = false;
let lastRenderedOrder: string[] | null = null;
const HEATMAP_FIT_STORAGE_KEY = 'edatime_heatmap_fit_to_screen';
const HEATMAP_METRIC_STORAGE_KEY = 'edatime_heatmap_metric';
// Hardcoded clustering cutoff. Exposed as a constant (rather than a slider)
// because the threshold is rarely useful to tune interactively and the
// default 0.85 works well across the datasets we have seen.
const HEATMAP_CLUSTER_THRESHOLD = 0.85;
let matrixData: CorrelationMatrixResponse | null = null;
let metric: CorrelationMetric = 'pearson_raw';
let matrixLoadSequence = 0;
let heatmapRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let heatmapResizeObserver: ResizeObserver | null = null;
let heatmapPageCleanup: (() => void) | null = null;
let heatmapControlAbort: AbortController | null = null;
let toolbarPopovers: ReturnType<typeof initToolbarPopovers> | null = null;
/** User's manual column/row order from drag-reorder. Persists across
 *  metric switches so users don't lose their custom sequence. Reset
 *  whenever clustering is toggled or a new dataset loads. */
let userColumnOrder: string[] | null = null;
let workspaceContextUnsubscribe: (() => void) | null = null;
let planContextUnsubscribe: (() => void) | null = null;

/** Release the current Heatmap feature instance and invalidate its loading work. */
export function disposeHeatmapPage(): void {
    matrixLoadSequence += 1;
    heatmapPageCleanup?.();
    heatmapPageCleanup = null;
    workspaceContextUnsubscribe?.();
    workspaceContextUnsubscribe = null;
    planContextUnsubscribe?.();
    planContextUnsubscribe = null;
    matrixData = null;
    userColumnOrder = null;
}

function readHeatmapFitPref(): boolean {
    try {
        return window.localStorage.getItem(HEATMAP_FIT_STORAGE_KEY) !== '0';
    } catch {
        return true;
    }
}

function writeHeatmapFitPref(value: boolean): void {
    try {
        window.localStorage.setItem(HEATMAP_FIT_STORAGE_KEY, value ? '1' : '0');
    } catch {
        // Ignore storage failures; the in-memory flag still governs layout.
    }
}

function readHeatmapMetricPref(): CorrelationMetric {
    try {
        const saved = window.sessionStorage.getItem(HEATMAP_METRIC_STORAGE_KEY);
        if (saved) return normalizeCorrelationMetric(saved);
    } catch {
        // Session storage is optional; the persisted application setting is
        // still a reliable fallback.
    }
    return normalizeCorrelationMetric(getSetting('defaultCorrelationMetric'));
}

function writeHeatmapMetricPref(value: CorrelationMetric): void {
    try {
        window.sessionStorage.setItem(HEATMAP_METRIC_STORAGE_KEY, value);
    } catch {
        // Keep the in-memory value and application setting when storage is
        // unavailable (for example, in privacy-restricted contexts).
    }
    updateSetting('defaultCorrelationMetric', value);
}

/**
 * Update the `--range-fill` custom property on a range input so the
 * accent-filled portion of the track reflects the current value.
 * The CSS in `frontend/css/modules/toolbar.css` uses this to draw a
 * filled progress on the slider track. Keeping this helper local to
 * the page avoids a cross-module dependency on scatter/controls.
 */
function updateRangeFill(input: HTMLInputElement | null): void {
    if (!input) return;
    const min = Number(input.min || '0');
    const max = Number(input.max || '100');
    const value = Number(input.value || '0');
    const span = Math.max(max - min, 1);
    const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
    input.style.setProperty('--range-fill', `${pct.toFixed(2)}%`);
}

function syncHeatmapEmptyState(message: string, visible: boolean, reason = '', title = ''): void {
    heatmapRuntime?.updateEmptyState({
        visible,
        reason: visible ? (reason || 'no-data') : '',
        title: title || (visible ? 'Correlation heatmap unavailable' : ''),
        message,
        fallbackText: message,
    });
    setHeatmapLoading(false);
}

function setHeatmapLoading(loading: boolean, label?: string): void {
    const overlay = document.getElementById('heatmap-loading');
    if (!overlay) return;
    overlay.hidden = !loading;
    if (label) {
        const labelEl = document.getElementById('heatmap-loading-label');
        if (labelEl) labelEl.textContent = label;
    }
}

function syncMetricGuide(): void {
    const infoIcon = document.getElementById('heatmap-metric-info');
    if (!infoIcon) return;
    infoIcon.setAttribute('data-info-tip', getCorrelationModeGuide(metric));
}

export async function initHeatmapPage(deps: HeatmapPageDeps): Promise<() => void> {
    disposeHeatmapPage();
    const syncSelectedPair = (x: string, y: string): void => {
        document.querySelectorAll<HTMLElement>('#heatmap-container .heatmap-cell').forEach((cell) => {
            const selected = cell.dataset.rowName === x && cell.dataset.colName === y;
            cell.classList.toggle('is-selected', selected);
            cell.setAttribute('aria-selected', String(selected));
        });
    };
    let activeKeyboardTarget: { kind: 'column'; name: string } | { kind: 'cell'; row: string; column: string } | null = null;
    const openScatterPair = (x: string, y: string): void => {
        syncSelectedPair(x, y);
        requestScatterPair(x, y);
        deps.showPage('scatter');
    };

    const captureQueryContext = (snapshot?: WorkspaceSnapshot): ScatterQueryContext | undefined => {
        if (!snapshot) return undefined;
        const context = buildScatterQueryContext({ scopeToColumns: false }, snapshot);
        return Object.freeze({
            ...context,
            filters: Object.freeze(context.filters.map((filter) => Object.freeze({ ...filter }))),
            lineFilters: Object.freeze(context.lineFilters.map((filter) => Object.freeze({ ...filter }))),
        }) as ScatterQueryContext;
    };
    const analysisContextKey = (snapshot?: WorkspaceSnapshot): string => JSON.stringify({
        filters: snapshot?.filters ?? null,
        viewport: snapshot?.viewport ?? null,
        cleaningPlanHash: getCleaningPlanHash(),
    });

    async function loadMatrix(nextMetric: CorrelationMetric = metric, snapshot?: WorkspaceSnapshot): Promise<void> {
        const loadSequence = ++matrixLoadSequence;
        matrixData = null;
        const container = document.getElementById('heatmap-container');
        if (container) container.innerHTML = '';
        const label = `Loading ${getCorrelationModeLabel(nextMetric)}…`;
        setHeatmapLoading(true, label);
        setDropdownDisabled('heatmap-metric', true);
        heatmapRuntime?.updateStatus(label);
        try {
            const queryContext = captureQueryContext(snapshot ?? deps.workspace?.getSnapshot());
            const completeAnalysisProvenance = beginCompletedAnalysisExportContext({
                pageName: 'heatmap',
                controls: {
                    metric: nextMetric,
                    queryContext: JSON.stringify(queryContext ?? null),
                },
            });
            const response = await fetchCorrelationMatrix(nextMetric, queryContext);
            if (loadSequence !== matrixLoadSequence) return;
            // The previous dataset's manual order doesn't apply to the
            // next one — clear it so the next render either clusters or
            // shows the new columns in source order.
            if (!heatmapOrderLocked) userColumnOrder = null;
            matrixData = response;
            completeAnalysisProvenance(response.executionIdentity ?? null);
            if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
                await (document as any).fonts.ready;
            }
            requestAnimationFrame(() => {
                if (loadSequence === matrixLoadSequence) renderHeatmap();
            });
        } catch (error: any) {
            if (loadSequence !== matrixLoadSequence) return;
            const presentation = classifyHeatmapLoadError(error);
            syncHeatmapEmptyState(
                presentation.message,
                true,
                presentation.reason,
                presentation.title,
            );
            heatmapRuntime?.updateStatus(presentation.status);
        } finally {
            if (loadSequence === matrixLoadSequence) setDropdownDisabled('heatmap-metric', false);
        }
    }

    function renderHeatmap(): void {
        const container = document.getElementById('heatmap-container');
        if (!container) return;
        if (!matrixData) {
            syncHeatmapEmptyState(
                'Correlation heatmap will appear here once the dataset is available.',
                true,
                'no-data',
                'Awaiting dataset',
            );
            return;
        }

        const restoreKeyboardFocus = container.contains(document.activeElement);
        const displayModes = readHeatmapDisplayModes();

        const columns = matrixData.columns;
        const data = getSelectedCorrelationMatrix(matrixData, metric);
        const size = columns.length;
        if (size === 0) {
            container.innerHTML = '';
            syncHeatmapEmptyState(
                'No numeric columns are available for the correlation heatmap.',
                true,
                'no-columns-available',
                'No numeric columns',
            );
            return;
        }
        if (!data) {
            container.innerHTML = '';
            syncHeatmapEmptyState(
                getUnavailableMatrixMessage(metric),
                true,
                'matrix-unavailable',
                'Matrix unavailable',
            );
            heatmapRuntime?.updateStatus(`${getCorrelationModeLabel(metric)} unavailable in the response`);
            return;
        }

        syncHeatmapEmptyState('', false);
        const colorDomainMax = getColorDomainMax(data, heatmapAxisFit);
        const gridLayout = buildHeatmapGridLayout({
            columnCount: size,
            preferredCellSize: heatmapCellSize,
            containerWidth: Math.max(
            container.clientWidth || 0,
            container.getBoundingClientRect().width || 0,
            ),
            fitToScreen: heatmapFitToScreen,
        });
        const { labelWidth, responsiveCell, headerCellSize, useVerticalHeaders, colTemplate, rowTemplate } = gridLayout;

        // Optionally reorder columns by cluster. The data arrays stay
        // indexed by the ORIGINAL column order; we map render position
        // -> original index when emitting cell data attributes.
        const initialOrder = buildHeatmapRenderOrder({
            columns,
            matrix: data,
            savedOrder: userColumnOrder,
            clusterEnabled: heatmapClusterEnabled,
            clusterThreshold: HEATMAP_CLUSTER_THRESHOLD,
        });
        let renderOrder = initialOrder.order;
        const clusters = initialOrder.clusters;
        const orderToOriginal = initialOrder.originalIndices;
        const orderChanged = lastRenderedOrder !== null && lastRenderedOrder.join('\u0000') !== renderOrder.join('\u0000');
        lastRenderedOrder = [...renderOrder];

        // Build a uniform N x N grid: 1 label column/row + size data cells.
        // The grid is identical between grouped and ungrouped views so the
        // layout stays predictable; cluster boundaries are conveyed through
        // the heatmap-header--cluster-start / heatmap-row-label--cluster-start
        // classes (a stronger text color on the first header/label of each
        // cluster) rather than physical separator rows/columns.
        // 1-based grid column/row for a render position. Column/row 1 is
        // the label gutter; renderIdx 0 sits at column 2.
        const colGridFor = (renderIdx: number): number => 2 + renderIdx;
        const rowGridFor = (renderIdx: number): number => 2 + renderIdx;

        // Preserve native grid navigation semantics with one explicit row
        // wrapper per visual matrix row. `display: contents` lets the cells
        // remain direct CSS grid items while exposing complete ARIA rows.
        const gridRows: string[] = [];
        const headerCells: string[] = [];
        let hasRovingTabStop = false;
        const metricLabel = getCorrelationModeLabel(metric);
        headerCells.push(
            `<div role="columnheader" aria-rowindex="1" aria-colindex="1" class="heatmap-corner" aria-label="Rows are variables and columns are variables. Active metric: ${escapeAttr(metricLabel)}." style="grid-column:1;grid-row:1;">`
            + `<span class="heatmap-corner__axis" aria-hidden="true">Y / X</span>`
            + `<span class="heatmap-corner__metric" aria-hidden="true">${escapeAttr(metricLabel)}</span>`
            + `</div>`,
        );
        for (let c = 0; c < size; c++) {
            const colName = renderOrder[c]!;
            const colOriginal = orderToOriginal.get(c) ?? c;
            const isFirstInCluster = c > 0 && clusters.some((cl) => cl.startIndex === c);
            const headerClass = [
                'heatmap-header',
                isFirstInCluster ? 'heatmap-header--cluster-start' : '',
                useVerticalHeaders ? 'heatmap-header--vertical' : '',
            ].filter(Boolean).join(' ');
            const clusterStyle = isFirstInCluster ? 'border-left: 2px solid var(--accent); padding-left: 4px;' : '';
            const isActiveHeader = activeKeyboardTarget?.kind === 'column' && activeKeyboardTarget.name === colName;
            headerCells.push(
                `<div role="columnheader" aria-rowindex="1" aria-colindex="${c + 2}" aria-label="${escapeAttr(`${colName}, column ${c + 1} of ${size}. Use Alt+ArrowLeft or Alt+ArrowRight to reorder.`)}" class="${headerClass}" draggable="true" data-drag-axis="col" data-drag-name="${escapeAttr(colName)}" data-drag-original="${colOriginal}" data-order-index="${c}" tabindex="${isActiveHeader ? '0' : '-1'}" style="grid-column:${colGridFor(c)};grid-row:1;${clusterStyle}--heatmap-header-cell:${headerCellSize}px;" title="${escapeAttr(colName)}" data-cluster-col="${colOriginal}">${escapeAttr(colName)}</div>`,
            );
        }
        gridRows.push(`<div role="row" aria-rowindex="1" class="heatmap-grid-row">${headerCells.join('')}</div>`);

        for (let r = 0; r < size; r++) {
            const rowCells: string[] = [];
            const rowName = renderOrder[r]!;
            const rowOriginal = orderToOriginal.get(r) ?? r;
            const isFirstInCluster = r > 0 && clusters.some((cl) => cl.startIndex === r);
            const labelClass = isFirstInCluster ? ' heatmap-row-label--cluster-start' : '';
            const clusterStyle = isFirstInCluster ? 'border-top: 2px solid var(--accent);' : '';
            rowCells.push(
                `<div role="rowheader" aria-rowindex="${r + 2}" aria-colindex="1" class="heatmap-row-label${labelClass}" draggable="true" data-drag-axis="row" data-drag-name="${escapeAttr(rowName)}" data-drag-original="${rowOriginal}" style="grid-column:1;grid-row:${rowGridFor(r)};${clusterStyle}min-height:${headerCellSize}px;height:${headerCellSize}px;" title="${escapeAttr(rowName)}" data-cluster-row="${rowOriginal}">${escapeAttr(rowName)}</div>`,
            );
            for (let c = 0; c < size; c++) {
                const colName = renderOrder[c]!;
                const colOriginal = orderToOriginal.get(c) ?? c;
                const value = data[rowOriginal]?.[colOriginal] ?? null;
                const presentation = buildHeatmapCellPresentation({
                    value,
                    colorDomainMax,
                    rowName,
                    columnName: colName,
                    interactive: rowOriginal !== colOriginal && value !== null && Number.isFinite(value),
                });
                const isDiagonal = rowOriginal === colOriginal;
                const densityCell = isDiagonal
                    ? displayModes.diagonal === 'kde'
                    : displayModes.pairs === 'density';
                const cellClass = [
                    'heatmap-cell',
                    presentation.toneClass,
                    isDiagonal ? 'heatmap-cell--diagonal' : '',
                    densityCell ? 'heatmap-cell--density' : '',
                ].filter(Boolean).join(' ');
                const cellStyle = densityCell
                    ? `background:var(--surface-2);color:var(--text);border:2px solid ${presentation.background};`
                    : `background:${presentation.background};color:${presentation.textColor};`;
                const validN = (metric.endsWith('_diff') ? matrixData?.diff_counts : matrixData?.counts)?.[rowOriginal]?.[colOriginal];
                const eligible = matrixData?.input_rows == null ? null : Math.max(0, matrixData.input_rows - (metric.endsWith('_diff') ? 1 : 0));
                const countScope = validN == null ? 'Pairwise n unavailable.' : `Pairwise valid n = ${validN.toLocaleString()}; ${eligible == null ? 'unknown' : (eligible - validN).toLocaleString()} excluded from ${eligible?.toLocaleString() ?? 'unknown'} eligible ${metric.endsWith('_diff') ? 'adjacent changes' : 'rows'}.`;
                const range = matrixData?.time_range_ms;
                const rangeScope = range ? `Working range: ${new Date(range[0]).toISOString()} – ${new Date(range[1]).toISOString()} (UTC).` : 'Working range unavailable.';
                const previewScope = `${countScope} ${rangeScope} ${metricLabel} correlation; pair previews use sampled working-data levels with current linked filters and time window (up to ${MATRIX_POINT_LIMIT} observations per pair).`;
                const isActiveCell = activeKeyboardTarget?.kind === 'cell'
                    && activeKeyboardTarget.row === rowName && activeKeyboardTarget.column === colName;
                const isRovingCell = presentation.interactive && (isActiveCell || (!activeKeyboardTarget && !hasRovingTabStop));
                if (isRovingCell) hasRovingTabStop = true;
                rowCells.push(
                    `<div role="gridcell" aria-rowindex="${r + 2}" aria-colindex="${c + 2}" class="${cellClass}" data-interactive="${presentation.interactive}" data-row="${rowOriginal}" data-col="${colOriginal}" data-row-name="${escapeAttr(rowName)}" data-col-name="${escapeAttr(colName)}" data-correlation-value="${Number.isFinite(value) ? value : ''}" data-correlation-label="${escapeAttr(presentation.signedValue)}" data-cell-background="${escapeAttr(presentation.background)}" data-cell-color="${escapeAttr(presentation.textColor)}" data-correlation-tooltip="${escapeAttr(`${presentation.tooltip} ${countScope} ${rangeScope}`)}" style="grid-column:${colGridFor(c)};grid-row:${rowGridFor(r)};${cellStyle}cursor:${presentation.interactive ? 'pointer' : 'default'};" aria-label="${escapeAttr(`Row ${r + 1} of ${size}, column ${c + 1} of ${size}. ${presentation.tooltip} ${previewScope}`)}" title="${escapeAttr(`${presentation.tooltip} ${previewScope}`)}" tabindex="${isRovingCell ? '0' : '-1'}"><canvas class="heatmap-cell-canvas" data-css-height="${responsiveCell}" aria-hidden="true"></canvas></div>`,
                );
            }
            gridRows.push(`<div role="row" aria-rowindex="${r + 2}" class="heatmap-grid-row">${rowCells.join('')}</div>`);
        }

        let html = '<div class="heatmap-shell">';
        html += `<div role="grid" aria-rowcount="${size + 1}" aria-colcount="${size + 1}" aria-label="${escapeAttr(`${metricLabel} correlation matrix. Use arrow keys to move through headers and cells. Press Alt+ArrowLeft or Alt+ArrowRight on a column header to reorder it. Click or press Enter or Space on an off-diagonal cell to open its Pair plot.`)}" class="heatmap-grid" style="display:grid;grid-template-columns:${colTemplate};grid-template-rows:${rowTemplate};">`;
        html += gridRows.join('');
        html += '</div>';
        html += '<div class="heatmap-legend-stack">';
        const densityScaleActive = displayModes.pairs === 'density';
        const legendDescription = densityScaleActive
            ? 'Shared color scale. Negative correlations and lower relative pair density are at the low end; positive correlations and higher relative pair density are at the high end.'
            : 'Correlation scale, shown by each cell frame and signed coefficient.';
        html += `<div class="heatmap-grid-legend" role="group" aria-label="${legendDescription}">`;
        html += `<span class="heatmap-grid-legend__tick heatmap-grid-legend__tick--negative">-${formatScaleTick(colorDomainMax)}${densityScaleActive ? ' / Lower' : ''}</span>`;
        html += `<div class="heatmap-grid-legend__bar" aria-hidden="true" style="background:${correlationScaleGradient(undefined, '90deg')}"></div>`;
        html += `<span class="heatmap-grid-legend__tick heatmap-grid-legend__tick--positive">+${formatScaleTick(colorDomainMax)}${densityScaleActive ? ' / Higher' : ''}</span>`;
        html += '</div>';
        html += '<div class="heatmap-cell-inspector"><p id="heatmap-focus-readout" role="status" aria-live="polite">Focus or point to a cell to inspect its correlation. Click or press Enter or Space to open its Pair plot.</p><div class="heatmap-cell-inspector__actions"><button id="heatmap-copy-cell-btn" class="btn btn-ghost btn-sm" type="button" disabled>Copy cell summary</button><button id="heatmap-open-pair-btn" class="btn btn-accent btn-sm" type="button" disabled>Open Pair plot</button></div></div>';
        html += '<div id="heatmap-keyboard-status" class="sr-only" role="status" aria-live="polite"></div>';
        html += '</div>';
        html += '</div>';
        if (heatmapClusterEnabled && orderChanged && !heatmapOrderLocked) {
            html += `<div class="heatmap-order-caption" role="status">Order updated by clustering under ${escapeAttr(metricLabel)}.</div>`;
        }

        container.innerHTML = html;
        const keyboardTarget = container.querySelector<HTMLElement>('[tabindex="0"]')
            ?? container.querySelector<HTMLElement>('.heatmap-cell[data-interactive="true"]')
            ?? container.querySelector<HTMLElement>('.heatmap-header');
        if (keyboardTarget) keyboardTarget.tabIndex = 0;
        syncSelectedPair(
            getDropdownValue('scatter-x-col'),
            getDropdownValue('scatter-y-col'),
        );
        const focusReadout = container.querySelector<HTMLElement>('#heatmap-focus-readout');
        const copyCellButton = container.querySelector<HTMLButtonElement>('#heatmap-copy-cell-btn');
        let focusedCellSummary = '';
        let focusedPair: { x: string; y: string } | null = null;
        const openPairButton = container.querySelector<HTMLButtonElement>('#heatmap-open-pair-btn');
        const updateFocusedCell = (cell: HTMLElement) => {
            if (cell.dataset.interactive !== 'true') return;
            const rowName = cell.dataset.rowName || '';
            const columnName = cell.dataset.colName || '';
            const value = Number(cell.dataset.correlationValue);
            const label = cell.dataset.correlationLabel || (Number.isFinite(value) ? value.toFixed(3) : '—');
            const sampleCount = Number(cell.dataset.previewSampleCount);
            focusedCellSummary = `${metricLabel}: ${cell.dataset.correlationTooltip || `${rowName} and ${columnName}: ${label}`}${Number.isFinite(sampleCount) ? `; ${sampleCount.toLocaleString()} rendered preview pairs` : ''}. Serial dependence and shared trends can inflate associations; no independent-observation confidence interval is claimed.`;
            focusedPair = { x: rowName, y: columnName };
            activeKeyboardTarget = { kind: 'cell', row: rowName, column: columnName };
            syncSelectedPair(rowName, columnName);
            if (focusReadout) focusReadout.textContent = focusedCellSummary;
            if (copyCellButton) copyCellButton.disabled = false;
            if (openPairButton) { openPairButton.disabled = false; openPairButton.textContent = `Open Pair plot: ${rowName} × ${columnName}`; }
        };
        container.querySelector('.heatmap-shell')?.addEventListener('focusin', (event) => {
            const cell = (event.target as HTMLElement).closest<HTMLElement>('.heatmap-cell[data-interactive="true"]');
            if (cell) updateFocusedCell(cell);
        });
        container.querySelector('.heatmap-shell')?.addEventListener('pointerover', (event) => {
            const cell = (event.target as HTMLElement).closest<HTMLElement>('.heatmap-cell[data-interactive="true"]');
            if (cell) updateFocusedCell(cell);
        });
        copyCellButton?.addEventListener('click', async () => {
            if (!focusedCellSummary || !copyCellButton) return;
            const copied = await copyTextToClipboard(focusedCellSummary);
            if (focusReadout) focusReadout.textContent = copied ? `Copied: ${focusedCellSummary}` : 'Copy was blocked by the browser. Select the focused cell summary and copy its text.';
        });
        openPairButton?.addEventListener('click', () => {
            if (focusedPair) openScatterPair(focusedPair.x, focusedPair.y);
        });
        document.dispatchEvent(new CustomEvent('edatime:heatmap-grid-rendered'));
        // Mouse, touch, and keyboard activation open the selected pair directly.
        // Focus and hover still expose the readout and optional explicit action.
        container.onclick = (event: MouseEvent) => {
            const cell = (event.target as HTMLElement).closest<HTMLElement>('.heatmap-cell[data-interactive="true"]');
            if (!cell) return;
            updateFocusedCell(cell);
            openScatterPair(cell.dataset.rowName || '', cell.dataset.colName || '');
        };

        const reorderColumnByDelta = (name: string, delta: -1 | 1): void => {
            if (heatmapOrderLocked) return;
            const fromIndex = renderOrder.indexOf(name);
            const toIndex = fromIndex + delta;
            if (fromIndex < 0 || toIndex < 0 || toIndex >= size) return;
            const next = renderOrder.slice();
            next.splice(fromIndex, 1);
            next.splice(toIndex, 0, name);
            renderOrder = next;
            userColumnOrder = next.slice();
            activeKeyboardTarget = { kind: 'column', name };
            renderHeatmap();
            const movedHeader = Array.from(container.querySelectorAll<HTMLElement>('.heatmap-header'))
                .find((header) => header.dataset.dragName === name);
            movedHeader?.focus();
            const position = next.indexOf(name) + 1;
            const status = container.querySelector<HTMLElement>('#heatmap-keyboard-status');
            if (status) status.textContent = `Moved ${name} to column ${position} of ${size}.`;
        };
        container.onkeydown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            const grid = container.querySelector<HTMLElement>('.heatmap-grid');
            if (!grid) return;
            const header = target.closest<HTMLElement>('.heatmap-header');
            if (header) {
                const current = Number(header.dataset.orderIndex);
                if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                    event.preventDefault();
                    reorderColumnByDelta(header.dataset.dragName || '', event.key === 'ArrowLeft' ? -1 : 1);
                    return;
                }
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    const next = grid.querySelector<HTMLElement>(`.heatmap-header[data-order-index="${current + (event.key === 'ArrowLeft' ? -1 : 1)}"]`);
                    next?.focus();
                    return;
                }
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    const columnIndex = Number(header.getAttribute('aria-colindex'));
                    for (let rowIndex = 2; rowIndex <= size + 1; rowIndex++) {
                        const cell = grid.querySelector<HTMLElement>(`.heatmap-cell[data-interactive="true"][aria-rowindex="${rowIndex}"][aria-colindex="${columnIndex}"]`);
                        if (cell) { cell.focus(); return; }
                    }
                }
                return;
            }
            const cell = target.closest<HTMLElement>('.heatmap-cell[data-interactive="true"]');
            if (!cell) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                cell.click();
                return;
            }
            const directions: Record<string, [number, number]> = {
                ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
            };
            const direction = directions[event.key];
            if (!direction) return;
            event.preventDefault();
            let rowIndex = Number(cell.getAttribute('aria-rowindex'));
            let columnIndex = Number(cell.getAttribute('aria-colindex'));
            const [rowStep, columnStep] = direction;
            while (true) {
                rowIndex += rowStep;
                columnIndex += columnStep;
                if (rowIndex < 2 || rowIndex > size + 1 || columnIndex < 2 || columnIndex > size + 1) break;
                const next = grid.querySelector<HTMLElement>(`.heatmap-cell[data-interactive="true"][aria-rowindex="${rowIndex}"][aria-colindex="${columnIndex}"]`);
                if (next) { next.focus(); return; }
            }
            if (event.key === 'ArrowUp') {
                const columnHeader = grid.querySelector<HTMLElement>(`.heatmap-header[aria-colindex="${Number(cell.getAttribute('aria-colindex'))}"]`);
                columnHeader?.focus();
            }
        };

        // C10: Excel-style row/column hover highlight. When the user
        // mouses over a row label, every cell in that row paints with a
        // soft outline. Same affordance fires for column headers. The
        // handlers use classList toggles instead of inline styles so the
        // effect stays under the CSS theme and respects reduced-motion.
        const shell = container.querySelector<HTMLElement>('.heatmap-shell');
        const grid = container.querySelector<HTMLElement>('.heatmap-grid');
        if (shell && grid) {
            const clearHighlights = () => {
                grid.querySelectorAll<HTMLElement>('.heatmap-row-highlight, .heatmap-col-highlight')
                    .forEach((el) => el.classList.remove('heatmap-row-highlight', 'heatmap-col-highlight'));
            };
            shell.addEventListener('mouseover', (event) => {
                const target = event.target as HTMLElement;
                const rowLabel = target.closest<HTMLElement>('.heatmap-row-label');
                const colHeader = target.closest<HTMLElement>('.heatmap-header');
                const cell = target.closest<HTMLElement>('.heatmap-cell');
                clearHighlights();
                if (cell && grid) {
                    const row = cell.dataset.row;
                    const col = cell.dataset.col;
                    grid.querySelectorAll<HTMLElement>(`.heatmap-cell[data-row="${row}"]`)
                        .forEach((el) => el.classList.add('heatmap-row-highlight'));
                    grid.querySelectorAll<HTMLElement>(`.heatmap-cell[data-col="${col}"]`)
                        .forEach((el) => el.classList.add('heatmap-col-highlight'));
                    grid.querySelector<HTMLElement>(`.heatmap-row-label[data-cluster-row="${row}"]`)?.classList.add('heatmap-row-highlight');
                    grid.querySelector<HTMLElement>(`.heatmap-header[data-cluster-col="${col}"]`)?.classList.add('heatmap-col-highlight');
                } else if (rowLabel && grid) {
                    const row = rowLabel.dataset.clusterRow;
                    if (row !== undefined) {
                        grid.querySelectorAll<HTMLElement>(`.heatmap-cell[data-row="${row}"]`)
                            .forEach((el) => el.classList.add('heatmap-row-highlight'));
                    }
                    rowLabel.classList.add('heatmap-row-highlight');
                } else if (colHeader && grid) {
                    const col = colHeader.dataset.clusterCol;
                    if (col !== undefined) {
                        grid.querySelectorAll<HTMLElement>(`.heatmap-cell[data-col="${col}"]`)
                            .forEach((el) => el.classList.add('heatmap-col-highlight'));
                    }
                    colHeader.classList.add('heatmap-col-highlight');
                }
            });
            shell.addEventListener('mouseleave', clearHighlights);
            // Keep a single tab stop across reorderable headers and pair cells.
            grid.addEventListener('focusin', (event) => {
                const target = (event.target as HTMLElement).closest<HTMLElement>('.heatmap-header, .heatmap-cell[data-interactive="true"]');
                if (!target) return;
                if (target.classList.contains('heatmap-header')) {
                    activeKeyboardTarget = { kind: 'column', name: target.dataset.dragName || '' };
                } else {
                    activeKeyboardTarget = {
                        kind: 'cell', row: target.dataset.rowName || '', column: target.dataset.colName || '',
                    };
                }
                grid.querySelectorAll<HTMLElement>('.heatmap-header, .heatmap-cell[data-interactive="true"]')
                    .forEach((item) => { item.tabIndex = -1; });
                target.tabIndex = 0;
            });
            // Keyboard accessibility: focus a header/label and the same
            // highlight applies. `focusin` bubbles up to the shell.
            shell.addEventListener('focusin', (event) => {
                const target = event.target as HTMLElement;
                const rowLabel = target.closest<HTMLElement>('.heatmap-row-label');
                const colHeader = target.closest<HTMLElement>('.heatmap-header');
                clearHighlights();
                if (rowLabel && grid) {
                    const row = rowLabel.dataset.clusterRow;
                    if (row !== undefined) {
                        grid.querySelectorAll<HTMLElement>(`.heatmap-cell[data-row="${row}"]`)
                            .forEach((el) => el.classList.add('heatmap-row-highlight'));
                    }
                    rowLabel.classList.add('heatmap-row-highlight');
                } else if (colHeader && grid) {
                    const col = colHeader.dataset.clusterCol;
                    if (col !== undefined) {
                        grid.querySelectorAll<HTMLElement>(`.heatmap-cell[data-col="${col}"]`)
                            .forEach((el) => el.classList.add('heatmap-col-highlight'));
                    }
                    colHeader.classList.add('heatmap-col-highlight');
                }
            });
            shell.addEventListener('focusout', (event) => {
                // Only clear when the focus leaves the shell entirely.
                const next = event.relatedTarget as Element | null;
                if (!next || !shell.contains(next)) clearHighlights();
            });
        }

        // C11: drag-to-reorder rows/columns. Re-rendering with the new
        // `renderOrder` array preserves the symmetric structure of the
        // matrix (corr(X,Y) == corr(Y,X)) because both rows and cols
        // follow the same order. Highlight the drop target with the
        // same class as the matrix page's drop target.
        let draggingAxis: 'col' | 'row' | null = null;
        let draggingName: string | null = null;
        const gridEl = container.querySelector<HTMLElement>('.heatmap-grid');
        if (gridEl) {
            gridEl.addEventListener('dragstart', (event) => {
                const target = event.target as HTMLElement;
                const handle = target.closest<HTMLElement>('[data-drag-axis]');
                if (!handle) return;
                const axis = handle.getAttribute('data-drag-axis');
                if (axis !== 'col' && axis !== 'row') return;
                draggingAxis = axis;
                draggingName = handle.getAttribute('data-drag-name');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', draggingName || '');
                }
                handle.classList.add('is-dragging');
            });
            gridEl.addEventListener('dragend', () => {
                draggingAxis = null;
                draggingName = null;
                gridEl.querySelectorAll<HTMLElement>('.scatter-matrix-drop-target')
                    .forEach((el) => el.classList.remove('scatter-matrix-drop-target', 'is-dragging'));
            });
            gridEl.addEventListener('dragover', (event) => {
                const target = event.target as HTMLElement;
                const handle = target.closest<HTMLElement>('[data-drag-axis]');
                if (!handle || !draggingAxis) return;
                const axis = handle.getAttribute('data-drag-axis');
                if (axis !== draggingAxis) return;
                const handleName = handle.getAttribute('data-drag-name');
                if (!handleName || handleName === draggingName) return;
                event.preventDefault();
                handle.classList.add('scatter-matrix-drop-target');
            });
            gridEl.addEventListener('dragleave', (event) => {
                const target = event.target as HTMLElement;
                const handle = target.closest<HTMLElement>('[data-drag-axis]');
                if (handle) handle.classList.remove('scatter-matrix-drop-target');
            });
            gridEl.addEventListener('drop', (event) => {
                const target = event.target as HTMLElement;
                const handle = target.closest<HTMLElement>('[data-drag-axis]');
                if (!handle || !draggingAxis || !draggingName) return;
                const axis = handle.getAttribute('data-drag-axis');
                if (axis !== draggingAxis) return;
                const targetName = handle.getAttribute('data-drag-name');
                if (!targetName || targetName === draggingName) return;
                event.preventDefault();
                // Apply the reorder at the data layer and re-render.
                const next = renderOrder.slice();
                const fromIdx = next.indexOf(draggingName);
                const toIdx = next.indexOf(targetName);
                if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
                next.splice(fromIdx, 1);
                next.splice(toIdx, 0, draggingName);
                renderOrder = next;
                // Save the user's manual order so subsequent re-renders
                // (e.g. after a metric switch) keep it.
                userColumnOrder = renderOrder.slice();
                renderHeatmap();
            });
        }

        if (restoreKeyboardFocus) keyboardTarget?.focus({ preventScroll: true });

        heatmapRuntime?.updateStatus(`${getCorrelationModeLabel(metric)} · ${buildHeatmapStatus(columns.length, heatmapCellSize)}`);
    }

    const getVisibleHeatmapContainer = (): HTMLElement | null => {
        const page = document.getElementById('page-heatmap');
        const container = document.getElementById('heatmap-container');
        if (!container || page?.hidden || !container.querySelector('.heatmap-grid')) return null;
        return container;
    };
    const exportVisibleHeatmap = (
        exporter: (element: HTMLElement, filename: string) => void | Promise<void>,
        filename: string,
    ): void => {
        const container = getVisibleHeatmapContainer();
        if (container) void exporter(container, filename);
    };

    let latestContextKey = analysisContextKey(deps.workspace?.getSnapshot());
    workspaceContextUnsubscribe = deps.workspace?.subscribe((snapshot) => {
        const nextKey = analysisContextKey(snapshot);
        if (nextKey === latestContextKey) return;
        latestContextKey = nextKey;
        const page = document.getElementById('page-heatmap');
        if (page?.hidden) return;
        void loadMatrix(metric, snapshot);
    }) ?? null;
    planContextUnsubscribe = cleaningPlanStore.subscribe(() => {
        const snapshot = deps.workspace?.getSnapshot();
        const nextKey = analysisContextKey(snapshot);
        if (nextKey === latestContextKey) return;
        latestContextKey = nextKey;
        const page = document.getElementById('page-heatmap');
        if (page?.hidden) return;
        void loadMatrix(metric, snapshot);
    });

    heatmapRuntime = createAnalysisPageRuntime({
        page: 'heatmap',
        emptyStateRootId: 'heatmap-empty-state',
        emptyStateTitleId: 'heatmap-empty-state-title',
        emptyStateMessageId: 'heatmap-empty-state-message',
        exportConfig: {
            key: 'heatmap',
            png: { fn: (filename) => exportVisibleHeatmap(exportElementPNG, filename), filename: 'edatime_heatmap.png' },
            svg: { fn: (filename) => exportVisibleHeatmap(exportElementSVG, filename), filename: 'edatime_heatmap.svg' },
            html: { fn: (filename) => exportVisibleHeatmap(exportElementHTML, filename), filename: 'edatime_heatmap.html' },
            csv: {
                fn: (filename) => {
                    const data = matrixData ? getSelectedCorrelationMatrix(matrixData, metric) : null;
                    if (!matrixData || !data) return;
                    if (!getVisibleHeatmapContainer()) return;
                    const counts = metric.endsWith('_diff') ? matrixData.diff_counts : matrixData.counts;
                    const eligible = matrixData.input_rows == null ? null : Math.max(0, matrixData.input_rows - (metric.endsWith('_diff') ? 1 : 0));
                    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
                    const rows = [['row', 'column', 'metric', 'coefficient', 'valid_n', 'excluded', 'eligible', 'working_start_utc', 'working_end_utc']];
                    matrixData.columns.forEach((row, i) => matrixData!.columns.forEach((column, j) => {
                        const n = counts?.[i]?.[j];
                        rows.push([row, column, metric, String(data[i]?.[j] ?? ''), String(n ?? ''), String(n == null || eligible == null ? '' : eligible - n), String(eligible ?? ''),
                            ...([0, 1].map((index) => matrixData?.time_range_ms ? new Date(matrixData.time_range_ms[index]).toISOString() : ''))]);
                    }));
                    downloadBlob(new Blob([rows.map((row) => row.map(quote).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), `edatime_correlation_${metric}.csv`);
                },
                filename: `edatime_correlation_${metric}.csv`,
                dataCheck: () => matrixData != null && getSelectedCorrelationMatrix(matrixData, metric) != null,
            },
        },
        init() {
            heatmapControlAbort?.abort();
            const controlAbort = new AbortController();
            heatmapControlAbort = controlAbort;
            const listenerOptions = { signal: controlAbort.signal };
            const container = document.getElementById('heatmap-container');
            const metricSelect = document.getElementById('heatmap-metric') as HTMLElement | null;
            const diagonalModeSelect = document.getElementById('heatmap-diagonal-mode');
            const pairModeSelect = document.getElementById('heatmap-pair-mode');
            const sizeInput = document.getElementById('heatmap-cell-size') as HTMLInputElement | null;
            const sizeValue = document.getElementById('heatmap-cell-size-value') as HTMLElement | null;
            const clusterToggle = document.getElementById('heatmap-cluster-toggle') as HTMLInputElement | null;
            const lockOrderToggle = document.getElementById('heatmap-lock-order') as HTMLInputElement | null;
            const lockOrderStatus = document.getElementById('heatmap-order-locked-status') as HTMLElement | null;
            const fitToggle = document.getElementById('heatmap-fit-toggle') as HTMLButtonElement | null;
            const axisFitToggle = document.getElementById('heatmap-axis-fit-toggle') as HTMLButtonElement | null;
            const addMatrixColumnsButton = document.getElementById('heatmap-add-columns-to-plan') as HTMLButtonElement | null;
            const planDialog = document.getElementById('heatmap-plan-columns-dialog') as HTMLDialogElement | null;
            const planSummary = document.getElementById('heatmap-plan-columns-summary');
            const planConfirm = document.getElementById('heatmap-plan-columns-confirm') as HTMLButtonElement | null;
            const planCancel = document.getElementById('heatmap-plan-columns-cancel') as HTMLButtonElement | null;
            if (!container) return;
            const selectedPlanColumns = (): string[] | null => {
                const plan = deps.cleaningPlanStore?.getSnapshot();
                if (!plan || !matrixData || matrixData.columns.length === 0) return null;
                return [...new Set([plan.timeColumn, ...matrixData.columns])];
            };
            const closePlanDialog = () => {
                if (!planDialog) return;
                if (planDialog.open) planDialog.close();
                else planDialog.hidden = true;
            };
            addMatrixColumnsButton?.addEventListener('click', () => {
                const plan = deps.cleaningPlanStore?.getSnapshot();
                const columns = selectedPlanColumns();
                if (!plan || !columns) {
                    if (planSummary) planSummary.textContent = 'Load a correlation matrix before creating a stage.';
                    return;
                }
                if (planSummary) {
                    planSummary.textContent = `Stage added on confirmation: 'Keep ${columns.length - 1} columns' as Step ${plan.stages.length + 1} in the current Preparation plan. It keeps the canonical time column plus the numeric matrix columns. It does not alter values or remove rows.`;
                }
                if (typeof planDialog?.showModal === 'function') planDialog.showModal();
                else if (planDialog) planDialog.hidden = false;
            }, listenerOptions);
            planCancel?.addEventListener('click', closePlanDialog, listenerOptions);
            planConfirm?.addEventListener('click', () => {
                const plan = deps.cleaningPlanStore?.getSnapshot();
                const columns = selectedPlanColumns();
                if (!plan || !columns) return;
                deps.cleaningPlanStore!.addStage({
                    kind: 'columnSelect',
                    executionClass: 'polarsExpression',
                    scope: 'schema',
                    enabled: true,
                    sourcePage: 'correlation',
                    label: `Keep ${columns.length - 1} correlation matrix columns`,
                    columns,
                    mode: 'keep',
                });
                try { window.sessionStorage.setItem('edatime-highlight-correlation-stage', '1'); } catch { /* optional */ }
                deps.onPlanChanged?.();
                const stageMessage = `Stage added: 'Keep ${columns.length - 1} columns' as Step ${plan.stages.length + 1} in the current Preparation plan.`;
                if (planSummary) planSummary.textContent = stageMessage;
                toast(stageMessage, 'success');
                closePlanDialog();
            }, listenerOptions);

            metric = readHeatmapMetricPref();
            setDropdownValue('heatmap-metric', metric);
            const displayModes = readHeatmapDisplayModes();
            if (diagonalModeSelect) setDropdownValue('heatmap-diagonal-mode', displayModes.diagonal);
            if (pairModeSelect) setDropdownValue('heatmap-pair-mode', displayModes.pairs);
            setDropdownDisabled('heatmap-color-column', displayModes.pairs === 'density');
            syncMetricGuide();
            bindInfoPopovers();
            // Release page-level help with the controls that own it.
            controlAbort.signal.addEventListener('abort', initHeatmapHelp(), { once: true });

            // Sync initial control state with module-level defaults.
            if (clusterToggle) clusterToggle.checked = heatmapClusterEnabled;
            if (lockOrderToggle) lockOrderToggle.checked = heatmapOrderLocked;
            if (lockOrderStatus) lockOrderStatus.hidden = !heatmapOrderLocked;
            // Restore the "Fit to screen" pref, defaulting to on so the
            // heatmap uses the page width on first visit.
            heatmapFitToScreen = readHeatmapFitPref();
            if (fitToggle) {
                fitToggle.setAttribute('aria-pressed', String(heatmapFitToScreen));
                fitToggle.classList.toggle('is-active', heatmapFitToScreen);
            }
            if (axisFitToggle) {
                axisFitToggle.setAttribute('aria-pressed', String(heatmapAxisFit));
                axisFitToggle.classList.toggle('is-active', heatmapAxisFit);
            }
            if (sizeValue) sizeValue.textContent = `${heatmapCellSize} px`;
            // Sync the custom `--range-fill` property so the slider
            // track's accent fill matches the current value on first
            // render (CSS uses this to draw a filled progress portion).
            updateRangeFill(sizeInput);

            metricSelect?.addEventListener('change', () => {
                metric = normalizeCorrelationMetric(getDropdownValue('heatmap-metric'));
                writeHeatmapMetricPref(metric);
                syncMetricGuide();
                void loadMatrix(metric);
            }, listenerOptions);
            diagonalModeSelect?.addEventListener('change', () => {
                const nextMode = getDropdownValue('heatmap-diagonal-mode');
                if (nextMode !== 'kde' && nextMode !== 'histogram') return;
                writeHeatmapDiagonalMode(nextMode);
                renderHeatmap();
            }, listenerOptions);
            pairModeSelect?.addEventListener('change', () => {
                const nextMode = getDropdownValue('heatmap-pair-mode');
                if (nextMode !== 'density' && nextMode !== 'scatter') return;
                writeHeatmapPairMode(nextMode);
                setDropdownDisabled('heatmap-color-column', nextMode === 'density');
                renderHeatmap();
            }, listenerOptions);
            sizeInput?.addEventListener('input', () => {
                heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
                if (sizeValue) sizeValue.textContent = `${heatmapCellSize} px`;
                updateRangeFill(sizeInput);
                renderHeatmap();
            }, listenerOptions);
            clusterToggle?.addEventListener('change', () => {
                heatmapClusterEnabled = !!clusterToggle.checked;
                // Toggling clustering clears any manual drag-reorder so
                // the next render reflects the new clustering state from
                // scratch; users can drag again afterwards.
                userColumnOrder = null;
                renderHeatmap();
            }, listenerOptions);
            lockOrderToggle?.addEventListener('change', () => {
                heatmapOrderLocked = !!lockOrderToggle.checked;
                if (heatmapOrderLocked && lastRenderedOrder) userColumnOrder = [...lastRenderedOrder];
                if (!heatmapOrderLocked) userColumnOrder = null;
                if (lockOrderStatus) lockOrderStatus.hidden = !heatmapOrderLocked;
                renderHeatmap();
            }, listenerOptions);
            fitToggle?.addEventListener('click', () => {
                heatmapFitToScreen = !heatmapFitToScreen;
                writeHeatmapFitPref(heatmapFitToScreen);
                fitToggle.setAttribute('aria-pressed', String(heatmapFitToScreen));
                fitToggle.classList.toggle('is-active', heatmapFitToScreen);
                renderHeatmap();
            }, listenerOptions);
            axisFitToggle?.addEventListener('click', () => {
                heatmapAxisFit = !heatmapAxisFit;
                axisFitToggle.setAttribute('aria-pressed', String(heatmapAxisFit));
                axisFitToggle.classList.toggle('is-active', heatmapAxisFit);
                renderHeatmap();
            }, listenerOptions);
            document.addEventListener('edatime:settings-changed', renderHeatmap, listenerOptions);
            document.addEventListener('edatime:scatter-pair-changed', (event) => {
                const detail = (event as CustomEvent<{ x?: string; y?: string }>).detail;
                syncSelectedPair(String(detail?.x || ''), String(detail?.y || ''));
            }, listenerOptions);
            document.addEventListener('change', (event) => {
                const target = event.target as HTMLElement | null;
                if (target?.id !== 'scatter-x-col' && target?.id !== 'scatter-y-col') return;
                syncSelectedPair(
                    getDropdownValue('scatter-x-col'),
                    getDropdownValue('scatter-y-col'),
                );
            }, listenerOptions);
            heatmapResizeObserver?.disconnect();
            if (typeof ResizeObserver !== 'undefined') {
                heatmapResizeObserver = new ResizeObserver(() => {
                    if (heatmapFitToScreen) renderHeatmap();
                });
                heatmapResizeObserver.observe(container);
            }
            const heatmapToolbar = document.querySelector<HTMLElement>('#page-heatmap .toolbar.scatter-toolbar');
            toolbarPopovers?.dispose();
            toolbarPopovers = heatmapToolbar ? initToolbarPopovers(heatmapToolbar) : null;
        },
        onVisible() {
            void loadMatrix(metric);
        },
    });

    const disposeRuntime = heatmapRuntime.mount();
    heatmapPageCleanup = () => {
        heatmapControlAbort?.abort();
        heatmapControlAbort = null;
        heatmapResizeObserver?.disconnect();
        heatmapResizeObserver = null;
        toolbarPopovers?.dispose();
        toolbarPopovers = null;
        disposeRuntime();
        heatmapRuntime = null;
    };
    return disposeHeatmapPage;
}
