import { fetchCorrelationMatrix } from '../../services/api/index.js';
import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { exportElementPNG, exportElementSVG, exportElementHTML, exportMatrixCSV } from '../../utils/chartExport.js';
import { getDropdownValue, setDropdownValue } from '../../ui/primitives/Dropdown.js';
import { bindInfoPopovers } from '../../ui/infoPopovers.js';
import { initHeatmapHelp } from './help.js';
import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import { clusterColumns, type Cluster } from '../../utils/correlationClustering.js';
import { initToolbarOverflow } from '../../features/scatter/toolbarOverflow.js';
import {
    getCorrelationModeGuide,
    getCorrelationModeLabel,
    normalizeCorrelationMetric,
    type CorrelationMetric,
} from '../../utils/correlationModes.js';
import { getSetting, updateSetting } from '../../utils/settings.js';

interface HeatmapPageDeps {
    showPage: (pageName: string) => void;
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
const HEATMAP_FIT_STORAGE_KEY = 'edatime_heatmap_fit_to_screen';
// Hardcoded clustering cutoff. Exposed as a constant (rather than a slider)
// because the threshold is rarely useful to tune interactively and the
// default 0.85 works well across the datasets we have seen.
const HEATMAP_CLUSTER_THRESHOLD = 0.85;
let matrixData: CorrelationMatrixResponse | null = null;
let metric: CorrelationMetric = 'pearson_raw';
let matrixLoadSequence = 0;
let heatmapRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let heatmapResizeObserver: ResizeObserver | null = null;
/** User's manual column/row order from drag-reorder. Persists across
 *  metric switches so users don't lose their custom sequence. Reset
 *  whenever clustering is toggled or a new dataset loads. */
let userColumnOrder: string[] | null = null;

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

function correlationColor(value: number, maxAbs = 1): string {
    const domain = Math.max(1e-6, maxAbs);
    const clamped = Math.max(-1, Math.min(1, value / domain));
    if (clamped >= 0) {
        const t = clamped;
        const r = Math.round(245 - t * (245 - 190));
        const g = Math.round(245 - t * (245 - 18));
        const b = Math.round(245 - t * (245 - 46));
        return `rgb(${r},${g},${b})`;
    }
    const t = -clamped;
    const r = Math.round(245 - t * (245 - 35));
    const g = Math.round(245 - t * (245 - 112));
    const b = Math.round(245 - t * (245 - 180));
    return `rgb(${r},${g},${b})`;
}

function getColorDomainMax(data: (number | null)[][]): number {
    if (!heatmapAxisFit) return 1;
    let maxAbs = 0;
    for (let row = 0; row < data.length; row++) {
        for (let col = 0; col < data[row]!.length; col++) {
            if (row === col) continue;
            const value = data[row]![col];
            if (value == null || !Number.isFinite(value)) continue;
            maxAbs = Math.max(maxAbs, Math.abs(value));
        }
    }
    return maxAbs > 0 ? maxAbs : 1;
}

function formatScaleTick(value: number): string {
    return Math.abs(value) >= 1 ? value.toFixed(1) : value.toFixed(2);
}

function correlationToneClass(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'heatmap-cell--missing';
    if (value > 0.08) return 'heatmap-cell--positive';
    if (value < -0.08) return 'heatmap-cell--negative';
    return 'heatmap-cell--neutral';
}

function correlationTextColor(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'var(--text-dim)';
    return Math.abs(value) >= 0.5 ? '#fff' : '#b8cef8';
}

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildHeatmapStatus(clusterCount: number | null): string {
    if (!matrixData) return '';
    const cols = matrixData.columns.length;
    return clusterCount !== null
        ? `${clusterCount} clusters · ${cols} columns · ${heatmapCellSize}px cells`
        : `${cols} columns · ${heatmapCellSize}px cells`;
}

function getUnsupportedMetricMessage(nextMetric: CorrelationMetric): string {
    return `${getCorrelationModeLabel(nextMetric)} requires the updated server payload. Restart the server to use Kendall tau and first-difference correlation modes.`;
}

function getSelectedMatrix(
    data: CorrelationMatrixResponse,
    nextMetric: CorrelationMetric,
): (number | null)[][] | null {
    const selected = data[nextMetric];
    if (selected) return selected;
    if (nextMetric === 'pearson_raw') return data.pearson ?? null;
    if (nextMetric === 'spearman_raw') return data.spearman ?? null;
    return null;
}

function syncMetricGuide(): void {
    const infoIcon = document.getElementById('heatmap-metric-info');
    if (!infoIcon) return;
    infoIcon.setAttribute('data-info-tip', getCorrelationModeGuide(metric));
}

export async function initHeatmapPage(deps: HeatmapPageDeps): Promise<void> {
    async function loadMatrix(nextMetric: CorrelationMetric = metric): Promise<void> {
        const loadSequence = ++matrixLoadSequence;
        const container = document.getElementById('heatmap-container');
        if (container) container.innerHTML = '';
        const label = `Loading ${getCorrelationModeLabel(nextMetric)}…`;
        setHeatmapLoading(true, label);
        heatmapRuntime?.updateStatus(label);
        try {
            const response = await fetchCorrelationMatrix(nextMetric);
            if (loadSequence !== matrixLoadSequence) return;
            // The previous dataset's manual order doesn't apply to the
            // next one — clear it so the next render either clusters or
            // shows the new columns in source order.
            userColumnOrder = null;
            matrixData = response;
            if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
                await (document as any).fonts.ready;
            }
            requestAnimationFrame(() => renderHeatmap());
        } catch (error: any) {
            if (loadSequence !== matrixLoadSequence) return;
            const message = error?.message || '';
            const isInsufficient = message.toLowerCase().includes('two')
                || message.toLowerCase().includes('numeric')
                || message.toLowerCase().includes('column');
            syncHeatmapEmptyState(
                isInsufficient
                    ? 'Need at least two numeric columns to compute correlations. Upload a dataset with multiple numeric columns.'
                    : 'Correlation heatmap is unavailable for the current dataset.',
                true,
                isInsufficient ? 'no-columns-available' : 'render-failure',
                isInsufficient
                    ? 'Need at least two numeric columns'
                    : 'Correlation matrix unavailable',
            );
            heatmapRuntime?.updateStatus(isInsufficient ? 'Not enough numeric columns' : `Error: ${message || 'failed'}`);
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

        const columns = matrixData.columns;
        const data = getSelectedMatrix(matrixData, metric);
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
                getUnsupportedMetricMessage(metric),
                true,
                'legacy-correlation-payload',
                'Unsupported metric',
            );
            heatmapRuntime?.updateStatus(`${getCorrelationModeLabel(metric)} unavailable on this server`);
            return;
        }

