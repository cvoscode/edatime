import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
            <input id="heatmap-cell-size" type="range" min="24" max="72" step="4" value="36">
            <span id="heatmap-cell-size-value" class="range-value">36</span>
            <input id="heatmap-cluster-toggle" type="checkbox" checked>
            <button id="heatmap-fit-toggle" type="button" class="btn btn-ghost btn-sm toolbar-toggle-btn" aria-pressed="false">Snap to panel</button>
            <button id="heatmap-axis-fit-toggle" type="button" class="btn btn-ghost btn-sm toolbar-toggle-btn" aria-pressed="false">Fit color axis</button>
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
        delete (globalThis as any).ResizeObserver;
        vi.restoreAllMocks();
    });

    it('initializes and renders a 6x6 grid', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();
        const cells = document.querySelectorAll('.heatmap-cell');
        expect(cells.length).toBe(36);
    });

    it('renders the compact seaborn-style heatmap frame and color scale', async () => {
        const { initHeatmapPage } = await import('./page.js');
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
        expect(headers.every((header) => header.classList.contains('heatmap-header--vertical'))).toBe(false);
        // Cells now carry `background` directly (inline) instead of
        // `--heatmap-cell-bg`. The audit dropped the dead CSS variable,
        // so we verify the inline background renders a colour.
        expect(strongPositiveCell?.style.background).toBeTruthy();
        expect(negativeCell?.style.background).toBeTruthy();
        // C3: cells carry a sign prefix (`+` / `−` / `±`) so colour is
        // not the only signal for direction.
        expect(strongPositiveCell?.textContent).toMatch(/^[+±−]/);
    });

    it('fits the color axis to the strongest off-diagonal magnitude when requested', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const fitColorAxisToggle = document.getElementById('heatmap-axis-fit-toggle') as HTMLButtonElement;
        fitColorAxisToggle.click();

        const positiveTick = document.querySelector('.heatmap-scale__tick--positive');
        const negativeTick = document.querySelector('.heatmap-scale__tick--negative');
        expect(positiveTick?.textContent).toBe('+0.95');
        expect(negativeTick?.textContent).toBe('-0.95');
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

    it('navigates to scatter with original column names on click', async () => {
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

        const xCol = document.getElementById('scatter-x-col') as HTMLSelectElement;
        const yCol = document.getElementById('scatter-y-col') as HTMLSelectElement;
        expect(xCol.value).toBe('a1');
        expect(yCol.value).toBe('b1');
        expect(showPage).toHaveBeenCalledWith('scatter');
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
        expect(cell?.textContent).toBe('−0.33');
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
        const { fetchCorrelationMatrix } = await import('../../services/api/index.js');
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

        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        let cell = document.querySelector('.heatmap-cell[data-row="0"][data-col="1"]') as HTMLElement | null;
        // C3: positive cells now carry an explicit `+` prefix.
        expect(cell?.textContent).toBe('+0.40');

        const metric = document.getElementById('heatmap-metric') as HTMLSelectElement;
        metric.value = 'kendall_diff';
        metric.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.querySelectorAll('.heatmap-cell')).toHaveLength(0);
        expect(document.getElementById('heatmap-empty-state')?.textContent).toContain('Restart the server');
    });

    it('fills the available shell width so cells do not squish against the left edge', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const shell = document.querySelector('.heatmap-shell') as HTMLElement | null;
        const grid = document.querySelector('.heatmap-grid') as HTMLElement | null;
        expect(shell).not.toBeNull();
        expect(grid).not.toBeNull();
        // The grid must be sized to fill the shell instead of sitting at
        // its natural inline-grid width, which previously pinned the
        // correlation matrix to size × fixed-cell-size and ignored the
        // available container width.
        expect(grid!.style.display).toBe('grid');
        expect(grid!.style.width).toBe('100%');
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

    // C1 — corner carries X / Y axis glyph + active metric.
    it('renders axis hints + active metric badge in the heatmap corner', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const corner = document.querySelector('.heatmap-corner');
        expect(corner).not.toBeNull();
        expect(corner?.querySelector('.heatmap-corner__axis--x')?.textContent).toBe('X');
        expect(corner?.querySelector('.heatmap-corner__axis--y')?.textContent).toBe('Y');
        // Active metric is "Pearson (raw)" (mocked default).
        expect(corner?.querySelector('.heatmap-corner__metric')?.textContent).toMatch(/Pearson/);
    });

    // C1 — cluster legend chips appear when clustering finds groups.
    it('renders a cluster legend strip with one chip per detected cluster', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const chips = document.querySelectorAll('.heatmap-cluster-legend__chip');
        expect(chips.length).toBeGreaterThan(0);
    });

    // C1 — footer is visible after a successful render.
    it('renders a status footer with the active metric + size + click hint', async () => {
        const { initHeatmapPage } = await import('./page.js');
        await initHeatmapPage({ showPage: vi.fn() });
        await activateHeatmap();

        const footer = document.querySelector('.heatmap-footer');
        expect(footer).not.toBeNull();
        expect(footer?.textContent).toMatch(/6×6 matrix/);
        expect(footer?.textContent).toMatch(/Click any cell/);
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

    // C7 — Display segment is wired into initToolbarOverflow (segment exists with overflow popout).
    it('does not crash when the heatmap page loads without an overflow popout', async () => {
        // Strip the toolbar so initToolbarOverflow has nothing to register;
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
