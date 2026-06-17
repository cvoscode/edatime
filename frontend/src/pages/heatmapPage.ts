import { fetchCorrelationMatrix } from '../services/api/index.js';
import { exportElementPNG, exportElementSVG, exportElementHTML, exportMatrixCSV } from '../utils/chartExport.js';
import { toast } from '../utils/toast.js';
import { getDropdownValue, setDropdownValue } from '../ui/primitives/Dropdown.js';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';
import { clusterColumns, type Cluster } from '../utils/correlationClustering.js';

interface HeatmapPageDeps {
    showPage: (pageName: string) => void;
}

let heatmapCellSize = 36;
let heatmapClusterEnabled = true;
let heatmapClusterThreshold = 0.85;
let matrixData: { columns: string[]; pearson: (number | null)[][]; spearman: (number | null)[][] } | null = null;
let metric = 'pearson';
let matrixLoadInFlight: Promise<void> | null = null;
let heatmapRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;

function syncHeatmapEmptyState(message: string, visible: boolean, reason = ''): void {
    heatmapRuntime?.updateEmptyState({
        visible,
        reason: visible ? (reason || 'no-data') : '',
        title: '',
        message: '',
        fallbackText: message,
    });
}

function correlationColor(value: number): string {
    const clamped = Math.max(-1, Math.min(1, value));
    if (clamped >= 0) {
        const t = clamped;
        const r = Math.round(247 - t * (247 - 178));
        const g = Math.round(247 - t * (247 - 24));
        const b = Math.round(247 - t * (247 - 43));
        return `rgb(${r},${g},${b})`;
    }
    const t = -clamped;
    const r = Math.round(247 - t * (247 - 33));
    const g = Math.round(247 - t * (247 - 102));
    const b = Math.round(247 - t * (247 - 172));
    return `rgb(${r},${g},${b})`;
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

export async function initHeatmapPage(deps: HeatmapPageDeps): Promise<void> {
    async function loadMatrix(): Promise<void> {
        if (matrixLoadInFlight) return matrixLoadInFlight;
        matrixLoadInFlight = (async () => {
            heatmapRuntime?.updateStatus('Loading correlation matrix…');
            try {
                matrixData = await fetchCorrelationMatrix();
                heatmapRuntime?.updateStatus(buildHeatmapStatus(null));
                if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
                    await (document as any).fonts.ready;
                }
                requestAnimationFrame(() => renderHeatmap());
            } catch (error: any) {
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
        })().finally(() => {
            matrixLoadInFlight = null;
        });

        return matrixLoadInFlight;
    }

    function renderHeatmap(): void {
        const container = document.getElementById('heatmap-container');
        if (!container) return;
        if (!matrixData) {
            syncHeatmapEmptyState('Correlation heatmap will appear here once the dataset is available.', true);
            return;
        }

        const columns = matrixData.columns;
        const data = metric === 'spearman' ? matrixData.spearman : matrixData.pearson;
        const size = columns.length;
        if (size === 0) {
            container.innerHTML = '';
            syncHeatmapEmptyState('No numeric columns are available for the correlation heatmap.', true, 'no-columns-available');
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
            const result = clusterColumns(columns, data, heatmapClusterThreshold);
            renderOrder = result.order;
            clusters = result.clusters;
        }
        renderOrder.forEach((name, renderIdx) => {
            const originalIdx = columns.indexOf(name);
            orderToOriginal.set(renderIdx, originalIdx);
        });

        // Build the grid template, inserting a 2px separator column and row
        // between clusters. The number of separators is (clusters.length - 1)
        // when clustering is active, otherwise 0.
        const sepPx = 2;
        const numSeparators = clusters.length > 1 ? clusters.length - 1 : 0;

        const colTemplateParts: string[] = [`${labelWidth}px`];
        for (let i = 0; i < size; i++) {
            colTemplateParts.push(`${heatmapCellSize}px`);
            const isLastInCluster = clusters.some((c) => c.endIndex - 1 === i);
            if (isLastInCluster && i < size - 1) {
                colTemplateParts.push(`${sepPx}px`);
            }
        }
        const rowTemplateParts: string[] = [`${labelWidth}px`];
        for (let i = 0; i < size; i++) {
            rowTemplateParts.push(`${heatmapCellSize}px`);
            const isLastInCluster = clusters.some((c) => c.endIndex - 1 === i);
            if (isLastInCluster && i < size - 1) {
                rowTemplateParts.push(`${sepPx}px`);
            }
        }
        const colTemplate = colTemplateParts.join(' ');
        const rowTemplate = rowTemplateParts.join(' ');

        // Total columns / rows in the grid (1 label column/row + N data + separators).
        const totalCols = 1 + size + numSeparators;
        const totalRows = 1 + size + numSeparators;

        // Per-render-row, compute the 1-based grid column (1..totalCols) so
        // the cell at render position c lands in the right column, skipping
        // separator columns.
        function colGridFor(renderIdx: number): number {
            // 1-based: column 1 is the row-label column. Then 1 column per
            // data cell, plus 1 for each separator that comes before this
            // render position.
            let sepsBefore = 0;
            for (let i = 0; i < renderIdx; i++) {
                if (clusters.some((c) => c.endIndex - 1 === i)) sepsBefore += 1;
            }
            return 1 + renderIdx + sepsBefore + 1; // +1 for label column
        }
        function rowGridFor(renderIdx: number): number {
            let sepsBefore = 0;
            for (let i = 0; i < renderIdx; i++) {
                if (clusters.some((c) => c.endIndex - 1 === i)) sepsBefore += 1;
            }
            return 1 + renderIdx + sepsBefore + 1; // +1 for label row
        }

        // Build the cell HTML. We use explicit grid-column / grid-row on
        // every cell so the layout is independent of the emit order.
        const cells: string[] = [];
        // Top-left corner (label row + label column).
        cells.push('<div></div>');
        // Column headers in render order.
        for (let c = 0; c < size; c++) {
            const colName = renderOrder[c]!;
            const colOriginal = orderToOriginal.get(c) ?? c;
            const isFirstInCluster = c > 0 && clusters.some((cl) => cl.startIndex === c);
            const sep = isFirstInCluster ? 'border-left:1px solid rgba(255,255,255,0.18);' : '';
            cells.push(
                `<div class="heatmap-header" style="grid-column:${colGridFor(c)};grid-row:1;writing-mode:vertical-rl;text-orientation:mixed;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;color:var(--text-dim);padding:4px 2px;${sep}" title="${escapeAttr(colName)}" data-cluster-col="${colOriginal}">${escapeAttr(colName)}</div>`,
            );
        }

        for (let r = 0; r < size; r++) {
            const rowName = renderOrder[r]!;
            const rowOriginal = orderToOriginal.get(r) ?? r;
            const isFirstInCluster = r > 0 && clusters.some((cl) => cl.startIndex === r);
            const labelBorder = isFirstInCluster ? 'border-top:1px solid rgba(255,255,255,0.18);' : '';
            // Row label sits in column 1 of this row.
            cells.push(
                `<div class="heatmap-row-label" style="grid-column:1;grid-row:${rowGridFor(r)};display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${labelBorder}" title="${escapeAttr(rowName)}" data-cluster-row="${rowOriginal}">${escapeAttr(rowName)}</div>`,
            );
            for (let c = 0; c < size; c++) {
                const colName = renderOrder[c]!;
                const colOriginal = orderToOriginal.get(c) ?? c;
                const value = data[rowOriginal]?.[colOriginal] ?? null;
                const displayValue = value !== null ? value.toFixed(2) : '—';
                const background = value !== null ? correlationColor(value) : 'transparent';
                const textColor = value !== null && Math.abs(value) > 0.5 ? '#fff' : 'var(--text)';
                const tooltip = `${rowName} × ${colName}: ${displayValue}${rowOriginal !== colOriginal ? ' — click to explore in Scatter' : ''}`;
                cells.push(
                    `<div class="heatmap-cell" data-row="${rowOriginal}" data-col="${colOriginal}" style="grid-column:${colGridFor(c)};grid-row:${rowGridFor(r)};display:flex;align-items:center;justify-content:center;background:${background};color:${textColor};border-radius:2px;cursor:${rowOriginal !== colOriginal ? 'pointer' : 'default'};font-variant-numeric:tabular-nums;" title="${escapeAttr(tooltip)}">${displayValue}</div>`,
                );
            }
        }

        // Cluster separator strips: one full-width column after each
        // cluster's last data column, and one full-width row after each
        // cluster's last data row. Both span only the data area (not the
        // label gutter).
        if (numSeparators > 0) {
            // Find the grid column index for each separator (the column
            // that comes right after the cluster's last data column).
            for (let ci = 0; ci < clusters.length - 1; ci++) {
                const cluster = clusters[ci]!;
                const sepCol = colGridFor(cluster.endIndex - 1) + 1;
                // Vertical separator strip: column sepCol, rows 1..totalRows
                cells.push(
                    `<div class="heatmap-cluster-separator" style="grid-column:${sepCol};grid-row:1 / span ${totalRows};width:${sepPx}px;" aria-hidden="true"></div>`,
                );
                const sepRow = rowGridFor(cluster.endIndex - 1) + 1;
                // Horizontal separator strip: row sepRow, columns 1..totalCols
                cells.push(
                    `<div class="heatmap-cluster-separator" style="grid-row:${sepRow};grid-column:1 / span ${totalCols};height:${sepPx}px;" aria-hidden="true"></div>`,
                );
            }
        }

        let html = '<div style="display:flex;align-items:flex-end;gap:0;">';
        html += `<div class="heatmap-grid" style="display:inline-grid;grid-template-columns:${colTemplate};grid-template-rows:${rowTemplate};gap:1px;font-size:0.65rem;">`;
        html += cells.join('');
        html += '</div>';
        html += '<div style="display:flex;align-items:flex-end;gap:10px;margin-left:10px;">';
        html += '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;font-size:0.7rem;color:var(--text-dim);">';
        html += '<span>-1.0</span>';
        html += '<div style="width:12px;flex:0 0 120px;border-radius:4px;background:linear-gradient(180deg,#B2182B,#EF8A62,#F7F7F7,#67A9CF,#2166AC);"></div>';
        html += '<span>+1.0</span>';
        html += '</div>';
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
        heatmapRuntime?.updateStatus(buildHeatmapStatus(clusterCount));
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
                    const data = metric === 'spearman' ? matrixData!.spearman : matrixData!.pearson;
                    exportMatrixCSV(matrixData!.columns, data, filename);
                },
                filename: `edatime_correlation_${metric}.csv`,
                dataCheck: () => matrixData != null,
            },
        },
        init() {
            const container = document.getElementById('heatmap-container');
            const metricSelect = document.getElementById('heatmap-metric') as HTMLElement | null;
            const sizeInput = document.getElementById('heatmap-cell-size') as HTMLInputElement | null;
            const sizeValue = document.getElementById('heatmap-cell-size-value') as HTMLElement | null;
            const clusterToggle = document.getElementById('heatmap-cluster-toggle') as HTMLInputElement | null;
            const clusterThreshold = document.getElementById('heatmap-cluster-threshold') as HTMLInputElement | null;
            const clusterThresholdValue = document.getElementById('heatmap-cluster-threshold-value') as HTMLElement | null;
            if (!container) return;

            // Sync initial control state with module-level defaults.
            if (clusterToggle) clusterToggle.checked = heatmapClusterEnabled;
            if (clusterThreshold) clusterThreshold.value = String(heatmapClusterThreshold);
            if (clusterThresholdValue) clusterThresholdValue.textContent = heatmapClusterThreshold.toFixed(2);

            metricSelect?.addEventListener('change', () => {
                metric = getDropdownValue('heatmap-metric') || 'pearson';
                renderHeatmap();
            });
            sizeInput?.addEventListener('input', () => {
                heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
                if (sizeValue) sizeValue.textContent = String(heatmapCellSize);
                renderHeatmap();
            });
            clusterToggle?.addEventListener('change', () => {
                heatmapClusterEnabled = !!clusterToggle.checked;
                renderHeatmap();
            });
            clusterThreshold?.addEventListener('input', () => {
                const raw = Number(clusterThreshold.value);
                heatmapClusterThreshold = Number.isFinite(raw)
                    ? Math.max(0, Math.min(1, raw))
                    : 0.85;
                if (clusterThresholdValue) {
                    clusterThresholdValue.textContent = heatmapClusterThreshold.toFixed(2);
                }
                renderHeatmap();
            });
        },
        onVisible() {
            void loadMatrix();
        },
    });

    heatmapRuntime.mount();
}