        syncHeatmapEmptyState('', false);
        const colorDomainMax = getColorDomainMax(data);
        // Make the matrix fill the available shell width: derive a cell
        // size from the container's client width and the user's cell-size
        // preference, instead of locking the grid to size * heatmapCellSize.
        // The previous layout forced every correlation matrix into a fixed
        // pixel width regardless of how many columns it had, which made
        // wide schemas look squished.
        const labelWidth = Math.max(84, Math.min(180, Math.round(heatmapCellSize * 2.5)));
        const minCell = 24;
        const maxCell = Math.max(minCell, heatmapCellSize);
        const shellWidth = Math.max(
            container.clientWidth || 0,
            container.getBoundingClientRect().width || 0,
            480,
        );
        const scaleBarWidth = 56; // color scale gutter reserved on the right
        const usableWidth = Math.max(labelWidth + minCell * size + 8, shellWidth - scaleBarWidth);
        const fitCell = Math.floor((usableWidth - labelWidth - 2 * (size - 1)) / Math.max(1, size));
        // When "Fit to screen" is on, bypass the slider-driven `maxCell` cap
        // and use the cell size the container can actually accommodate. The
        // off state keeps the previous "respect the slider" behaviour so
        // power users can still grow cells beyond the panel width if they
        // want to force horizontal scrolling.
        const responsiveCell = heatmapFitToScreen
            ? Math.max(minCell, fitCell)
            : Math.max(minCell, Math.min(maxCell, fitCell));
        // Match the row label to the actual cell size instead of the
        // slider value: at narrow viewports `headerCellSize` was driving a
        // 72-px row height regardless of what the cells rendered at, which
        // made the matrix 7 * 72 = 504 px tall on a 420-px screen. Aligning
        // row and cell heights keeps the matrix compact and lets the
        // viewport chrome (toolbar + status footer) fit inside the first
        // fold on phones.
        const headerCellSize = responsiveCell;
        const useVerticalHeaders = headerCellSize < 40;

