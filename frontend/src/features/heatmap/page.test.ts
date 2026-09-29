import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCleaningPlanStore } from '../../cleaning/store.js';
import { clearScatterPairIntent, consumeScatterPairIntent } from '../scatter/pairIntent.js';
import { paletteForColorScale } from '../../utils/colorScales.js';
import { getPlotColorScale } from '../../utils/settings.js';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';

class ResizeObserverMock {
    static instances: ResizeObserverMock[] = [];

    constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverMock.instances.push(this);
    }

    observe(): void { }

    disconnect(): void { }

    trigger(target: Element): void {
        this.callback([
            {
                target,
                contentRect: target.getBoundingClientRect(),
            } as ResizeObserverEntry,
        ], this as unknown as ResizeObserver);
    }
}

const DEFAULT_MATRIX_RESPONSE = {
    columns: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
    pearson_raw: [
        [1, 0.95, 0.95, 0, 0, 0],
        [0.95, 1, 0.95, 0, 0, 0],
        [0.95, 0.95, 1, 0, -0.6, 0],
        [0, 0, 0, 1, 0.95, 0.95],
        [0, 0, -0.6, 0.95, 1, 0.95],
        [0, 0, 0, 0.95, 0.95, 1],
    ],
    spearman_raw: [
        [1, 0.95, 0.95, 0, 0, 0],
        [0.95, 1, 0.95, 0, 0, 0],
        [0.95, 0.95, 1, 0, -0.6, 0],
        [0, 0, 0, 1, 0.95, 0.95],
        [0, 0, -0.6, 0.95, 1, 0.95],
        [0, 0, 0, 0.95, 0.95, 1],
    ],
    kendall_raw: [
        [1, 0.8, 0.8, 0, 0, 0],
        [0.8, 1, 0.8, 0, 0, 0],
        [0.8, 0.8, 1, 0, -0.5, 0],
        [0, 0, 0, 1, 0.8, 0.8],
        [0, 0, -0.5, 0.8, 1, 0.8],
        [0, 0, 0, 0.8, 0.8, 1],
    ],
    pearson_diff: [
        [1, -0.1, 0.2, 0.4, 0, 0],
        [-0.1, 1, 0.3, 0, 0, 0],
        [0.2, 0.3, 1, 0, -0.2, 0],
        [0.4, 0, 0, 1, 0.1, 0.1],
        [0, 0, -0.2, 0.1, 1, 0.1],
        [0, 0, 0, 0.1, 0.1, 1],
    ],
    spearman_diff: [
        [1, -0.2, 0.1, 0.35, 0, 0],
        [-0.2, 1, 0.25, 0, 0, 0],
        [0.1, 0.25, 1, 0, -0.15, 0],
        [0.35, 0, 0, 1, 0.05, 0.05],
        [0, 0, -0.15, 0.05, 1, 0.05],
        [0, 0, 0, 0.05, 0.05, 1],
    ],
    kendall_diff: [
        [1, -0.33, 0.11, 0.55, 0, 0],
        [-0.33, 1, 0.22, 0, 0, 0],
        [0.11, 0.22, 1, 0, -0.44, 0],
        [0.55, 0, 0, 1, 0.12, 0.12],
        [0, 0, -0.44, 0.12, 1, 0.12],
        [0, 0, 0, 0.12, 0.12, 1],
    ],
};

let heatmapPageChange: ((detail: { page?: string }) => void) | null = null;

// Mock shared dependencies
vi.mock('../../services/api/index.js', () => ({
    fetchCorrelationMatrix: vi.fn(),
}));

vi.mock('../../utils/chartExport.js', () => ({
    exportElementPNG: vi.fn(),
    exportElementSVG: vi.fn(),
    exportElementHTML: vi.fn(),
    exportMatrixCSV: vi.fn(),
}));

vi.mock('../../utils/bindExportButtons.js', () => ({
    bindExportButtons: vi.fn(),
}));

vi.mock('../../platform/pageLifecycle.js', () => ({
    createPageLifecycle: vi.fn(({ page, init, onVisible, onEveryPageChange }) => {
        const handler = (detail: { page?: string }) => {
            if (detail?.page === page) {
                init?.();
                onVisible?.();
            }
            onEveryPageChange?.();
        };
        heatmapPageChange = handler;
        return {
            activate: () => {
                init?.();
                onVisible?.();
            },
            dispose: () => {
                if (heatmapPageChange === handler) heatmapPageChange = null;
            },
        };
    }),
}));

