import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildOptionMock = vi.fn((..._args: unknown[]) => ({}));
const updateColorbarUIMock = vi.fn();
const updateBinnedReadoutMock = vi.fn();
const updateCorrelationStatsMock = vi.fn();
const updateMarginalPlotsMock = vi.fn();
const syncModeUIMock = vi.fn();

const appStateMock = {
    scatter: {
        chart: {
            setOption: vi.fn(),
            resize: vi.fn(),
        },
        suggestionThreshold: 0.7,
        activeView: 'plot',
        metadata: { columns: [{ name: 'HUFL' }, { name: 'HULL' }] },
        pageInitialized: false,
        initialized: false,
    },
    columnRanges: {},
    adaptiveLineFilters: [],
    metadata: null,
};

vi.mock('../store/index.js', () => ({
    appState: appStateMock,
}));

vi.mock('./helpers.js', () => ({
    getEl: (id: string) => document.getElementById(id),
    normalizeScatterSuggestionThreshold: (value: unknown) => Number(value),
}));

vi.mock('./state.js', () => ({
    currentControls: vi.fn(),
    isLinkedBrushEnabled: () => false,
    normalizeAnalyticsView: (value: string) => value || 'plot',
}));

vi.mock('./rendering.js', () => ({
    buildOption: (...args: unknown[]) => buildOptionMock(...args),
    updateColorbarUI: () => updateColorbarUIMock(),
    updateBinnedReadout: () => updateBinnedReadoutMock(),
    updateCorrelationStats: () => updateCorrelationStatsMock(),
    updateMarginalPlots: () => updateMarginalPlotsMock(),
    syncModeUI: () => syncModeUIMock(),
    exportScatterPNG: vi.fn(),
    exportScatterSVG: vi.fn(),
    exportScatterHTML: vi.fn(),
    exportScatterData: vi.fn(),
    exportScatterParquet: vi.fn(),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <section id="page-scatter">
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <input id="scatter-bin-size" value="10">
            <span id="scatter-bin-size-value"></span>
            <select id="scatter-colormap"><option value="viridis" selected>Viridis</option></select>
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="density" selected>Density</option>
                <option value="scatter">Scatter</option>
            </select>
            <select id="scatter-diagonal-mode"><option value="histogram" selected>Histogram</option></select>
            <select id="scatter-color-column"><option value="" selected>None</option></select>
            <select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select>
            <input id="scatter-link-brush" type="checkbox">
            <input id="scatter-suggestion-threshold" value="0.7">
            <span id="scatter-suggestion-threshold-value"></span>
            <span id="scatter-suggestions-label"></span>
            <button id="scatter-open-causal-btn" type="button"></button>
            <div id="scatter-chart"></div>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" value="160">
            <span id="scatter-matrix-cell-size-value"></span>
        </section>
    `;
}

describe('bindScatterControls', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        buildDom();
    });

    it('updates marginal plots when render mode changes', async () => {
        const { bindScatterControls } = await import('./controls.js');

        bindScatterControls({
            initScatterPage: vi.fn(async () => {}),
            renderScatter: vi.fn(async () => {}),
            refreshCorrelationsAndSuggestions: vi.fn(async () => {}),
            refreshActiveScatterView: vi.fn(async () => {}),
            setScatterView: vi.fn(async () => {}),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => {}),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        });

        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        renderMode.value = 'scatter';
        renderMode.dispatchEvent(new Event('change'));

        expect(appStateMock.scatter.chart.setOption).toHaveBeenCalledTimes(1);
        expect(updateMarginalPlotsMock).toHaveBeenCalledTimes(1);
    });

    it('updates marginal plots when diagonal mode changes on the main plot', async () => {
        const { bindScatterControls } = await import('./controls.js');

        bindScatterControls({
            initScatterPage: vi.fn(async () => {}),
            renderScatter: vi.fn(async () => {}),
            refreshCorrelationsAndSuggestions: vi.fn(async () => {}),
            refreshActiveScatterView: vi.fn(async () => {}),
            setScatterView: vi.fn(async () => {}),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => {}),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        });

        const diagonalMode = document.getElementById('scatter-diagonal-mode') as HTMLSelectElement;
        diagonalMode.value = 'kde';
        diagonalMode.dispatchEvent(new Event('change'));

        expect(appStateMock.scatter.chart.setOption).toHaveBeenCalledTimes(1);
        expect(updateMarginalPlotsMock).toHaveBeenCalledTimes(1);
    });
});