        // Optionally reorder columns by cluster. The data arrays stay
        // indexed by the ORIGINAL column order; we map render position
        // -> original index when emitting cell data attributes.
        const orderToOriginal = new Map<number, number>();
        let clusters: Cluster[] = [];
        let renderOrder: string[] = columns;
        // Honor the user's manual drag-reorder if it still covers the
        // current column set (datasets rarely change, but a partial
        // upload can drop a column).
        const savedOrder = userColumnOrder;
        const userOrderStillValid = savedOrder !== null
            && savedOrder.length === columns.length
            && savedOrder.every((name) => columns.includes(name));
        if (userOrderStillValid && savedOrder) {
            renderOrder = savedOrder.slice();
        } else if (heatmapClusterEnabled && size > 1) {
            const result = clusterColumns(columns, data, HEATMAP_CLUSTER_THRESHOLD);
            renderOrder = result.order;
            clusters = result.clusters;
        }
        renderOrder.forEach((name, renderIdx) => {
            const originalIdx = columns.indexOf(name);
            orderToOriginal.set(renderIdx, originalIdx);
        });

        // Build a uniform N x N grid: 1 label column/row + size data cells.
        // The grid is identical between grouped and ungrouped views so the
        // layout stays predictable; cluster boundaries are conveyed through
        // the heatmap-header--cluster-start / heatmap-row-label--cluster-start
        // classes (a stronger text color on the first header/label of each
        // cluster) rather than physical separator rows/columns.
        const colTemplate = [`${labelWidth}px`, ...Array.from({ length: size }, () => `${responsiveCell}px`)].join(' ');
        const rowTemplate = colTemplate;
        // 1-based grid column/row for a render position. Column/row 1 is
        // the label gutter; renderIdx 0 sits at column 2.
        const colGridFor = (renderIdx: number): number => 2 + renderIdx;
        const rowGridFor = (renderIdx: number): number => 2 + renderIdx;

        // Build the cell HTML. We use explicit grid-column / grid-row on
        // every cell so the layout is independent of the emit order.
        const cells: string[] = [];
        // Top-left corner: axis hint + active metric badge. The previous
        // version emitted an empty 1x1 cell, which left users guessing
        // which axis was which. The corner now carries (a) a small
        // "Y \ X" axis glyph and (b) the active metric so the screen
        // reader (and the user) can confirm what the matrix is showing.
        const metricLabel = getCorrelationModeLabel(metric);
        cells.push(
            `<div class="heatmap-corner" style="grid-column:1;grid-row:1;" aria-label="Rows are shown vertically, columns horizontally. Active metric: ${escapeAttr(metricLabel)}.">`
            + `<span class="heatmap-corner__axis heatmap-corner__axis--y" aria-hidden="true">Y</span>`
            + `<span class="heatmap-corner__sep" aria-hidden="true">/</span>`
            + `<span class="heatmap-corner__axis heatmap-corner__axis--x" aria-hidden="true">X</span>`
            + `<span class="heatmap-corner__metric" aria-hidden="true">${escapeAttr(metricLabel)}</span>`
            + `</div>`,
        );
        // Column headers in render order.
        for (let c = 0; c < size; c++) {
            const colName = renderOrder[c]!;
            const colOriginal = orderToOriginal.get(c) ?? c;
            const isFirstInCluster = c > 0 && clusters.some((cl) => cl.startIndex === c);
            const headerClass = [
                'heatmap-header',
                isFirstInCluster ? 'heatmap-header--cluster-start' : '',
                useVerticalHeaders ? 'heatmap-header--vertical' : '',
            ].filter(Boolean).join(' ');
            // Cluster separators get a left border so users can see
            // where one cluster ends and the next begins, instead of
            // relying on the slight text-color shift which was barely
            // visible in dark mode.
            const clusterStyle = isFirstInCluster ? 'border-left: 2px solid #88aef2; padding-left: 4px;' : '';
            cells.push(
                `<div class="${headerClass}" draggable="true" data-drag-axis="col" data-drag-name="${escapeAttr(colName)}" data-drag-original="${colOriginal}" style="grid-column:${colGridFor(c)};grid-row:1;${clusterStyle}--heatmap-header-cell:${headerCellSize}px;" title="${escapeAttr(colName)}" data-cluster-col="${colOriginal}">${escapeAttr(colName)}</div>`,
            );
        }

