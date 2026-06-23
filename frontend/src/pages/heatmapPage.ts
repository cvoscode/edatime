import { fetchCorrelationMatrix } from '../services/api/index.js';
import type { CorrelationMatrixResponse } from '../services/api/analytics.js';
import { exportElementPNG, exportElementSVG, exportElementHTML, exportMatrixCSV } from '../utils/chartExport.js';
import { getDropdownValue, setDropdownValue } from '../ui/primitives/Dropdown.js';
import { bindInfoPopovers } from '../ui/infoPopovers.js';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';
import { clusterColumns, type Cluster } from '../utils/correlationClustering.js';
import {
    getCorrelationModeGuide,
    getCorrelationModeLabel,
    normalizeCorrelationMetric,
    type CorrelationMetric,
} from '../utils/correlationModes.js';
import { getSetting, updateSetting } from '../utils/settings.js';

interface HeatmapPageDeps {
    showPage: (pageName: string) => void;
}

let heatmapCellSize = 36;
let heatmapClusterEnabled = true;
// Hardcoded clustering cutoff. Exposed as a constant (rather than a slider)
// because the threshold is rarely useful to tune interactively and the
// default 0.85 works well across the datasets we have seen.
const HEATMAP_CLUSTER_THRESHOLD = 0.85;
let matrixData: CorrelationMatrixResponse | null = null;
let metric: CorrelationMetric = 'pearson_raw';
let matrixLoadSequence = 0;
let heatmapRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;

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

