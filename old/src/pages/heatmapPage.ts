import { fetchCorrelationMatrix } from '../dataClient.js';
import { createEmptyStateController } from '../ui/emptyState.js';
import { exportElementPNG, exportElementSVG, exportElementHTML, exportMatrixCSV } from '../utils/chartExport.js';
import { toast } from '../utils/toast.js';

interface HeatmapPageDeps {
    showPage: (pageName: string) => void;
}

let loaded = false;
let heatmapCellSize = 36;
let heatmapEmptyStateController: ReturnType<typeof createEmptyStateController> | null = null;

function getHeatmapEmptyStateController() {
    if (!heatmapEmptyStateController) {
        heatmapEmptyStateController = createEmptyStateController({ rootId: 'heatmap-empty-state' });
    }
    return heatmapEmptyStateController;
}

function syncHeatmapEmptyState(message: string, visible: boolean, reason = ''): void {
    getHeatmapEmptyStateController().update({
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
    if (loaded) return;
    loaded = true;

    const container = document.getElementById('heatmap-container');
    const statusEl = document.getElementById('heatmap-status') as HTMLElement | null;
    const metricSelect = document.getElementById('heatmap-metric') as HTMLSelectElement | null;
    const sizeInput = document.getElementById('heatmap-cell-size') as HTMLInputElement | null;
    const sizeValue = document.getElementById('heatmap-cell-size-value') as HTMLElement | null;
    if (!container) return;
    const containerEl = container;

    let matrixData: { columns: string[]; pearson: (number | null)[][]; spearman: (number | null)[][] } | null = null;
    let metric = 'pearson';
    let matrixLoadInFlight: Promise<void> | null = null;

    function renderHeatmap(): void {
        if (!matrixData) {
            syncHeatmapEmptyState('Correlation heatmap will appear here once the dataset is available.', true);
            return;
        }

        const columns = matrixData.columns;
        const data = metric === 'spearman' ? matrixData.spearman : matrixData.pearson;
        const size = columns.length;
        if (size === 0) {
            containerEl.innerHTML = '';
            syncHeatmapEmptyState('No numeric columns are available for the correlation heatmap.', true, 'no-columns-available');
            return;
        }

        syncHeatmapEmptyState('', false);
        const labelWidth = Math.max(84, Math.min(180, Math.round(heatmapCellSize * 2.5)));

        let html = `<div class="heatmap-grid" style="display:inline-grid;grid-template-columns:${labelWidth}px repeat(${size},${heatmapCellSize}px);grid-template-rows:${labelWidth}px repeat(${size},${heatmapCellSize}px);gap:1px;font-size:0.65rem;">`;
        html += '<div></div>';
        for (const column of columns) {
            html += `<div class="heatmap-header" style="writing-mode:vertical-rl;text-orientation:mixed;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;color:var(--text-dim);padding:4px 2px;" title="${column}">${column}</div>`;
        }

        for (let row = 0; row < size; row++) {
            html += `<div class="heatmap-row-label" style="display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${columns[row]}">${columns[row]}</div>`;
            for (let column = 0; column < size; column++) {
                const value = data[row]?.[column] ?? null;
                const displayValue = value !== null ? value.toFixed(2) : '—';
                const background = value !== null ? correlationColor(value) : 'transparent';
                const textColor = value !== null && Math.abs(value) > 0.5 ? '#fff' : 'var(--text)';
                html += `<div class="heatmap-cell" data-row="${row}" data-col="${column}" style="display:flex;align-items:center;justify-content:center;background:${background};color:${textColor};border-radius:2px;cursor:${row !== column ? 'pointer' : 'default'};font-variant-numeric:tabular-nums;" title="${columns[row]} × ${columns[column]}: ${displayValue}${row !== column ? ' — click to explore in Scatter' : ''}">${displayValue}</div>`;
            }
        }

        html += '</div>';
        html += '<div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.7rem;color:var(--text-dim);">';
        html += '<span>-1.0</span>';
        html += '<div style="flex:0 0 200px;height:12px;border-radius:4px;background:linear-gradient(90deg,#2166AC,#67A9CF,#F7F7F7,#EF8A62,#B2182B);"></div>';
        html += '<span>+1.0</span>';
        html += '</div>';

        containerEl.innerHTML = html;
        containerEl.onclick = (event: MouseEvent) => {
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

    async function loadMatrix(): Promise<void> {
        if (matrixLoadInFlight) return matrixLoadInFlight;
        matrixLoadInFlight = (async () => {
            if (statusEl) statusEl.textContent = 'Loading correlation matrix…';
            try {
                matrixData = await fetchCorrelationMatrix();
                if (statusEl) statusEl.textContent = `${matrixData.columns.length} columns · ${heatmapCellSize}px cells`;
                renderHeatmap();
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
                if (statusEl) statusEl.textContent = isInsufficient ? 'Not enough numeric columns' : `Error: ${message || 'failed'}`;
            }
        })().finally(() => {
            matrixLoadInFlight = null;
        });

        return matrixLoadInFlight;
    }

    metricSelect?.addEventListener('change', () => {
        metric = metricSelect.value;
        renderHeatmap();
    });
    sizeInput?.addEventListener('input', () => {
        heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
        if (sizeValue) sizeValue.textContent = String(heatmapCellSize);
        if (statusEl && matrixData) statusEl.textContent = `${matrixData.columns.length} columns · ${heatmapCellSize}px cells`;
        renderHeatmap();
    });

    document.getElementById('heatmap-export-csv-btn')?.addEventListener('click', () => {
        if (!matrixData) {
            toast('No heatmap data to export.', 'warning');
            return;
        }
        const data = metric === 'spearman' ? matrixData.spearman : matrixData.pearson;
        exportMatrixCSV(matrixData.columns, data, `edatime_correlation_${metric}.csv`);
    });
    document.getElementById('heatmap-export-png-btn')?.addEventListener('click', () => {
        exportElementPNG('heatmap-container', 'edatime_heatmap.png');
    });
    document.getElementById('heatmap-export-svg-btn')?.addEventListener('click', () => {
        exportElementSVG('heatmap-container', 'edatime_heatmap.svg');
    });
    document.getElementById('heatmap-export-html-btn')?.addEventListener('click', () => {
        void exportElementHTML('heatmap-container', 'edatime_heatmap.html');
    });

    window.addEventListener('edatime:page-change', (event: Event) => {
        const detail = (event as CustomEvent<{ page?: string }>).detail;
        if (detail?.page === 'heatmap') void loadMatrix();
    });

    const heatmapPage = document.getElementById('page-heatmap') as HTMLElement | null;
    if (heatmapPage && !heatmapPage.hidden) {
        await loadMatrix();
    }
}