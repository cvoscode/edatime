import { beforeEach, describe, expect, it, vi } from 'vitest';

const createChartMock = vi.fn();
const fetchScatterCorrelationsMock = vi.fn();
const fetchScatterPointsMock = vi.fn();
const renderScatterMatrixViewMock = vi.fn();
const emptyStateUpdateMock = vi.fn();

vi.mock('../../libs/chartgpu/dist/index.js', () => ({
    createChart: (...args: unknown[]) => createChartMock(...args),
}));

vi.mock('../utils/platform.js', () => ({
    defaultGpuPowerPreference: () => null,
    requestGpuAdapter: vi.fn(async () => ({ name: 'mock-adapter' })),
}));

vi.mock('../dataClient.js', () => ({
    fetchScatterCorrelations: (...args: unknown[]) => fetchScatterCorrelationsMock(...args),
    fetchScatterPoints: (...args: unknown[]) => fetchScatterPointsMock(...args),
}));

vi.mock('../state.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../state.js')>();
    return {
        ...actual,
        appState: {
            ...actual.appState,
            metadata: null,
            currentStart: 0,
            currentEnd: 1_000,
            columnRanges: {},
            adaptiveLineFilters: [],
        },
        buildAdaptiveLineFiltersForQuery: () => [],
    };
});

vi.mock('../ui/emptyState.js', () => ({
    createEmptyStateController: () => ({ update: emptyStateUpdateMock }),
    isRangeOutsideDataset: () => false,
}));

vi.mock('./rendering.js', () => ({
    buildOption: () => ({}),
    renderCurrentOption: vi.fn(),
    updateColorbarUI: vi.fn(),
    updateBinnedReadout: vi.fn(),
    updateCorrelationStats: vi.fn(),
    updateMarginalPlots: vi.fn(),
    initSelectionZoom: vi.fn(),
    syncModeUI: vi.fn(),
    applyView: vi.fn(),
    resetView: vi.fn(),
    exportScatterPNG: vi.fn(),
    exportScatterSVG: vi.fn(),
    exportScatterHTML: vi.fn(),
    exportScatterData: vi.fn(),
    exportScatterParquet: vi.fn(),
    setCorrelationOverlayText: vi.fn(),
}));

vi.mock('./matrix.js', () => ({
    renderScatterMatrixView: (...args: unknown[]) => renderScatterMatrixViewMock(...args),
    selectMatrixPair: vi.fn(),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <section id="page-scatter" data-page-name="scatter">
            <div class="btn-toggle-group" role="group" aria-label="Scatter page view">
                <button type="button" id="scatter-view-plot-btn" data-scatter-view="plot" aria-pressed="true">Plot</button>
                <button type="button" id="scatter-view-matrix-btn" data-scatter-view="matrix" aria-pressed="false">Matrix</button>
            </div>
            <select id="scatter-x-col"></select>
            <select id="scatter-y-col"></select>
            <input id="scatter-bin-size" type="range" value="10">
            <span id="scatter-bin-size-value"></span>
            <select id="scatter-colormap"><option value="viridis" selected>Viridis</option></select>
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="density" selected>Density</option>
                <option value="scatter">Scatter</option>
            </select>
            <select id="scatter-diagonal-mode"><option value="histogram" selected>Histogram</option></select>
            <select id="scatter-color-column"><option value="">None</option></select>
            <select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select>
            <input id="scatter-link-brush" type="checkbox" checked>
            <input id="scatter-matrix-link-range" type="checkbox">
            <input id="scatter-suggestion-threshold" type="range" value="0.7">
            <span id="scatter-suggestion-threshold-value"></span>
            <span id="scatter-suggestions-label"></span>
            <button id="scatter-open-causal-btn" type="button">Open in Causal</button>
            <div id="scatter-active-filter-badge"></div>
            <div id="scatter-suggestions"></div>
            <div id="scatter-active-pair-label"></div>
            <div id="scatter-chart"></div>
            <div id="scatter-chart-loading" hidden></div>
            <div id="scatter-matrix-status"></div>
            <div id="scatter-matrix"></div>
            <div id="scatter-matrix-loading" hidden></div>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" type="range" value="160">
            <span id="scatter-matrix-cell-size-value"></span>
            <div id="scatter-analytics-group"></div>
            <span id="scatter-mode-label"></span>
            <div id="scatter-density-controls"></div>
            <div id="scatter-color-controls"></div>
            <div class="scatter-export-group"></div>
            <div class="scatter-stats-bar"></div>
            <div class="scatter-suggestions-bar"></div>
            <div data-scatter-view-panel="plot"></div>
            <div data-scatter-view-panel="matrix" hidden></div>
        </section>
    `;
}

describe('initScatterPage view toggles', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        buildDom();

        createChartMock.mockResolvedValue({
            setOption: vi.fn(),
            resize: vi.fn(),
            onPerformanceUpdate: vi.fn(),
            dispose: vi.fn(),
        });
        fetchScatterCorrelationsMock.mockResolvedValue({
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            base_column: 'HUFL',
            correlations: [],
            suggestions: [],
        });
        fetchScatterPointsMock.mockResolvedValue({
            points: [[1, 2], [2, 3]],
            total_points: 2,
            color_values: null,
            color_labels: null,
            color: '',
        });
        renderScatterMatrixViewMock.mockResolvedValue(undefined);
    });

    it('switches into matrix mode when the matrix toggle is clicked', async () => {
        const { initScatterPage } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        (document.getElementById('scatter-view-matrix-btn') as HTMLButtonElement).click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(renderScatterMatrixViewMock).toHaveBeenCalledTimes(1);
        expect(document.getElementById('scatter-view-plot-btn')?.getAttribute('aria-pressed')).toBe('false');
        expect(document.getElementById('scatter-view-matrix-btn')?.getAttribute('aria-pressed')).toBe('true');
        expect((document.querySelector('[data-scatter-view-panel="plot"]') as HTMLElement).hidden).toBe(true);
        expect((document.querySelector('[data-scatter-view-panel="matrix"]') as HTMLElement).hidden).toBe(false);
    });
});