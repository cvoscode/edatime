import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock shared dependencies
vi.mock('../services/api/index.js', () => ({
    fetchCorrelationMatrix: vi.fn(),
}));

vi.mock('../utils/chartExport.js', () => ({
    exportElementPNG: vi.fn(),
    exportElementSVG: vi.fn(),
    exportElementHTML: vi.fn(),
    exportMatrixCSV: vi.fn(),
}));

vi.mock('../utils/bindExportButtons.js', () => ({
    bindExportButtons: vi.fn(),
}));

vi.mock('../app/pageLifecycle.js', () => ({
    createPageLifecycle: vi.fn(({ page, init, onVisible, onEveryPageChange }) => {
        // Track the handler so tests can clean it up between runs.
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ page?: string }>).detail;
            if (detail?.page === page) {
                init?.();
                onVisible?.();
            }
            onEveryPageChange?.();
        };
        (globalThis as any).__heatmapHandlers ||= [];
        (globalThis as any).__heatmapHandlers.push(handler);
        window.addEventListener('edatime:page-change', handler);
        return () => window.removeEventListener('edatime:page-change', handler);
    }),
}));

async function activateHeatmap(): Promise<void> {
    // Mount the heatmap page and then dispatch a page-change event to
    // simulate the user navigating to the heatmap page, which causes the
    // real lifecycle handler to run init() + onVisible().
    window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'heatmap' } }));
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
        const { fetchCorrelationMatrix } = await import('../services/api/index.js');
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
            <input id="heatmap-cell-size" type="range" min="24" max="72" step="4" value="36">
            <span id="heatmap-cell-size-value" class="range-value">36</span>
            <input id="heatmap-cluster-toggle" type="checkbox" checked>
            <select id="scatter-x-col"><option value=""></option><option value="a1">a1</option><option value="a2">a2</option><option value="a3">a3</option><option value="b1">b1</option><option value="b2">b2</option><option value="b3">b3</option></select>
            <select id="scatter-y-col"><option value=""></option><option value="a1">a1</option><option value="a2">a2</option><option value="a3">a3</option><option value="b1">b1</option><option value="b2">b2</option><option value="b3">b3</option></select>
        `;
    });

    afterEach(() => {
        // Remove page-change handlers registered during the test so that
        // the next test only triggers its own lifecycle.
        const handlers = (globalThis as any).__heatmapHandlers as Array<(e: Event) => void> | undefined;
        if (handlers) {
            for (const h of handlers) {
                window.removeEventListener('edatime:page-change', h);
            }
            handlers.length = 0;
        }
        vi.restoreAllMocks();
    });

    it('initializes and renders a 6x6 grid', async () => {
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const cells = document.querySelectorAll('.heatmap-cell');
        expect(cells.length).toBe(36);
    });

    it('renders the compact seaborn-style heatmap frame and color scale', async () => {
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const shell = document.querySelector('.heatmap-shell');
        const scale = document.querySelector('.heatmap-scale');
        const positiveTick = document.querySelector('.heatmap-scale__tick--positive');
        const negativeTick = document.querySelector('.heatmap-scale__tick--negative');
        const headers = Array.from(document.querySelectorAll('.heatmap-header'));
        const strongPositiveCell = document.querySelector('.heatmap-cell.heatmap-cell--positive[data-row="0"][data-col="0"]') as HTMLElement | null;
        const negativeCell = document.querySelector('.heatmap-cell.heatmap-cell--negative') as HTMLElement | null;

        expect(shell).not.toBeNull();
        expect(scale).not.toBeNull();
        expect(positiveTick?.textContent).toBe('+1.0');
        expect(negativeTick?.textContent).toBe('-1.0');
        expect(headers.every((header) => header.classList.contains('heatmap-header--vertical'))).toBe(true);
        expect(strongPositiveCell?.style.getPropertyValue('--heatmap-cell-bg')).toBeTruthy();
        expect(negativeCell?.style.getPropertyValue('--heatmap-cell-bg')).toBeTruthy();
    });

    it('reorders columns by cluster when enabled', async () => {
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
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
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        // The cluster-reordered grid should still have a cell with the
        // original (a1, b1) index pair (original 0,3).
        const crossCell = document.querySelector('.heatmap-cell[data-row="0"][data-col="3"]');
        expect(crossCell).not.toBeNull();
    });

    it('navigates to scatter with original column names on click', async () => {
        const showPage = vi.fn();
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
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

        const xCol = document.getElementById('scatter-x-col') as HTMLSelectElement;
        const yCol = document.getElementById('scatter-y-col') as HTMLSelectElement;
        expect(xCol.value).toBe('a1');
        expect(yCol.value).toBe('b1');
        expect(showPage).toHaveBeenCalledWith('scatter');
    });

    it('marks cluster boundaries on the first header/label of each cluster', async () => {
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
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
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
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
        const { fetchCorrelationMatrix } = await import('../services/api/index.js');
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

        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        expect(fetchCorrelationMatrix).toHaveBeenCalledTimes(1);

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'kendall_diff';
        metric.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const cell = document.querySelector('.heatmap-cell[data-row="0"][data-col="1"]') as HTMLElement | null;
        expect(fetchCorrelationMatrix).toHaveBeenCalledTimes(2);
        expect(cell?.textContent).toBe('-0.33');
    });

    it('stores the selected metric guide on the shared info icon', async () => {
        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
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
        const { fetchCorrelationMatrix } = await import('../services/api/index.js');
        const pending = deferredPromise<any>();
        vi.mocked(fetchCorrelationMatrix)
            .mockResolvedValueOnce(structuredClone(DEFAULT_MATRIX_RESPONSE) as any)
            .mockReturnValueOnce(pending.promise);

        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'kendall_raw';
        metric.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.getElementById('heatmap-loading')?.hidden).toBe(false);
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
    });

    it('falls back to legacy raw payloads and shows a clear message for unsupported modes', async () => {
        const { fetchCorrelationMatrix } = await import('../services/api/index.js');
        vi.mocked(fetchCorrelationMatrix).mockResolvedValue({
            columns: ['a1', 'a2'],
            pearson: [
                [1, 0.4],
                [0.4, 1],
            ],
            spearman: [
                [1, 0.5],
                [0.5, 1],
            ],
        } as any);

        const { initHeatmapPage } = await import('../pages/heatmapPage.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        let cell = document.querySelector('.heatmap-cell[data-row="0"][data-col="1"]') as HTMLElement | null;
        expect(cell?.textContent).toBe('0.40');

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'kendall_diff';
        metric.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.querySelectorAll('.heatmap-cell')).toHaveLength(0);
        expect(document.getElementById('heatmap-empty-state')?.textContent).toContain('Restart the server');
    });

});
