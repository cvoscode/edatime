import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shared dependencies
vi.mock('../services/api/index.js', () => ({
    fetchSpectrogram: vi.fn().mockResolvedValue({
        result: {
            column: 'test_col',
            times_ms: [1000, 2000, 3000],
            frequencies: [100, 200, 300],
            magnitudes: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
        },
        sample_count: 1000,
    }),
}));

vi.mock('../utils/chartExport.js', () => ({
    exportEChartsPNG: vi.fn(),
    exportEChartsSVG: vi.fn(),
    exportEChartsHTML: vi.fn(),
}));

vi.mock('../utils/bindExportButtons.js', () => ({
    bindExportButtons: vi.fn(),
}));

class ResizeObserverStub {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}
(globalThis as any).ResizeObserver = ResizeObserverStub;

const echartsInstances: any[] = [];
const echartsInitMock = vi.fn(() => {
    const inst = {
        setOption: vi.fn(),
        resize: vi.fn(),
        dispatchAction: vi.fn(),
        dispose: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    };
    echartsInstances.push(inst);
    return inst;
});
vi.mock('echarts', () => ({
    init: (...args: unknown[]) => echartsInitMock(...(args as Parameters<typeof echartsInitMock>)),
}));

vi.mock('../app/pageLifecycle.js', () => ({
    createPageLifecycle: vi.fn(({ page, init, onVisible, onEveryPageChange }) => {
        try { init?.(); } catch (error) { console.error('init threw:', error); }
        return () => {
            onVisible?.();
            window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page } }));
            onEveryPageChange?.();
        };
    }),
}));