        for (let r = 0; r < size; r++) {
            const rowName = renderOrder[r]!;
            const rowOriginal = orderToOriginal.get(r) ?? r;
            const isFirstInCluster = r > 0 && clusters.some((cl) => cl.startIndex === r);
            const labelClass = isFirstInCluster ? ' heatmap-row-label--cluster-start' : '';
            // Cluster separator for the row at the same position.
            const clusterStyle = isFirstInCluster ? 'border-top: 2px solid #88aef2;' : '';
            // Row label sits in column 1 of this row.
            cells.push(
                `<div class="heatmap-row-label${labelClass}" draggable="true" data-drag-axis="row" data-drag-name="${escapeAttr(rowName)}" data-drag-original="${rowOriginal}" style="grid-column:1;grid-row:${rowGridFor(r)};${clusterStyle}min-height:${headerCellSize}px;height:${headerCellSize}px;" title="${escapeAttr(rowName)}" data-cluster-row="${rowOriginal}">${escapeAttr(rowName)}</div>`,
            );
            for (let c = 0; c < size; c++) {
                const colName = renderOrder[c]!;
                const colOriginal = orderToOriginal.get(c) ?? c;
                const value = data[rowOriginal]?.[colOriginal] ?? null;
                const toneClass = correlationToneClass(value);
                // Sign prefix makes magnitude + direction readable
                // without relying on color alone. Screen-reader users
                // get the same prefix via the aria-label below.
                let signedValue: string;
                if (value === null || !Number.isFinite(value)) {
                    signedValue = '—';
                } else {
                    const sign = value > 0 ? '+' : (value < 0 ? '−' : '±');
                    signedValue = `${sign}${Math.abs(value).toFixed(2)}`;
                }
                const background = value !== null ? correlationColor(value, colorDomainMax) : 'transparent';
                const textColor = correlationTextColor(value);
                const tooltip = `${rowName} × ${colName}: ${signedValue}${rowOriginal !== colOriginal ? ' — click to explore in Scatter' : ''}`;
                cells.push(
                    `<div class="heatmap-cell ${toneClass}" data-row="${rowOriginal}" data-col="${colOriginal}" data-row-name="${escapeAttr(rowName)}" data-col-name="${escapeAttr(colName)}" style="grid-column:${colGridFor(c)};grid-row:${rowGridFor(r)};background:${background};color:${textColor};cursor:${rowOriginal !== colOriginal ? 'pointer' : 'default'};" aria-label="${escapeAttr(tooltip)}" title="${escapeAttr(tooltip)}" tabindex="${rowOriginal !== colOriginal ? '0' : '-1'}">${signedValue}</div>`,
                );
            }
        }