async function activateHeatmap(): Promise<void> {
    // Simulate the typed lifecycle callback that navigation invokes.
    if (!heatmapPageChange) throw new Error('Heatmap lifecycle was not mounted');
    heatmapPageChange({ page: 'heatmap' });
    // Allow the async matrix load to resolve and the rAF callback to fire.
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferredPromise<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('heatmapPage with clustering', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        window.localStorage.clear();
        window.sessionStorage.clear();
        clearScatterPairIntent();
        ResizeObserverMock.instances = [];
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        vi.mocked(fetchCorrelationMatrix).mockReset();
        vi.mocked(fetchCorrelationMatrix).mockResolvedValue(structuredClone(DEFAULT_MATRIX_RESPONSE) as any);
        // happy-dom does not always fire requestAnimationFrame in a
        // deterministic way, so stub it to run callbacks synchronously.
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });
        // document.fonts.ready is a never-resolving promise in happy-dom
        // unless fonts have actually loaded. Resolve immediately so that
        // the heatmap render isn't blocked on font loading.
        if (document.fonts) {
            Object.defineProperty(document.fonts, 'ready', {
                configurable: true,
                get: () => Promise.resolve(),
            });
        }

        document.body.innerHTML = `
            <div id="heatmap-container"></div>
            <div id="heatmap-empty-state"></div>
            <div id="heatmap-loading" hidden></div>
            <span id="heatmap-metric-info" class="toolbar-info-icon" data-info-tip=""></span>
            <select id="heatmap-metric">
                <option value="pearson_raw" selected>Pearson (raw)</option>
                <option value="spearman_raw">Spearman (raw)</option>
                <option value="kendall_raw">Kendall tau (raw)</option>
                <option value="pearson_diff">Pearson (Δ)</option>
                <option value="spearman_diff">Spearman (Δ)</option>
                <option value="kendall_diff">Kendall tau (Δ)</option>
            </select>
            <select id="heatmap-diagonal-mode"><option value="kde">Density curve</option><option value="histogram">Histogram</option></select>
            <select id="heatmap-pair-mode"><option value="density">Density</option><option value="scatter">Scatter</option></select>
            <select id="heatmap-color-column"><option value="">None</option></select>
            <input id="heatmap-cell-size" type="range" min="24" max="72" step="4" value="36">
            <span id="heatmap-cell-size-value" class="range-value">36</span>
            <input id="heatmap-cluster-toggle" type="checkbox" checked>
            <input id="heatmap-lock-order" type="checkbox">
            <span id="heatmap-order-locked-status" hidden>Order locked</span>
            <button id="heatmap-fit-toggle" type="button" class="btn btn-ghost btn-sm toolbar-toggle-btn" aria-pressed="false">Snap to panel</button>
            <button id="heatmap-axis-fit-toggle" type="button" class="btn btn-ghost btn-sm toolbar-toggle-btn" aria-pressed="false">Fit color axis</button>
            <button id="heatmap-add-columns-to-plan" type="button">Keep matrix columns…</button>
            <dialog id="heatmap-plan-columns-dialog"><p id="heatmap-plan-columns-summary"></p><button id="heatmap-plan-columns-cancel" type="button">Cancel</button><button id="heatmap-plan-columns-confirm" type="button">Add keep-columns stage</button></dialog>
            <input id="scatter-link-brush" type="checkbox" checked>
            <select id="scatter-x-col"><option value=""></option><option value="a1">a1</option><option value="a2">a2</option><option value="a3">a3</option><option value="b1">b1</option><option value="b2">b2</option><option value="b3">b3</option></select>
            <select id="scatter-y-col"><option value=""></option><option value="a1">a1</option><option value="a2">a2</option><option value="a3">a3</option><option value="b1">b1</option><option value="b2">b2</option><option value="b3">b3</option></select>
            <section id="page-heatmap">
              <div class="toolbar scatter-toolbar">
              <details class="toolbar-disclosure toolbar-disclosure--end" data-toolbar-popover data-toolbar-export>
                <summary class="toolbar-disclosure__summary">Export</summary>
                <div class="toolbar-disclosure__menu">
                  <button id="heatmap-export-png-btn" type="button">PNG</button>
                  <button id="heatmap-export-svg-btn" type="button">SVG</button>
                  <button id="heatmap-export-html-btn" type="button">HTML</button>
                  <button id="heatmap-export-csv-btn" type="button">CSV</button>
                </div>
              </details>
              </div>
            </section>
        `;
    });

    afterEach(() => {
        heatmapPageChange = null;
        delete (globalThis as any).ResizeObserver;
        vi.restoreAllMocks();
    });

    it('defaults to density previews and persists display choices without changing the metric', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        const diagonal = document.getElementById('heatmap-diagonal-mode') as HTMLSelectElement;
        const pairs = document.getElementById('heatmap-pair-mode') as HTMLSelectElement;
        const color = document.getElementById('heatmap-color-column') as HTMLSelectElement;
        expect(diagonal.value).toBe('kde');
        expect(pairs.value).toBe('density');
        expect(color.disabled).toBe(true);
        expect(document.querySelectorAll('.heatmap-grid-legend__bar')).toHaveLength(1);
        expect(document.querySelector('.heatmap-density-legend')).toBeNull();
        expect(document.querySelector('.heatmap-grid-legend')?.getAttribute('aria-label'))
            .toContain('lower relative pair density');
        expect(document.querySelector('.heatmap-grid-legend__bar')?.getAttribute('style'))
            .toContain(paletteForColorScale(getPlotColorScale('correlationMatrix')).join(', '));
        expect(document.querySelector('.heatmap-preview-context')).toBeNull();
        expect(document.querySelector('.heatmap-legend-stack')?.textContent).not.toContain('Frames and signed badges show');

        diagonal.value = 'histogram';
        diagonal.dispatchEvent(new Event('change', { bubbles: true }));
        pairs.value = 'scatter';
        pairs.dispatchEvent(new Event('change', { bubbles: true }));

        expect(window.localStorage.getItem('edatime_heatmap_diagonal_mode')).toBe('histogram');
        expect(window.localStorage.getItem('edatime_heatmap_pair_mode')).toBe('scatter');
        expect(color.disabled).toBe(false);
        expect(document.querySelector('.heatmap-density-legend')).toBeNull();
        expect(Array.from(document.querySelectorAll('.heatmap-grid-legend__tick')).map((tick) => tick.textContent))
            .toEqual(['-1.0', '+1.0']);
        expect(metric.value).toBe('pearson_raw');
    });

    it('uses the configured global scale for the shared legend', async () => {
        window.localStorage.setItem('edatime-settings', JSON.stringify({
            plotColorScales: { correlationMatrix: 'magma' },
        }));
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        expect(document.querySelector('.heatmap-grid-legend__bar')?.getAttribute('style'))
            .toContain(paletteForColorScale('magma').join(', '));
    });

    it('initializes and renders a 6x6 grid', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const cells = document.querySelectorAll('.heatmap-cell');
        expect(cells.length).toBe(36);
    });

    it('provides complete grid rows, arrow navigation, keyboard reorder, and Enter/Space activation', async () => {
        const showPage = vi.fn();
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage });
        await activateHeatmap();

        const grid = document.querySelector<HTMLElement>('.heatmap-grid')!;
        const rows = Array.from(grid.querySelectorAll<HTMLElement>(':scope > [role="row"]'));
        expect(grid.getAttribute('aria-rowcount')).toBe('7');
        expect(grid.getAttribute('aria-colcount')).toBe('7');
        expect(rows).toHaveLength(7);
        expect(rows.map((row) => row.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3', '4', '5', '6', '7']);
        expect(rows[0]?.querySelectorAll('[role="columnheader"]')).toHaveLength(7);
        expect(rows[1]?.firstElementChild).toMatchObject({ getAttribute: expect.any(Function) });
        expect(rows[1]?.firstElementChild?.getAttribute('role')).toBe('rowheader');
        expect(rows[1]?.firstElementChild?.getAttribute('aria-colindex')).toBe('1');
        expect(rows[1]?.firstElementChild?.getAttribute('aria-rowindex')).toBe('2');
        expect(rows[1]?.querySelector('.heatmap-cell')?.getAttribute('aria-colindex')).toBe('2');
        expect(rows[1]?.querySelector('.heatmap-cell')?.getAttribute('aria-label')).toContain('Row 1 of 6, column 1 of 6');
        expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);

        const firstCell = grid.querySelector<HTMLElement>('.heatmap-cell[data-interactive="true"][tabindex="0"]')!;
        firstCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        const movedCell = document.activeElement as HTMLElement;
        expect(movedCell.classList.contains('heatmap-cell')).toBe(true);
        expect(movedCell).not.toBe(firstCell);
        expect(movedCell.tabIndex).toBe(0);
        expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
        expect(document.getElementById('heatmap-focus-readout')?.textContent).toContain('correlation');
        expect(document.getElementById('heatmap-copy-cell-btn')?.hasAttribute('disabled')).toBe(false);
        expect(movedCell.getAttribute('aria-selected')).toBe('true');

        movedCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(showPage).toHaveBeenCalledWith('scatter');
        const openPairButton = document.getElementById('heatmap-open-pair-btn') as HTMLButtonElement;
        expect(openPairButton.disabled).toBe(false);
        expect(openPairButton.textContent).toContain('Open Pair plot:');
        expect(consumeScatterPairIntent()).not.toBeNull();
        expect(showPage).toHaveBeenCalledTimes(1);

        const before = Array.from(grid.querySelectorAll<HTMLElement>('.heatmap-header')).map((header) => header.dataset.dragName);
        const header = grid.querySelector<HTMLElement>('.heatmap-header[data-order-index="0"]')!;
        header.focus();
        header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
        const afterHeaders = Array.from(document.querySelectorAll<HTMLElement>('.heatmap-header'));
        expect(afterHeaders.map((item) => item.dataset.dragName)).toEqual([before[1], before[0], ...before.slice(2)]);
        expect(document.activeElement).toBe(afterHeaders[1]);
        expect(document.getElementById('heatmap-keyboard-status')?.textContent).toContain(`Moved ${before[0]} to column 2 of 6`);
        expect(document.querySelector('.heatmap-grid')?.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    });

    it('keeps a keyboard entry when a refresh removes the previously focused pair', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        document.querySelector<HTMLElement>('.heatmap-grid [tabindex="0"]')!.focus();
        vi.mocked(fetchCorrelationMatrix).mockResolvedValue({
            ...structuredClone(DEFAULT_MATRIX_RESPONSE), columns: ['new'],
            spearman_raw: [[1]],
        } as any);
        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'spearman_raw';
        metric.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(document.querySelectorAll('.heatmap-header')).toHaveLength(1));
        const stops = document.querySelectorAll<HTMLElement>('.heatmap-grid [tabindex="0"]');
        expect(stops).toHaveLength(1);
        expect(stops[0].textContent).toBe('new');
    });

    it('does not redraw the previous matrix after a failed context refresh', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        vi.mocked(fetchCorrelationMatrix).mockRejectedValue(new Error('Refresh failed'));
        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'spearman_raw';
        metric.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(metric.disabled).toBe(false));
        document.getElementById('heatmap-axis-fit-toggle')!.click();
        expect(document.querySelector('.heatmap-grid')).toBeNull();
        document.getElementById('heatmap-axis-fit-toggle')!.click();
    });

    it('exports the live rendered heatmap element for every visual format', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const { bindExportButtons } = await import('../../utils/bindExportButtons.js');
        const { exportElementPNG, exportElementSVG, exportElementHTML } = await import('../../utils/chartExport.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const config = vi.mocked(bindExportButtons).mock.calls.at(-1)?.[1];
        config?.png.fn(config.png.filename);
        config?.svg.fn(config.svg.filename);
        config?.html.fn(config.html.filename);

        const container = document.getElementById('heatmap-container');
        expect(exportElementPNG).toHaveBeenCalledWith(container, 'edatime_heatmap.png');
        expect(exportElementSVG).toHaveBeenCalledWith(container, 'edatime_heatmap.svg');
        expect(exportElementHTML).toHaveBeenCalledWith(container, 'edatime_heatmap.html');
    });

    it('does not export a stale matrix while the Correlations page is hidden', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const { bindExportButtons } = await import('../../utils/bindExportButtons.js');
        const { exportElementPNG } = await import('../../utils/chartExport.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        document.getElementById('page-heatmap')!.hidden = true;

        const config = vi.mocked(bindExportButtons).mock.calls.at(-1)?.[1];
        config?.png.fn(config.png.filename);

        expect(exportElementPNG).not.toHaveBeenCalled();
    });

    it('names CSV exports from the metric selected at click time', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const { bindExportButtons } = await import('../../utils/bindExportButtons.js');
        const { exportMatrixCSV } = await import('../../utils/chartExport.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const metricSelect = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metricSelect.value = 'kendall_diff';
        metricSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const config = vi.mocked(bindExportButtons).mock.calls.at(-1)?.[1];
        config?.csv?.fn(config.csv.filename);

        expect(exportMatrixCSV).toHaveBeenCalledWith(
            DEFAULT_MATRIX_RESPONSE.columns,
            DEFAULT_MATRIX_RESPONSE.kendall_diff,
            'edatime_correlation_kendall_diff.csv',
        );
    });

    it('closes the Export disclosure on Escape and restores summary focus', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const disclosure = document.querySelector<HTMLDetailsElement>('#page-heatmap .toolbar-disclosure--end')!;
        const summary = disclosure.querySelector<HTMLElement>('summary')!;
        disclosure.open = true;

        disclosure.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(disclosure.open).toBe(false);
        expect(document.activeElement).toBe(summary);
    });

    it('surfaces the locked-order state next to the matrix controls', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const toggle = document.getElementById('heatmap-lock-order') as HTMLInputElement;
        const status = document.getElementById('heatmap-order-locked-status') as HTMLElement;

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));

        expect(status.hidden).toBe(false);
        expect(status.textContent).toBe('Order locked');
    });

    it('confirms and authors a canonical keep-columns stage from the matrix', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const onPlanChanged = vi.fn();
        await initHeatmapPage({ showPage: vi.fn(), cleaningPlanStore: planStore, onPlanChanged });
        await activateHeatmap();

        document.getElementById('heatmap-add-columns-to-plan')!.click();
        expect(document.getElementById('heatmap-plan-columns-summary')?.textContent)
            .toContain('It does not alter values or remove rows');
        expect(planStore.getSnapshot()!.stages).toHaveLength(0);

        document.getElementById('heatmap-plan-columns-confirm')!.click();
        expect(planStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'columnSelect', sourcePage: 'correlation', mode: 'keep', columns: ['ts', ...DEFAULT_MATRIX_RESPONSE.columns],
        }]);
        expect(onPlanChanged).toHaveBeenCalledTimes(1);
    });

    it('requests coefficients with the same linked filters and time window as the matrix previews, and refreshes on context changes', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        let snapshot = makeWorkspaceSnapshot({
            dataset: {
                metadata: {
                    time_column: 'ts',
                    column_profiles: [
                        { name: 'x', min: 0, max: 10 },
                        { name: 'y', min: 0, max: 10 },
                    ],
                } as any,
            },
            filters: { columnRanges: { x: { from: 2, to: 4 } } },
            viewport: { xMin: 100, xMax: 200, yMin: 0, yMax: 10 },
        });
        const listeners = new Set<(next: typeof snapshot) => void>();
        const workspace = {
            getSnapshot: vi.fn(() => snapshot),
            subscribe: vi.fn((listener: (next: typeof snapshot) => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }),
        };
        await initHeatmapPage({ showPage: vi.fn(), workspace: workspace as any });
        await activateHeatmap();

        expect(fetchCorrelationMatrix).toHaveBeenLastCalledWith('pearson_raw', expect.objectContaining({
            start: 100,
            end: 200,
            filters: [{ column: 'x', from: 2, to: 4 }],
        }));

        snapshot = makeWorkspaceSnapshot({
            dataset: snapshot.dataset,
            filters: snapshot.filters,
            viewport: { xMin: 150, xMax: 175, yMin: 0, yMax: 10 },
        });
        listeners.forEach((listener) => listener(snapshot));
        await vi.waitFor(() => expect(fetchCorrelationMatrix).toHaveBeenCalledTimes(2));
        expect(fetchCorrelationMatrix).toHaveBeenLastCalledWith('pearson_raw', expect.objectContaining({
            start: 150,
            end: 175,
            filters: [{ column: 'x', from: 2, to: 4 }],
        }));
    });

    it('releases prior control listeners before re-initializing the Heatmap page', async () => {
        const { initHeatmapPage } = await import('./page.js');
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        vi.mocked(fetchCorrelationMatrix).mockClear();

        const metricSelect = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metricSelect.value = 'spearman_raw';
        metricSelect.dispatchEvent(new Event('change', { bubbles: true }));

        await vi.waitFor(() => {
            expect(fetchCorrelationMatrix).toHaveBeenCalledTimes(1);
        });
    });

    it('renders the compact seaborn-style heatmap frame and color scale', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        Object.defineProperty(document.getElementById('heatmap-container'), 'clientWidth', {
            configurable: true,
            value: 1280,
        });
        await activateHeatmap();

        const shell = document.querySelector('.heatmap-shell');
        const scale = document.querySelector('.heatmap-grid-legend');
        const positiveTick = document.querySelector('.heatmap-grid-legend__tick--positive');
        const negativeTick = document.querySelector('.heatmap-grid-legend__tick--negative');
        const headers = Array.from(document.querySelectorAll('.heatmap-header'));
        const strongPositiveCell = document.querySelector('.heatmap-cell.heatmap-cell--positive[data-row="0"][data-col="0"]') as HTMLElement | null;
        const negativeCell = document.querySelector('.heatmap-cell.heatmap-cell--negative') as HTMLElement | null;

        expect(shell).not.toBeNull();
        expect(scale).not.toBeNull();
        expect(positiveTick?.textContent).toBe('+1.0 / Higher');
        expect(negativeTick?.textContent).toBe('-1.0 / Lower');
        expect(Array.from(document.querySelectorAll('.heatmap-grid-legend__tick')).map((tick) => tick.textContent))
            .toEqual(['-1.0 / Lower', '+1.0 / Higher']);
        expect(headers.every((header) => header.classList.contains('heatmap-header--vertical'))).toBe(false);
        // Cells now carry `background` directly (inline) instead of
        // `--heatmap-cell-bg`. The audit dropped the dead CSS variable,
        // so we verify the inline background renders a colour.
        expect(strongPositiveCell?.style.background).toBeTruthy();
        expect(negativeCell?.style.background).toBeTruthy();
        // C3: cells carry a sign prefix (`+` / `−` / `±`) so colour is
        // not the only signal for direction.
        expect(strongPositiveCell?.dataset.correlationLabel).toMatch(/^[+±−]/);
        expect(strongPositiveCell?.querySelectorAll(':scope > canvas')).toHaveLength(1);
    });

    it('fits the color axis to the strongest off-diagonal magnitude when requested', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const fitColorAxisToggle = document.getElementById('heatmap-axis-fit-toggle') as HTMLButtonElement;
        fitColorAxisToggle.click();

        const positiveTick = document.querySelector('.heatmap-grid-legend__tick--positive');
        const negativeTick = document.querySelector('.heatmap-grid-legend__tick--negative');
        expect(positiveTick?.textContent).toBe('+0.95 / Higher');
        expect(negativeTick?.textContent).toBe('-0.95 / Lower');
        expect(Array.from(document.querySelectorAll('.heatmap-grid-legend__tick')).map((tick) => tick.textContent))
            .toEqual(['-0.95 / Lower', '+0.95 / Higher']);
    });

    it('switches narrow heatmap headers into a vertical label mode', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const fitToggle = document.getElementById('heatmap-fit-toggle') as HTMLButtonElement;
        fitToggle.click();

        const slider = document.getElementById('heatmap-cell-size') as HTMLInputElement;
        slider.value = '24';
        slider.dispatchEvent(new Event('input', { bubbles: true }));

        await vi.waitFor(() => {
            const headers = Array.from(document.querySelectorAll('.heatmap-header'));
            expect(headers.some((header) => header.classList.contains('heatmap-header--vertical'))).toBe(true);
        });
    });

    it('reorders columns by cluster when enabled', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const headers = Array.from(document.querySelectorAll('.heatmap-header'))
            .map((el) => el.textContent?.trim());
        const rowLabels = Array.from(document.querySelectorAll('.heatmap-row-label'))
            .map((el) => el.textContent?.trim());

        // Mock dataset: block A = {a1,a2,a3}, block B = {b1,b2,b3}.
        // The full a-block should appear before the b-block in both
        // header and row label orders.
        const firstAHeader = headers.indexOf('a1');
        const firstBHeader = headers.indexOf('b1');
        const lastAHeader = headers.lastIndexOf('a3');
        const firstARow = rowLabels.indexOf('a1');
        const lastARow = rowLabels.lastIndexOf('a3');
        const firstBRow = rowLabels.indexOf('b1');

        expect(firstAHeader).toBeGreaterThanOrEqual(0);
        expect(firstAHeader).toBeLessThan(firstBHeader);
        expect(lastAHeader).toBeLessThan(firstBHeader);
        expect(firstARow).toBeGreaterThanOrEqual(0);
        expect(firstARow).toBeLessThan(firstBRow);
        expect(lastARow).toBeLessThan(firstBRow);
    });

    it('preserves original column indices in data-row / data-col', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        // The cluster-reordered grid should still have a cell with the
        // original (a1, b1) index pair (original 0,3).
        const crossCell = document.querySelector('.heatmap-cell[data-row="0"][data-col="3"]');
        expect(crossCell).not.toBeNull();
    });

    it('opens a matrix cell pair with a single click', async () => {
        const showPage = vi.fn();
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage });
        await activateHeatmap();

        const cell = document.querySelector('.heatmap-cell[data-row="0"][data-col="3"]') as HTMLElement;
        expect(cell).not.toBeNull();
        // Invoke the click handler directly. happy-dom's `el.click()` and
        // bubbled MouseEvent dispatch do not always reach property-style
        // onclick handlers on parent elements.
        const container = document.getElementById('heatmap-container') as HTMLElement;
        const handler = container.onclick;
        expect(handler).toBeTypeOf('function');
        (handler as (ev: Partial<MouseEvent>) => void).call(container, { target: cell } as unknown as MouseEvent);

        expect(showPage).toHaveBeenCalledTimes(1);
        expect(cell.classList.contains('is-selected')).toBe(true);
        expect(showPage).toHaveBeenCalledWith('scatter');
        expect(consumeScatterPairIntent()).toEqual({ x: 'a1', y: 'b1' });
        expect(cell.getAttribute('aria-selected')).toBe('true');
    });

    it('opens the chosen pair directly with Enter and Space', async () => {
        const showPage = vi.fn();
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage });
        await activateHeatmap();

        const cell = document.querySelector('.heatmap-cell[data-row="0"][data-col="3"]') as HTMLElement;
        const container = document.getElementById('heatmap-container') as HTMLElement;
        for (const key of ['Enter', ' ']) {
            cell.focus();
            container.onkeydown!.call(container, {
                key,
                target: cell,
                preventDefault: vi.fn(),
            } as unknown as KeyboardEvent);
        }
        expect(showPage).toHaveBeenCalledTimes(2);
        expect(showPage).toHaveBeenLastCalledWith('scatter');
        expect(consumeScatterPairIntent()).toEqual({ x: 'a1', y: 'b1' });
    });

    it('previews a focused pair without navigating and keeps the optional Open Pair plot action', async () => {
        const showPage = vi.fn();
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage });
        await activateHeatmap();
        const cell = document.querySelector<HTMLElement>('.heatmap-cell[data-row="0"][data-col="3"]')!;
        cell.focus();
        cell.dispatchEvent(new Event('pointerover', { bubbles: true }));
        expect(showPage).not.toHaveBeenCalled();
        expect(document.getElementById('heatmap-focus-readout')?.textContent).toContain('a1 and b1');
        (document.getElementById('heatmap-open-pair-btn') as HTMLButtonElement).click();
        expect(showPage).toHaveBeenCalledTimes(1);
        expect(showPage).toHaveBeenCalledWith('scatter');
        expect(consumeScatterPairIntent()).toEqual({ x: 'a1', y: 'b1' });
    });

    it('opens the selected pair without requiring the Pair plot controls to be upgraded', async () => {
        const showPage = vi.fn();
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage });
        await activateHeatmap();
        const cell = document.querySelector('.heatmap-cell[data-row="0"][data-col="3"]') as HTMLElement;
        const container = document.getElementById('heatmap-container')!;
        container.onclick!.call(container, { target: cell } as unknown as PointerEvent);
        expect(showPage).toHaveBeenCalledTimes(1);
        expect(cell.classList.contains('is-selected')).toBe(true);
        expect(showPage).toHaveBeenCalledWith('scatter');
        expect(consumeScatterPairIntent()).toEqual({ x: 'a1', y: 'b1' });
    });

    it('reselects the matching matrix cell when Pair plot axes change', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const x = document.getElementById('scatter-x-col') as HTMLSelectElement;
        const y = document.getElementById('scatter-y-col') as HTMLSelectElement;
        x.value = 'b2';
        y.value = 'a3';

        y.dispatchEvent(new Event('change', { bubbles: true }));

        const selected = document.querySelector<HTMLElement>('.heatmap-cell.is-selected');
        expect(selected?.dataset.rowName).toBe('b2');
        expect(selected?.dataset.colName).toBe('a3');
        expect(selected?.getAttribute('aria-selected')).toBe('true');
    });

    it('omits redundant summaries and strongest-pair suggestions', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const container = document.getElementById('heatmap-container')!;
        expect(container.querySelector('.heatmap-stat-summary')).toBeNull();
        expect(container.querySelector('.heatmap-suggestions')).toBeNull();
        expect(container.textContent).not.toContain('Top 3 |r|');
        expect(container.textContent).not.toContain('Sort: |r| desc');
    });

    it('renders semantic rows and one canvas for every matrix coordinate', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const grid = document.querySelector('.heatmap-grid');
        const size = DEFAULT_MATRIX_RESPONSE.columns.length;
        expect(grid?.children).toHaveLength(size + 1);
        expect(grid?.querySelectorAll(':scope > [role="row"]')).toHaveLength(size + 1);
        expect(grid?.querySelectorAll('.heatmap-cell')).toHaveLength(size ** 2);
        expect(grid?.querySelectorAll('.heatmap-cell-canvas')).toHaveLength(size ** 2);
        expect(grid?.querySelectorAll('.heatmap-cell--diagonal')).toHaveLength(size);
        expect(document.querySelector('.heatmap-scale')).toBeNull();
        expect(document.getElementById('scatter-matrix')).toBeNull();
        expect(document.getElementById('scatter-matrix-fft-panel')).toBeNull();
    });

    it('marks cluster boundaries on the first header/label of each cluster', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        // No physical separator cells: the grouped view shares the same
        // uniform N x N grid layout as the ungrouped view. Cluster
        // boundaries are conveyed via the cluster-start header/label
        // classes (the first column header and row label of each cluster).
        const separators = document.querySelectorAll('.heatmap-cluster-separator');
        expect(separators.length).toBe(0);

        const clusterStartHeaders = document.querySelectorAll('.heatmap-header--cluster-start');
        const clusterStartRowLabels = document.querySelectorAll('.heatmap-row-label--cluster-start');
        // Two clusters => at least one cluster-start header and one
        // cluster-start row label marking the second cluster.
        expect(clusterStartHeaders.length).toBeGreaterThanOrEqual(1);
        expect(clusterStartRowLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('disables clustering when toggle is unchecked', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const toggle = document.getElementById('heatmap-cluster-toggle') as HTMLInputElement;
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const headers = Array.from(document.querySelectorAll('.heatmap-header'))
            .map((el) => el.textContent?.trim());
        // Without clustering, headers should be in the original column order.
        expect(headers).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
    });

    it('refetches the selected first-difference matrix mode on metric change', async () => {
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        vi.mocked(fetchCorrelationMatrix)
            .mockResolvedValueOnce({
                columns: ['a1', 'a2'],
                pearson_raw: [
                    [1, 0.4],
                    [0.4, 1],
                ],
            } as any)
            .mockResolvedValueOnce({
                columns: ['a1', 'a2'],
                kendall_diff: [
                    [1, -0.33],
                    [-0.33, 1],
                ],
            } as any);

        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        expect(fetchCorrelationMatrix).toHaveBeenCalledTimes(1);

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'kendall_diff';
        metric.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const cell = document.querySelector('.heatmap-cell[data-row="0"][data-col="1"]') as HTMLElement | null;
        expect(fetchCorrelationMatrix).toHaveBeenCalledTimes(2);
        // C3: every cell carries a sign prefix; `−0.33` uses the
        // Unicode minus in JS so it's accessible.
        expect(cell?.dataset.correlationLabel).toBe('−0.33');
    });

    it('restores the last matrix metric after navigating away and back', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const metricSelect = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metricSelect.value = 'kendall_diff';
        metricSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(window.sessionStorage.getItem('edatime_heatmap_metric')).toBe('kendall_diff');

        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        expect((document.getElementById('heatmap-metric') as HTMLSelectElement).value).toBe('kendall_diff');
    });

    it('stores the selected metric guide on the shared info icon', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const infoIcon = document.getElementById('heatmap-metric-info') as HTMLElement | null;
        expect(infoIcon?.getAttribute('data-info-tip')).toBe('Use for linear relationships on the original aligned values.');

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'kendall_diff';
        metric.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(infoIcon?.getAttribute('data-info-tip')).toBe('Use when you want a conservative rank-based view of whether step-to-step changes agree in direction.');
    });

    it('shows a loading overlay while switching to a slow metric', async () => {
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        const pending = deferredPromise<any>();
        vi.mocked(fetchCorrelationMatrix)
            .mockResolvedValueOnce(structuredClone(DEFAULT_MATRIX_RESPONSE) as any)
            .mockReturnValueOnce(pending.promise);

        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'kendall_raw';
        metric.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.getElementById('heatmap-loading')?.hidden).toBe(false);
        expect(metric.disabled).toBe(true);
        expect(document.querySelectorAll('.heatmap-cell')).toHaveLength(0);

        pending.resolve({
            columns: ['a1', 'a2'],
            kendall_raw: [
                [1, 0.8],
                [0.8, 1],
            ],
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.getElementById('heatmap-loading')?.hidden).toBe(true);
        expect(metric.disabled).toBe(false);
    });

    it('shows an unavailable state when the selected named matrix is missing', async () => {
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        vi.mocked(fetchCorrelationMatrix).mockResolvedValue({
            columns: ['a1', 'a2'],
        } as any);

        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        expect(document.querySelectorAll('.heatmap-cell')).toHaveLength(0);
        expect(document.getElementById('heatmap-empty-state')?.textContent).toContain('unavailable in the correlation response');
    });

    it('keeps the matrix and color scale as one compact scrollable unit', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const shell = document.querySelector('.heatmap-shell') as HTMLElement | null;
        const grid = document.querySelector('.heatmap-grid') as HTMLElement | null;
        expect(shell).not.toBeNull();
        expect(grid).not.toBeNull();
        const scale = document.querySelector('.heatmap-grid-legend') as HTMLElement | null;
        // The grid must use its computed cell-template width so the scale
        // follows it directly rather than being pushed to the far edge of
        // the full-width shell.
        expect(grid!.style.display).toBe('grid');
        expect(grid!.style.width).toBe('');
        expect(scale).not.toBeNull();
        expect(grid!.nextElementSibling).toBe(document.querySelector('.heatmap-legend-stack'));
        expect(document.querySelector('.heatmap-legend-stack')?.contains(scale!)).toBe(true);
        expect(document.querySelector('.heatmap-legend-stack')?.contains(document.getElementById('heatmap-focus-readout'))).toBe(true);
        expect(document.querySelector('.heatmap-legend-stack')?.contains(document.getElementById('heatmap-open-pair-btn'))).toBe(true);
        // The shell must also allow horizontal scrolling for very wide
        // matrices rather than clipping cells.
        expect(getComputedStyle(shell!).overflowX).not.toBe('visible');
    });

    it('snaps to panel width when the Auto-fit toggle is on, regardless of slider value', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const slider = document.getElementById('heatmap-cell-size') as HTMLInputElement;
        // Push the slider well past what 6 columns can actually fit; the
        // fit-on default must still produce a sensible layout that uses the
        // available shell width.
        slider.value = '72';
        slider.dispatchEvent(new Event('input', { bubbles: true }));

        const fitToggle = document.getElementById('heatmap-fit-toggle') as HTMLButtonElement;
        expect(fitToggle.getAttribute('aria-pressed')).toBe('true');
        expect(fitToggle.classList.contains('is-active')).toBe(true);

        const colsAttr = (document.querySelector('.heatmap-grid') as HTMLElement).style.gridTemplateColumns;
        // After clicking Auto-fit the columns should be derived from the
        // container width rather than capped at the slider value (72px),
        // producing a "fit" cell size ≤ 72px.
        const cellSizes = colsAttr.split(' ').slice(1).map((s) => parseInt(s, 10));
        for (const size of cellSizes) {
            expect(size).toBeLessThanOrEqual(72);
            expect(size).toBeGreaterThanOrEqual(24);
        }
    });

    it('defaults Auto-fit on and watches the container with ResizeObserver', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const fitToggle = document.getElementById('heatmap-fit-toggle') as HTMLButtonElement;
        expect(fitToggle.getAttribute('aria-pressed')).toBe('true');
        expect(fitToggle.classList.contains('is-active')).toBe(true);
        expect(ResizeObserverMock.instances).toHaveLength(1);
    });
});

