import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../dataClient.js', () => ({
    fetchCausalGraph: vi.fn(),
}));

vi.mock('./causalComparison.js', () => ({
    notifyCausalGraphUpdated: vi.fn(),
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

describe('causal page chart bootstrap', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
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
              <button id="causal-compute-btn" type="button">Compute</button>
              <div id="causal-columns-bar"></div>
              <button id="causal-add-edge-btn" type="button">Add edge</button>
              <button id="causal-export-btn" type="button">Export</button>
              <div id="causal-export-menu" hidden></div>
              <div id="causal-ctx-menu" hidden></div>
              <button id="causal-ctx-edit" type="button">Edit</button>
              <button id="causal-ctx-delete" type="button">Delete</button>
              <button id="causal-edit-close" type="button">Close</button>
              <button id="causal-edit-apply" type="button">Apply</button>
              <button id="causal-edit-delete" type="button">Delete</button>
              <div id="causal-progress" hidden></div>
              <div id="causal-progress-fill"></div>
              <div id="causal-progress-label"></div>
              <div id="causal-chart"></div>
              <div id="causal-empty-state"></div>
              <div id="causal-loading" hidden></div>
              <span id="causal-status"></span>
            </section>
        `;

        const chartEl = document.getElementById('causal-chart') as HTMLDivElement;
        Object.defineProperty(chartEl, 'clientWidth', { configurable: true, value: 640 });
        Object.defineProperty(chartEl, 'clientHeight', { configurable: true, value: 360 });
    });

    it('waits for the causal page to become visible before creating the chart', async () => {
        const { initCausalPage } = await import('./causalPage.js');

        initCausalPage({
            getMetadata: () => ({ numeric_columns: ['a', 'b'] }),
            chipColor: () => '#00d4ff',
            numericColumns: () => ['a', 'b'],
            setLoading: vi.fn(),
        });

        const echarts = await import('echarts');
        const chartEl = document.getElementById('causal-chart') as HTMLDivElement;

        await Promise.resolve();
        expect(echarts.getInstanceByDom(chartEl)).toBeUndefined();

        const page = document.getElementById('page-causal') as HTMLElement;
        page.hidden = false;
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'causal' } }));

        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echarts.getInstanceByDom(chartEl)).toBeTruthy();
    });
});