        let html = '<div class="heatmap-shell">';
        // Cluster legend strip: a horizontal row of chips showing how the
        // clustering split the columns into groups. Helps users understand
        // why HUFL/HULL sit next to each other even when they didn't ask
        // for it. Width ≥1280 keeps the strip beside the matrix; it stays
        // above the matrix on narrower viewports via CSS.
        if (clusters.length > 0) {
            html += '<div class="heatmap-cluster-legend" aria-label="Detected correlation clusters">';
            clusters.forEach((cl, idx) => {
                const memberNames = cl.members.map((m) => escapeAttr(m)).join(', ');
                html += `<span class="heatmap-cluster-legend__chip" title="Cluster ${idx + 1}: ${memberNames}">`
                    + `<span class="heatmap-cluster-legend__dot" aria-hidden="true"></span>`
                    + `Cluster ${idx + 1} · ${cl.members.length}`
                    + `</span>`;
            });
            html += '</div>';
        }
        html += `<div class="heatmap-grid" style="display:grid;width:100%;grid-template-columns:${colTemplate};grid-template-rows:${rowTemplate};">`;
        html += cells.join('');
        html += '</div>';
        html += '<div class="heatmap-scale" aria-label="Correlation color scale">';
        html += `<span class="heatmap-scale__tick heatmap-scale__tick--positive">+${formatScaleTick(colorDomainMax)}</span>`;
        html += '<div class="heatmap-scale__bar" aria-hidden="true"></div>';
        html += `<span class="heatmap-scale__tick heatmap-scale__tick--negative">-${formatScaleTick(colorDomainMax)}</span>`;
        html += '</div>';
        // Status footer below the matrix and the color scale. Tells
        // users what they're looking at and how to interact with it,
        // without scrolling back up to the toolbar.
        const clusterCount = heatmapClusterEnabled && clusters.length > 0 ? clusters.length : null;
        const clusterSummary = clusterCount !== null ? `${clusterCount} clusters · ` : '';
        html += `<div class="heatmap-footer" aria-label="Active correlation matrix summary">`
            + `<span class="heatmap-footer__metric">${escapeAttr(metricLabel)}</span>`
            + `<span class="heatmap-footer__sep" aria-hidden="true">·</span>`
            + `<span class="heatmap-footer__size">${clusterSummary}${size}×${size} matrix</span>`
            + `<span class="heatmap-footer__sep" aria-hidden="true">·</span>`
            + `<span class="heatmap-footer__hint">Click any cell to open that pair in Scatter</span>`
            + `</div>`;
        html += '</div>';