function syncHeatmapEmptyState(message: string, visible: boolean, reason = ''): void {
    heatmapRuntime?.updateEmptyState({
        visible,
        reason: visible ? (reason || 'no-data') : '',
        title: '',
        message: '',
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

function correlationColor(value: number): string {
    const clamped = Math.max(-1, Math.min(1, value));
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
            );
            heatmapRuntime?.updateStatus(isInsufficient ? 'Not enough numeric columns' : `Error: ${message || 'failed'}`);
        }
    }

    function renderHeatmap(): void {
        const container = document.getElementById('heatmap-container');
        if (!container) return;
        if (!matrixData) {
            syncHeatmapEmptyState('Correlation heatmap will appear here once the dataset is available.', true);
            return;
        }

        const columns = matrixData.columns;
        const data = getSelectedMatrix(matrixData, metric);
        const size = columns.length;
        if (size === 0) {
            container.innerHTML = '';
            syncHeatmapEmptyState('No numeric columns are available for the correlation heatmap.', true, 'no-columns-available');
            return;
        }
        if (!data) {
            container.innerHTML = '';
            syncHeatmapEmptyState(getUnsupportedMetricMessage(metric), true, 'legacy-correlation-payload');
            heatmapRuntime?.updateStatus(`${getCorrelationModeLabel(metric)} unavailable on this server`);
            return;
        }

        syncHeatmapEmptyState('', false);
        const labelWidth = Math.max(84, Math.min(180, Math.round(heatmapCellSize * 2.5)));

        // Optionally reorder columns by cluster. The data arrays stay
        // indexed by the ORIGINAL column order; we map render position
        // -> original index when emitting cell data attributes.
        const orderToOriginal = new Map<number, number>();
        let clusters: Cluster[] = [];
        let renderOrder: string[] = columns;
        if (heatmapClusterEnabled && size > 1) {
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
        const colTemplate = [`${labelWidth}px`, ...Array.from({ length: size }, () => `${heatmapCellSize}px`)].join(' ');
        const rowTemplate = colTemplate;
        // 1-based grid column/row for a render position. Column/row 1 is
        // the label gutter; renderIdx 0 sits at column 2.
        const colGridFor = (renderIdx: number): number => 2 + renderIdx;
        const rowGridFor = (renderIdx: number): number => 2 + renderIdx;

        // Build the cell HTML. We use explicit grid-column / grid-row on
        // every cell so the layout is independent of the emit order.
        const cells: string[] = [];
        // Top-left corner (label row + label column).
        cells.push('<div class="heatmap-corner" style="grid-column:1;grid-row:1;"></div>');
        // Column headers in render order.
        for (let c = 0; c < size; c++) {
            const colName = renderOrder[c]!;
            const colOriginal = orderToOriginal.get(c) ?? c;
            const isFirstInCluster = c > 0 && clusters.some((cl) => cl.startIndex === c);
            const sep = isFirstInCluster ? ' heatmap-header--cluster-start' : '';
            cells.push(
                `<div class="heatmap-header heatmap-header--vertical${sep}" style="grid-column:${colGridFor(c)};grid-row:1;" title="${escapeAttr(colName)}" data-cluster-col="${colOriginal}">${escapeAttr(colName)}</div>`,
            );
        }

        for (let r = 0; r < size; r++) {
            const rowName = renderOrder[r]!;
            const rowOriginal = orderToOriginal.get(r) ?? r;
            const isFirstInCluster = r > 0 && clusters.some((cl) => cl.startIndex === r);
            const labelClass = isFirstInCluster ? ' heatmap-row-label--cluster-start' : '';
            // Row label sits in column 1 of this row.
            cells.push(
                `<div class="heatmap-row-label${labelClass}" style="grid-column:1;grid-row:${rowGridFor(r)};" title="${escapeAttr(rowName)}" data-cluster-row="${rowOriginal}">${escapeAttr(rowName)}</div>`,
            );
            for (let c = 0; c < size; c++) {
                const colName = renderOrder[c]!;
                const colOriginal = orderToOriginal.get(c) ?? c;
                const value = data[rowOriginal]?.[colOriginal] ?? null;
                const displayValue = value !== null ? value.toFixed(2) : '—';
                const background = value !== null ? correlationColor(value) : 'transparent';
                const textColor = correlationTextColor(value);
                const toneClass = correlationToneClass(value);
                const tooltip = `${rowName} × ${colName}: ${displayValue}${rowOriginal !== colOriginal ? ' — click to explore in Scatter' : ''}`;
                cells.push(
                    `<div class="heatmap-cell ${toneClass}" data-row="${rowOriginal}" data-col="${colOriginal}" style="grid-column:${colGridFor(c)};grid-row:${rowGridFor(r)};--heatmap-cell-bg:${background};color:${textColor};cursor:${rowOriginal !== colOriginal ? 'pointer' : 'default'};" title="${escapeAttr(tooltip)}">${displayValue}</div>`,
                );
            }
        }

        let html = '<div class="heatmap-shell">';
        html += `<div class="heatmap-grid" style="display:inline-grid;grid-template-columns:${colTemplate};grid-template-rows:${rowTemplate};">`;
        html += cells.join('');
        html += '</div>';
        html += '<div class="heatmap-scale" aria-label="Correlation color scale">';
        html += '<span class="heatmap-scale__tick heatmap-scale__tick--positive">+1.0</span>';
        html += '<div class="heatmap-scale__bar" aria-hidden="true"></div>';
        html += '<span class="heatmap-scale__tick heatmap-scale__tick--negative">-1.0</span>';
        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
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

        const clusterCount = heatmapClusterEnabled && clusters.length > 0 ? clusters.length : null;
        heatmapRuntime?.updateStatus(`${getCorrelationModeLabel(metric)} · ${buildHeatmapStatus(clusterCount)}`);
    }

    heatmapRuntime = createAnalysisPageRuntime({
        page: 'heatmap',
        emptyStateRootId: 'heatmap-empty-state',
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
            if (!container) return;

            metric = normalizeCorrelationMetric(getSetting('defaultCorrelationMetric'));
            setDropdownValue('heatmap-metric', metric);
            syncMetricGuide();
            bindInfoPopovers();

            // Sync initial control state with module-level defaults.
            if (clusterToggle) clusterToggle.checked = heatmapClusterEnabled;
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
                renderHeatmap();
            });
        },
        onVisible() {
            void loadMatrix(metric);
        },
    });

    heatmapRuntime.mount();
}
