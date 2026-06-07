import { fetchCorrelationMatrix } from '../services/api/index.js';
import { exportElementPNG, exportElementSVG, exportElementHTML, exportMatrixCSV } from '../utils/chartExport.js';
import { toast } from '../utils/toast.js';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';

interface HeatmapPageDeps {
    showPage: (pageName: string) => void;
}

let heatmapCellSize = 36;
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

export async function initHeatmapPage(deps: HeatmapPageDeps): Promise<void> {
    async function loadMatrix(): Promise<void> {
        if (matrixLoadInFlight) return matrixLoadInFlight;
        matrixLoadInFlight = (async () => {
            heatmapRuntime?.updateStatus('Loading correlation matrix…');
            try {
                matrixData = await fetchCorrelationMatrix();
                heatmapRuntime?.updateStatus(`${matrixData.columns.length} columns · ${heatmapCellSize}px cells`);
                await document.fonts.ready;
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

        let html = '<div style="display:flex;align-items:flex-end;gap:0;">';
        html += `<div class="heatmap-grid" style="display:inline-grid;grid-template-columns:${labelWidth}px repeat(${size},${heatmapCellSize}px);grid-template-rows:${labelWidth}px repeat(${size},${heatmapCellSize}px);gap:1px;font-size:0.65rem;">`;
        html += '<div></div>';
        for (const column of columns) {
            html += `<div class="heatmap-header" style="writing-mode:vertical-rl;text-orientation:mixed;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;color:var(--text-dim);padding:4px 2px;" title="${column}">${column}</div>`;
        }

        for (let row = 0; row < size; row++) {
            html += `<div class="heatmap-row-label" style="display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${columns[row]}">${columns[row]}</div>`;
            for (let col = 0; col < size; col++) {
                const value = data[row]?.[col] ?? null;
                const displayValue = value !== null ? value.toFixed(2) : '—';
                const background = value !== null ? correlationColor(value) : 'transparent';
                const textColor = value !== null && Math.abs(value) > 0.5 ? '#fff' : 'var(--text)';
                html += `<div class="heatmap-cell" data-row="${row}" data-col="${col}" style="display:flex;align-items:center;justify-content:center;background:${background};color:${textColor};border-radius:2px;cursor:${row !== col ? 'pointer' : 'default'};font-variant-numeric:tabular-nums;" title="${columns[row]} × ${columns[col]}: ${displayValue}${row !== col ? ' — click to explore in Scatter' : ''}">${displayValue}</div>`;
            }
        }

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
            const xSelect = document.getElementById('scatter-x-col') as HTMLSelectElement | null;
            const ySelect = document.getElementById('scatter-y-col') as HTMLSelectElement | null;
            if (xSelect) xSelect.value = columns[rowIndex];
            if (ySelect) ySelect.value = columns[colIndex];
            deps.showPage('scatter');
        };
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
            const metricSelect = document.getElementById('heatmap-metric') as HTMLSelectElement | null;
            const sizeInput = document.getElementById('heatmap-cell-size') as HTMLInputElement | null;
            const sizeValue = document.getElementById('heatmap-cell-size-value') as HTMLElement | null;
            if (!container) return;

            metricSelect?.addEventListener('change', () => {
                metric = metricSelect.value;
                renderHeatmap();
            });
            sizeInput?.addEventListener('input', () => {
                heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
                if (sizeValue) sizeValue.textContent = String(heatmapCellSize);
                if (matrixData) heatmapRuntime?.updateStatus(`${matrixData.columns.length} columns · ${heatmapCellSize}px cells`);
                renderHeatmap();
            });
        },
        onVisible() {
            void loadMatrix();
        },
    });

    heatmapRuntime.mount();
}