        container.innerHTML = html;
        // Bind cell click: navigate to the scatter page with the chosen
        // X/Y columns preselected. Already supported by the existing
        // implementation; preserved here.
        container.onclick = (event: MouseEvent) => {
            const cell = (event.target as HTMLElement).closest<HTMLElement>('.heatmap-cell');
            if (!cell) return;
            const rowIndex = Number.parseInt(cell.dataset.row || '', 10);
            const colIndex = Number.parseInt(cell.dataset.col || '', 10);
            if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex) || rowIndex === colIndex) return;
            setDropdownValue('scatter-x-col', columns[rowIndex]!);
            setDropdownValue('scatter-y-col', columns[colIndex]!);
            deps.showPage('scatter');
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
            shell.addEventListener('mouseleave', clearHighlights);
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

        heatmapRuntime?.updateStatus(`${getCorrelationModeLabel(metric)} · ${buildHeatmapStatus(clusterCount)}`);
    }

    heatmapRuntime = createAnalysisPageRuntime({
        page: 'heatmap',
        emptyStateRootId: 'heatmap-empty-state',
        emptyStateTitleId: 'heatmap-empty-state-title',
        emptyStateMessageId: 'heatmap-empty-state-message',
        exportConfig: {
            key: 'heatmap',
            png: { fn: exportElementPNG, filename: 'edatime_heatmap.png' },
            svg: { fn: exportElementSVG, filename: 'edatime_heatmap.svg' },
            html: { fn: (filename) => exportElementHTML('heatmap-container', filename), filename: 'edatime_heatmap.html' },
            csv: {
                fn: (filename) => {
                    const data = matrixData ? getSelectedMatrix(matrixData, metric) : null;
                    if (!matrixData || !data) return;
                    exportMatrixCSV(matrixData!.columns, data, filename);
                },
                filename: `edatime_correlation_${metric}.csv`,
                dataCheck: () => matrixData != null && getSelectedMatrix(matrixData, metric) != null,
            },
        },
        init() {
            const container = document.getElementById('heatmap-container');
            const metricSelect = document.getElementById('heatmap-metric') as HTMLElement | null;
            const sizeInput = document.getElementById('heatmap-cell-size') as HTMLInputElement | null;
            const sizeValue = document.getElementById('heatmap-cell-size-value') as HTMLElement | null;
            const clusterToggle = document.getElementById('heatmap-cluster-toggle') as HTMLInputElement | null;
            const fitToggle = document.getElementById('heatmap-fit-toggle') as HTMLButtonElement | null;
            const axisFitToggle = document.getElementById('heatmap-axis-fit-toggle') as HTMLButtonElement | null;
            if (!container) return;

            metric = normalizeCorrelationMetric(getSetting('defaultCorrelationMetric'));
            setDropdownValue('heatmap-metric', metric);
            syncMetricGuide();
            bindInfoPopovers();
            // Page-level "?" help button. The helper is idempotent so
            // calling it on every init is safe.
            initHeatmapHelp();

            // Sync initial control state with module-level defaults.
            if (clusterToggle) clusterToggle.checked = heatmapClusterEnabled;
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
            // Sync the custom `--range-fill` property so the slider
            // track's accent fill matches the current value on first
            // render (CSS uses this to draw a filled progress portion).
            updateRangeFill(sizeInput);

            metricSelect?.addEventListener('change', () => {
                metric = normalizeCorrelationMetric(getDropdownValue('heatmap-metric'));
                updateSetting('defaultCorrelationMetric', metric);
                syncMetricGuide();
                void loadMatrix(metric);
            });
            sizeInput?.addEventListener('input', () => {
                heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
                if (sizeValue) sizeValue.textContent = String(heatmapCellSize);
                updateRangeFill(sizeInput);
                renderHeatmap();
            });
            clusterToggle?.addEventListener('change', () => {
                heatmapClusterEnabled = !!clusterToggle.checked;
                // Toggling clustering clears any manual drag-reorder so
                // the next render reflects the new clustering state from
                // scratch; users can drag again afterwards.
                userColumnOrder = null;
                renderHeatmap();
            });
            fitToggle?.addEventListener('click', () => {
                heatmapFitToScreen = !heatmapFitToScreen;
                writeHeatmapFitPref(heatmapFitToScreen);
                fitToggle.setAttribute('aria-pressed', String(heatmapFitToScreen));
                fitToggle.classList.toggle('is-active', heatmapFitToScreen);
                renderHeatmap();
            });
            axisFitToggle?.addEventListener('click', () => {
                heatmapAxisFit = !heatmapAxisFit;
                axisFitToggle.setAttribute('aria-pressed', String(heatmapAxisFit));
                axisFitToggle.classList.toggle('is-active', heatmapAxisFit);
                renderHeatmap();
            });
            heatmapResizeObserver?.disconnect();
            if (typeof ResizeObserver !== 'undefined') {
                heatmapResizeObserver = new ResizeObserver(() => {
                    if (heatmapFitToScreen) renderHeatmap();
                });
                heatmapResizeObserver.observe(container);
            }
            // C7 — wire the heatmap toolbar into the shared overflow
            // plumbing. The `Display` segment carries the only overflow
            // candidate (`Fit color axis`), so the `… 1 hidden option`
            // pill appears between 1024–1280px on this page.
            const heatmapToolbar = document.querySelector<HTMLElement>('#page-heatmap .toolbar.scatter-toolbar');
            if (heatmapToolbar) initToolbarOverflow(heatmapToolbar);
        },
        onVisible() {
            void loadMatrix(metric);
        },
    });

    heatmapRuntime.mount();
}