describe('spectrogramPage', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="spectrogram-chart"></div>
            <div id="spectrogram-empty-state"></div>
            <div id="spectrogram-col-select"></div>
            <div id="spectrogram-win-size"></div>
            <div id="spectrogram-hop-size"></div>
            <div id="spectrogram-log-scale"></div>
            <div id="spectrogram-zoom-reset-btn"></div>
            <div class="spectrogram-chart-row">
              <div id="spectrogram-colorbar" class="scatter-colorbar-vertical" hidden>
                <span class="scatter-colorbar-vtick" data-role="cb-high">High</span>
                <div class="cb-range-track" data-role="cb-track">
                  <span class="scatter-colorbar-vbar"></span>
                  <span class="cb-range-fill" data-role="cb-fill" hidden></span>
                  <span class="cb-handle cb-handle--high" data-role="cb-handle-high" tabindex="0" role="slider"></span>
                  <span class="cb-handle cb-handle--low" data-role="cb-handle-low" tabindex="0" role="slider"></span>
                </div>
                <span class="scatter-colorbar-vtick" data-role="cb-low">Low</span>
                <span class="scatter-colorbar-vname">scaled</span>
              </div>
            </div>
            <select id="spectrogram-normalize">
              <option value="none" selected>None</option>
              <option value="minmax">Min-max [0,1]</option>
              <option value="zscore">Z-score</option>
              <option value="robust">Robust [Q1, Q3]</option>
            </select>
            <input id="spectrogram-clip-toggle" type="checkbox" />
            <select id="spectrogram-clip-method" disabled>
              <option value="percentile" selected>Percentile</option>
              <option value="iqr">IQR (k)</option>
            </select>
            <span id="spectrogram-clip-param-label">Clip %</span>
            <input id="spectrogram-clip-param" type="number" value="0.5" disabled />
            <button id="spectrogram-compute-btn">Compute</button>
        `;
    });

    it('initializes without throwing', async () => {
        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({ setLoading: vi.fn() });
    });

    it('enables clip method and param when the outliers toggle is checked via input', async () => {
        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({ setLoading: vi.fn() });

        const toggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement;
        const method = document.getElementById('spectrogram-clip-method') as HTMLSelectElement;
        const param = document.getElementById('spectrogram-clip-param') as HTMLInputElement;

        expect(method.disabled).toBe(true);
        expect(param.disabled).toBe(true);

        toggle.checked = true;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(method.disabled).toBe(false);
        expect(param.disabled).toBe(false);
        expect(method.title).toBe('');
        expect(param.title).toBe('');
    });

    it('enables clip method via change after upgradeSelects replaces the native select', async () => {
        const { upgradeSelects } = await import('../ui/primitives/Dropdown.js');
        upgradeSelects(document);

        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({ setLoading: vi.fn() });

        const toggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement;
        const methodRoot = document.getElementById('spectrogram-clip-method') as HTMLElement;
        const param = document.getElementById('spectrogram-clip-param') as HTMLInputElement;
        const trigger = methodRoot.querySelector<HTMLButtonElement>('button.dropdown__trigger');

        expect(methodRoot.tagName.toLowerCase()).toBe('div');
        expect(trigger?.disabled).toBe(true);
        expect(param.disabled).toBe(true);

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));

        expect(trigger?.disabled).toBe(false);
        expect(param.disabled).toBe(false);
    });
});

describe('spectrogramPage colorbar filter', () => {
    function makeChartReady(): void {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 360 });
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: function () {
                return { top: 0, height: 200, bottom: 200, width: 12, left: 0, right: 12, x: 0, y: 0, toJSON() { return {}; } } as DOMRect;
            },
        });
    }

    let firstEchartsInstance: any = null;

    beforeEach(() => {
        if (echartsInstances.length > 0 && !firstEchartsInstance) {
            firstEchartsInstance = echartsInstances[0];
        }
        echartsInitMock.mockClear();
        document.body.innerHTML = `
            <section id="page-spectrogram">
              <div id="spectrogram-chart"></div>
              <div class="spectrogram-chart-row">
                <div id="spectrogram-colorbar" class="scatter-colorbar-vertical" hidden>
                  <span class="scatter-colorbar-vtick" data-role="cb-high">High</span>
                  <div class="cb-range-track" data-role="cb-track">
                    <span class="scatter-colorbar-vbar"></span>
                    <span class="cb-range-fill" data-role="cb-fill" hidden></span>
                    <span class="cb-handle cb-handle--high" data-role="cb-handle-high" tabindex="0" role="slider"></span>
                    <span class="cb-handle cb-handle--low" data-role="cb-handle-low" tabindex="0" role="slider"></span>
                  </div>
                  <span class="scatter-colorbar-vtick" data-role="cb-low">Low</span>
                  <span class="scatter-colorbar-vname">scaled</span>
                </div>
              </div>
              <div id="spectrogram-empty-state"></div>
              <select id="spectrogram-col-select">
                <option value="HUFL" selected>HUFL</option>
              </select>
              <select id="spectrogram-win-size">
                <option value="96" selected>96</option>
              </select>
              <select id="spectrogram-hop-size">
                <option value="0.5" selected>0.5</option>
              </select>
              <input id="spectrogram-log-scale" type="checkbox" checked />
              <button id="spectrogram-zoom-reset-btn">Reset zoom</button>
              <select id="spectrogram-normalize"><option value="none" selected>None</option></select>
              <input id="spectrogram-clip-toggle" type="checkbox" />
              <select id="spectrogram-clip-method" disabled><option value="percentile" selected>Percentile</option></select>
              <input id="spectrogram-clip-param" type="number" value="0.5" disabled />
              <button id="spectrogram-compute-btn">Compute</button>
            </section>
        `;
        makeChartReady();
    });

    async function mountAndCompute(): Promise<void> {
        const { appState } = await import('../store/appStateCompat.js');
        appState.currentStart = 0;
        appState.currentEnd = 1e6;
        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({ setLoading: vi.fn() });
        document.getElementById('spectrogram-compute-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        for (let i = 0; i < 30; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    it('shows and populates the DOM colorbar after compute', async () => {
        await mountAndCompute();
        const wrap = document.getElementById('spectrogram-colorbar');
        expect(wrap?.hidden).toBe(false);
        expect(wrap?.querySelector('[data-role="cb-high"]')?.textContent).toMatch(/^High/);
        expect(wrap?.querySelector('[data-role="cb-low"]')?.textContent).toMatch(/^Low/);
    });

    it('dragging the high handle down filters the rendered heatmap points', async () => {
        await mountAndCompute();

        const instance = firstEchartsInstance ?? echartsInstances[0];
        const beforeCalls = instance.setOption.mock.calls.length;
        const beforeOption = beforeCalls > 0 ? instance.setOption.mock.calls[beforeCalls - 1][0] : null;
        const beforeData: any[] = beforeOption?.series?.[0]?.data ?? [];
        expect(beforeData.length).toBeGreaterThan(0);

        const handleHigh = document.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
        (handleHigh as any).setPointerCapture = vi.fn();
        (handleHigh as any).releasePointerCapture = vi.fn();

        handleHigh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0, button: 0, pointerId: 1 }));
        handleHigh.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 100, pointerId: 1 }));
        handleHigh.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 100, pointerId: 1 }));

        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const afterCalls = instance.setOption.mock.calls.length;
        const afterOption = afterCalls > 0 ? instance.setOption.mock.calls[afterCalls - 1][0] : null;
        const afterData: any[] = afterOption?.series?.[0]?.data ?? [];

        expect(parseFloat(handleHigh.style.top)).toBeGreaterThan(0);
        expect(afterData.length).toBeLessThan(beforeData.length);
        expect(document.querySelector<HTMLElement>('[data-role="cb-fill"]')?.hidden).toBe(false);
    });
});