/* ─── C1–C11 follow-up audit tests ─────────────────────────────── */
describe('heatmapPage audit follow-ups (C1–C11)', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        // Re-import the page so module-level flags (`heatmapClusterEnabled`,
        // `metric`, `userColumnOrder`, etc.) reset to their module defaults.
        // Without this, tests in the upper describe can leak state via the
        // cluster toggle, fit toggle, or metric select into the tests here.
        vi.resetModules();
        window.localStorage.clear();
        window.sessionStorage.clear();
        ResizeObserverMock.instances = [];
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
        vi.mocked(fetchCorrelationMatrix).mockReset();
        vi.mocked(fetchCorrelationMatrix).mockResolvedValue(structuredClone(DEFAULT_MATRIX_RESPONSE) as any);
        // Run rAF callbacks synchronously so we don't have to wait for a real frame.
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
        if (document.fonts) {
            Object.defineProperty(document.fonts, 'ready', {
                configurable: true,
                get: () => Promise.resolve(),
            });
        }

        document.body.innerHTML = `
            <div id="heatmap-container"></div>
            <div id="heatmap-empty-state" hidden>
              <strong id="heatmap-empty-state-title"></strong>
              <span id="heatmap-empty-state-message"></span>
            </div>
            <div id="heatmap-loading" hidden></div>
            <span id="heatmap-metric-info" class="toolbar-info-icon" data-info-tip=""></span>
            <select id="heatmap-metric">
              <option value="pearson_raw" selected>Pearson (raw)</option>
              <option value="kendall_diff">Kendall (diff)</option>
            </select>
            <input id="heatmap-cell-size" type="range" min="24" max="72" step="4" value="36" />
            <span id="heatmap-cell-size-value">36</span>
            <input id="heatmap-cluster-toggle" type="checkbox" checked />
            <button id="heatmap-fit-toggle" type="button" aria-pressed="false"></button>
            <button id="heatmap-axis-fit-toggle" type="button" aria-pressed="false"></button>
            <select id="scatter-x-col"></select>
            <select id="scatter-y-col"></select>
            <section id="page-heatmap" hidden></section>
            <section id="page-heatmap-page" class="page" hidden></section>
            <div class="toolbar scatter-toolbar">
              <div class="scatter-toolbar__segment scatter-toolbar__segment--display">
                <span class="scatter-toolbar__eyebrow">Display</span>
                <div class="scatter-toolbar__fields">
                  <div class="scatter-toolbar__field">field-a</div>
                  <div class="scatter-toolbar__field">field-b</div>
                  <details class="scatter-toolbar__overflow" data-overflow="false">
                    <summary class="scatter-toolbar__overflow-btn">⋯</summary>
                    <div class="scatter-toolbar__overflow-menu"></div>
                  </details>
                </div>
              </div>
            </div>`;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // C1 — corner carries a single-line Y / X axis glyph + active metric.
    it('renders axis hints + active metric badge in the heatmap corner', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const corner = document.querySelector('.heatmap-corner');
        expect(corner).not.toBeNull();
        expect(corner?.querySelector('.heatmap-corner__axis')?.textContent).toBe('Y / X');
        // Active metric is "Pearson (raw)" (mocked default).
        expect(corner?.querySelector('.heatmap-corner__metric')?.textContent).toMatch(/Pearson/);
    });

    it('keeps cluster membership out of the rendered chrome', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        expect(document.querySelector('.heatmap-cluster-legend')).toBeNull();
        expect(document.querySelector('.heatmap-footer')).toBeNull();
    });

    it('ends the rendered container at the matrix shell or ordering caption', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const container = document.getElementById('heatmap-container');
        expect(container?.querySelector('.heatmap-footer')).toBeNull();
        expect(container?.lastElementChild?.matches('.heatmap-shell, .heatmap-order-caption')).toBe(true);
    });

    // C4 — row label height matches cell height under a small viewport.
    it('keeps the row label in sync with the cell size when Auto-fit caps the height', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const label = document.querySelector<HTMLElement>('.heatmap-row-label');
        const grid = document.querySelector<HTMLElement>('.heatmap-grid');
        expect(label).not.toBeNull();
        expect(grid).not.toBeNull();
        // The row label's inline height is set from JS using the same
        // `responsiveCell` value the grid uses for its column widths.
        // Assert it matches the cell-size part of the grid template.
        const labelHeight = parseInt(label!.style.height, 10);
        const colsAttr = grid!.style.gridTemplateColumns || '';
        const cellCols = colsAttr.split(' ').slice(1).map((s) => parseInt(s, 10));
        const expectedHeight = cellCols[0] ?? 0;
        expect(labelHeight).toBe(expectedHeight);
    });

    // C5 — cluster separators appear via inline border styles.
    it('marks cluster boundaries with an inline border-left / border-top', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const clusterHeader = document.querySelector<HTMLElement>('.heatmap-header--cluster-start');
        const clusterRow = document.querySelector<HTMLElement>('.heatmap-row-label--cluster-start');
        expect(clusterHeader).not.toBeNull();
        expect(clusterRow).not.toBeNull();
        // Inline border style comes from the JS emitter; assert both are non-empty.
        expect(clusterHeader!.style.borderLeft).toBeTruthy();
        expect(clusterRow!.style.borderTop).toBeTruthy();
    });

    it('does not crash when the heatmap page loads without a toolbar', async () => {
        // Strip the toolbar so the shared controller has nothing to register;
        // the page should still render cleanly.
        document.querySelector('.toolbar.scatter-toolbar')?.remove();
        const { initHeatmapPage } = await import('./page.js');
        await expect(initHeatmapPage({ showPage: vi.fn() })).resolves.not.toThrow();
    });

    // C10 — focusin on a row label paints every cell in that row.
    it('highlights every cell in a row when the row label receives focus', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const firstRowLabel = document.querySelector<HTMLElement>('.heatmap-row-label');
        const rowIndex = firstRowLabel!.dataset.clusterRow;
        firstRowLabel!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        // Give the focusin listener a microtask to process.
        await new Promise((r) => setTimeout(r, 0));

        const highlighted = document.querySelectorAll(`.heatmap-cell[data-row="${rowIndex}"].heatmap-row-highlight`);
        expect(highlighted.length).toBeGreaterThan(0);
        // The label itself gets the highlight class too.
        expect(firstRowLabel!.classList.contains('heatmap-row-highlight')).toBe(true);
    });

    // C11 — drag a column header onto another column header; the matrix
    // is re-rendered in the new order. We exercise the drop handler by
    // dispatching drag events directly on the grid wrapper.
    it('reorders columns when a header is dragged onto another header', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const headers = Array.from(document.querySelectorAll<HTMLElement>('.heatmap-header[data-drag-axis="col"]'));
        expect(headers.length).toBeGreaterThan(1);
        const firstName = headers[0]!.getAttribute('data-drag-name');
        const targetName = headers[headers.length - 1]!.getAttribute('data-drag-name');
        const target = headers[headers.length - 1]!;

        const dataTransfer = { setData: vi.fn(), effectAllowed: '' } as unknown as DataTransfer;
        const start = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });
        headers[0]!.dispatchEvent(start);
        // Use the captured name from `start.dataTransfer` would require a
        // real DnD pipeline; happy-dom does not bubble `dataTransfer`
        // through dragstart reliably. Re-derive it from the handler's
        // captured state by reading the data on the handler source.
        const dragging = headers[0]!.getAttribute('data-drag-name');

        const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
        target.dispatchEvent(drop);
        await new Promise((r) => setTimeout(r, 0));

        const after = Array.from(document.querySelectorAll<HTMLElement>('.heatmap-header[data-drag-axis="col"]'));
        const afterNames = after.map((h) => h.getAttribute('data-drag-name'));
        // The dragged column should now sit at the drop target's index.
        expect(afterNames[afterNames.length - 1]).toBe(dragging);
        // Sanity: the dragged column is no longer first.
        expect(afterNames[0]).not.toBe(dragging);
        // First column name before drop should not be first now.
        expect(afterNames[0]).not.toBe(firstName);
        // Target was previously last; it should still be reachable.
        expect(afterNames).toContain(targetName);
    });
});
