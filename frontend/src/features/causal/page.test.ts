import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';
import { emitFeatureEvent } from '../../platform/featureEvents.js';
import { emitNavigationChange } from '../../platform/navigationEvents.js';

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
}));

vi.mock('../../services/api/index.js', () => ({
    fetchCausalGraph: vi.fn(),
}));

vi.mock('./causalComparison.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./causalComparison.js')>();
    return {
        ...actual,
        notifyCausalGraphUpdated: vi.fn(),
    };
});

vi.mock('../../utils/toast.js', () => ({
    toast: mocks.toast,
}));

class ResizeObserverMock {
    observe() { }
    disconnect() { }
}

function createCanvasContextMock() {
    return {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        setTransform: vi.fn(),
        setLineDash: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        drawImage: vi.fn(),
        measureText: vi.fn(() => ({ width: 12 })),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
        putImageData: vi.fn(),
    };
}

function causalDeps(metadata: unknown, selectedColumns: string[] = []) {
    return {
        workspace: {
            getSnapshot: () => makeWorkspaceSnapshot({
                dataset: { metadata: metadata as any },
                selection: { columns: selectedColumns },
            }),
        },
        chipColor: () => '#00d4ff',
        setLoading: vi.fn(),
    };
}

describe('causal page chart bootstrap', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mocks.toast.mockReset();
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createCanvasContextMock() as any);

        document.body.innerHTML = `
            <section id="page-causal" data-page-name="causal" hidden>
              <select id="causal-method-select"><option value="pcmci" selected>PCMCI</option></select>
              <select id="causal-test-select"><option value="par_corr" selected>ParCorr</option></select>
              <input id="causal-tau-max" value="3" />
              <input id="causal-alpha" value="0.05" />
              <input id="causal-pc-alpha" value="0.2" />
              <input id="causal-max-conds" value="" />
              <select id="causal-fdr-select"><option value="none" selected>None</option></select>
              <span id="causal-parameters-summary"></span>
              <button id="causal-compute-btn" type="button">Compute</button>
              <span id="causal-compute-reason"></span>
              <div id="causal-columns-bar"></div>
              <button id="causal-add-edge-btn" type="button">Add edge</button>
              <button id="causal-export-btn" type="button">Export</button>
              <button id="causal-save-run-btn" type="button">Save Run</button>
              <div id="causal-export-menu" hidden></div>
              <div id="causal-ctx-menu" hidden></div>
              <button id="causal-ctx-edit" type="button">Edit</button>
              <button id="causal-ctx-delete" type="button">Delete</button>
              <button id="causal-edit-close" type="button">Close</button>
              <button id="causal-edit-apply" type="button">Apply</button>
              <button id="causal-edit-delete" type="button">Delete</button>
              <div id="causal-chart"></div>
              <div id="causal-empty-state"><strong>No causal graph yet</strong><span>Select columns.</span></div>
              <div id="causal-loading" hidden><span id="causal-progress-label">Running causal discovery…</span><button id="causal-cancel-btn" type="button">Cancel discovery</button></div>
              <div id="causal-compare-panel">
                <select id="causal-compare-run-a"></select>
                <select id="causal-compare-run-b"></select>
                <button id="causal-compare-run-btn" type="button">Compare</button>
                <button id="causal-compare-clear-btn" type="button">Clear All</button>
                <div id="causal-saved-runs-list"></div>
                <div id="causal-compare-results"></div>
              </div>
            </section>
        `;

        const chartEl = document.getElementById('causal-chart') as HTMLDivElement;
        Object.defineProperty(chartEl, 'clientWidth', { configurable: true, value: 640 });
        Object.defineProperty(chartEl, 'clientHeight', { configurable: true, value: 360 });
    });

    it('keeps the collapsed parameter summary synchronized and method-aware', async () => {
        const { initCausalPage } = await import('./page.js');
        initCausalPage(causalDeps({
            columns: [{ name: 'a', dtype: 'float64' }, { name: 'b', dtype: 'float64' }],
            numeric_columns: ['a', 'b'],
        }, ['a', 'b']));

        expect(document.getElementById('causal-parameters-summary')?.textContent)
            .toBe('ParCorr · tau 3 · alpha 0.05 · PC alpha 0.2 · max conds auto · no FDR');

        const method = document.getElementById('causal-method-select') as HTMLSelectElement;
        method.innerHTML += '<option value="fullci">FullCI</option>';
        method.value = 'fullci';
        method.dispatchEvent(new Event('change', { bubbles: true }));
        expect(document.getElementById('causal-parameters-summary')?.textContent)
            .toBe('ParCorr · tau 3 · alpha 0.05 · no FDR');
    });

    it('waits for the causal page to become visible before creating the chart', async () => {
        const { initCausalPage } = await import('./page.js');

        initCausalPage(causalDeps({ numeric_columns: ['a', 'b'] }));

        const echarts = await import('echarts');
        const chartEl = document.getElementById('causal-chart') as HTMLDivElement;

        await Promise.resolve();
        expect(echarts.getInstanceByDom(chartEl)).toBeUndefined();

        const page = document.getElementById('page-causal') as HTMLElement;
        page.hidden = false;
        Object.defineProperty(chartEl, 'clientWidth', { configurable: true, value: 0 });
        emitNavigationChange({ page: 'causal' });

        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echarts.getInstanceByDom(chartEl)).toBeUndefined();

        Object.defineProperty(chartEl, 'clientWidth', { configurable: true, value: 640 });
        emitNavigationChange({ page: 'causal' });

        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echarts.getInstanceByDom(chartEl)).toBeTruthy();
    });

    it('shows status text when compute is blocked by too few numeric columns', async () => {
        const { handleComputeClick } = await import('./workflow.js');
        const { resetSelectionState, _selectedColumns } = await import('./selectionState.js');
        resetSelectionState();
        _selectedColumns.add('a');

        await handleComputeClick(
            causalDeps({ numeric_columns: ['a', 'b'], columns: [{ name: 'a', dtype: 'Float64' }, { name: 'b', dtype: 'Float64' }] }),
            document.getElementById('causal-method-select'),
            document.getElementById('causal-tau-max') as HTMLInputElement,
            document.getElementById('causal-alpha') as HTMLInputElement,
            document.getElementById('causal-max-conds') as HTMLInputElement,
            document.getElementById('causal-test-select'),
            document.getElementById('causal-fdr-select'),
        );

        expect(mocks.toast).toHaveBeenCalled();
        const toastArgs = mocks.toast.mock.calls.find((call) =>
            typeof call[0] === 'string' && call[0].includes('Select at least 2 numeric columns')
        );
        expect(toastArgs).toBeDefined();
    });

    it('preselects causal chips from the workspace numeric selection', async () => {
        const { initCausalPage } = await import('./page.js');
        const { resetSelectionState } = await import('./selectionState.js');
        resetSelectionState();

        initCausalPage(causalDeps({
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
        }, ['HULL', 'OT']));

        expect((document.querySelector<HTMLInputElement>('[data-col="HUFL"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('false');
        expect((document.querySelector<HTMLInputElement>('[data-col="HULL"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('true');
        expect((document.querySelector<HTMLInputElement>('[data-col="OT"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('true');
    });

    it('replaces the selected chips when Scatter preselects a causal pair', async () => {
        const { initCausalPage } = await import('./page.js');
        const { resetSelectionState } = await import('./selectionState.js');
        resetSelectionState();

        initCausalPage(causalDeps({
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
        }, ['HUFL']));

        emitFeatureEvent('causal:preselect', { columns: ['HULL', 'OT'] });

        expect((document.querySelector<HTMLInputElement>('[data-col="HUFL"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('false');
        expect((document.querySelector<HTMLInputElement>('[data-col="HULL"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('true');
        expect((document.querySelector<HTMLInputElement>('[data-col="OT"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('true');
    });

    it('unsubscribes causal-pair preselection when the page is disposed', async () => {
        const { disposeCausalPage, initCausalPage } = await import('./page.js');
        const { resetSelectionState } = await import('./selectionState.js');
        resetSelectionState();

        initCausalPage(causalDeps({
            numeric_columns: ['HUFL', 'HULL'],
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
        }, ['HUFL']));
        disposeCausalPage();
        emitFeatureEvent('causal:preselect', { columns: ['HULL'] });

        expect((document.querySelector<HTMLInputElement>('[data-col="HUFL"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('true');
        expect((document.querySelector<HTMLInputElement>('[data-col="HULL"] input[type=checkbox]')?.checked ? 'true' : 'false')).toBe('false');
    });

    it('explains when compute is disabled and offers cancellation during a real request', async () => {
        const { fetchCausalGraph } = await import('../../services/api/index.js');
        const { initCausalPage, disposeCausalPage } = await import('./page.js');
        const { resetSelectionState } = await import('./selectionState.js');
        resetSelectionState();
        const metadata = { numeric_columns: ['a', 'b'], columns: [{ name: 'a', dtype: 'Float64' }, { name: 'b', dtype: 'Float64' }] };
        const deps = causalDeps(metadata, []);
        initCausalPage(deps);
        const compute = document.getElementById('causal-compute-btn') as HTMLButtonElement;
        expect(compute.disabled).toBe(true);
        expect(compute.title).toContain('at least two numeric series');

        const { _selectedColumns } = await import('./selectionState.js');
        _selectedColumns.add('a');
        _selectedColumns.add('b');
        const { renderColumnChips } = await import('./chipPanel.js');
        const { openEditPanel } = await import('./editPanel.js');
        renderColumnChips(deps, document.getElementById('causal-columns-bar') as HTMLElement, openEditPanel);
        expect(compute.disabled).toBe(false);
        vi.mocked(fetchCausalGraph).mockImplementationOnce((...args: any[]) => new Promise((_resolve, reject) =>
            args[5].signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) as any);
        deps.setLoading = vi.fn((btnId: string, overlayId: string, loading: boolean) => {
            (document.getElementById(btnId) as HTMLButtonElement).disabled = loading;
            (document.getElementById(overlayId) as HTMLElement).hidden = !loading;
        });
        // Rebuild to capture the deps object carrying the real loading lifecycle.
        renderColumnChips(deps, document.getElementById('causal-columns-bar') as HTMLElement, openEditPanel);
        compute.click();
        await vi.waitFor(() => expect(document.getElementById('causal-progress-label')?.textContent).toContain('computing on 2 selected series'));
        (document.getElementById('causal-cancel-btn') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(compute.disabled).toBe(false));
        expect(document.getElementById('causal-loading')?.hasAttribute('hidden')).toBe(true);
        expect(mocks.toast.mock.calls.some((call) => String(call[0]).includes('canceled'))).toBe(true);
        disposeCausalPage();
    });

    it('keeps graph-only actions disabled until a causal graph exists', async () => {
        const { initCausalPage } = await import('./page.js');
        const { resetSelectionState } = await import('./selectionState.js');
        resetSelectionState();

        initCausalPage(causalDeps({
            numeric_columns: ['HUFL', 'HULL'],
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
        }));

        expect((document.getElementById('causal-add-edge-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-export-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-save-run-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-add-edge-btn') as HTMLButtonElement).title).toBe('Run discovery first');
        expect((document.getElementById('causal-export-btn') as HTMLButtonElement).title).toBe('Run discovery first');
        expect((document.getElementById('causal-save-run-btn') as HTMLButtonElement).title).toBe('Run discovery first');
        expect((document.getElementById('causal-compare-run-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-compare-clear-btn') as HTMLButtonElement).disabled).toBe(true);
        expect(document.getElementById('causal-saved-runs-list')?.textContent).toContain('Run Compute first');
    });

    it('keeps graph actions disabled and surfaces returned counts when the chart cannot initialize', async () => {
        const { fetchCausalGraph } = await import('../../services/api/index.js');
        const { handleComputeClick } = await import('./workflow.js');
        const { resetSelectionState, _selectedColumns } = await import('./selectionState.js');
        resetSelectionState();
        _selectedColumns.add('HUFL');
        _selectedColumns.add('HULL');
        vi.mocked(fetchCausalGraph).mockResolvedValueOnce({
            columns: ['HUFL', 'HULL'],
            tau_max: 3,
            links: [{ source: 'HUFL', target: 'HULL', lag: 1, type: '-->', value: 0.5, pvalue: 0.01 }],
            graph: [],
            val_matrix: [],
            p_matrix: [],
        });

        // The section is intentionally still hidden, reproducing the
        // zero-size lifecycle path that previously reported success and
        // enabled actions while renderEChartsGraph silently returned.
        await handleComputeClick(
            causalDeps({
                numeric_columns: ['HUFL', 'HULL'],
                columns: [{ name: 'HUFL', dtype: 'Float64' }, { name: 'HULL', dtype: 'Float64' }],
            }),
            document.getElementById('causal-method-select'),
            document.getElementById('causal-tau-max') as HTMLInputElement,
            document.getElementById('causal-alpha') as HTMLInputElement,
            document.getElementById('causal-max-conds') as HTMLInputElement,
            document.getElementById('causal-test-select'),
            document.getElementById('causal-fdr-select'),
        );

        expect((document.getElementById('causal-add-edge-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-export-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-save-run-btn') as HTMLButtonElement).disabled).toBe(true);
        expect(document.getElementById('causal-empty-state')?.textContent).toContain('2 nodes and 1 links');
        expect(mocks.toast).toHaveBeenLastCalledWith(
            expect.stringContaining('graph could not be displayed'),
            'error',
            { duration: 0 },
        );
    });

    it('enables persisted graph actions only after the remounted chart renders', async () => {
        const { initCausalPage } = await import('./page.js');
        const {
            resetSelectionState,
            setCurrentColumns,
            setCurrentLinks,
        } = await import('./selectionState.js');
        resetSelectionState();
        setCurrentColumns(['HUFL', 'HULL']);
        setCurrentLinks([
            { source: 'HUFL', target: 'HULL', lag: 1, type: '-->', value: 0.5, pvalue: 0.01 },
        ]);

        initCausalPage(causalDeps({
            numeric_columns: ['HUFL', 'HULL'],
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
        }));

        expect((document.getElementById('causal-add-edge-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-export-btn') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('causal-save-run-btn') as HTMLButtonElement).disabled).toBe(true);

        (document.getElementById('page-causal') as HTMLElement).hidden = false;
        emitNavigationChange({ page: 'causal' });
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect((document.getElementById('causal-add-edge-btn') as HTMLButtonElement).disabled).toBe(false);
        expect((document.getElementById('causal-export-btn') as HTMLButtonElement).disabled).toBe(false);
        expect((document.getElementById('causal-save-run-btn') as HTMLButtonElement).disabled).toBe(false);
    });

});
