import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartState } from '../../store/chartState.js';
import { getDropdownController } from '../../ui/primitives/Dropdown.js';

function disposeSpectrogramDropdowns(): void {
    for (const id of [
        'spectrogram-col-select',
        'spectrogram-win-size',
        'spectrogram-hop-size',
        'spectrogram-normalize',
        'spectrogram-clip-method',
    ]) {
        getDropdownController(id)?.destroy();
    }
}

// Mock shared dependencies
vi.mock('../../services/api/index.js', () => ({
    fetchSpectrogram: vi.fn().mockResolvedValue({
        result: {
            column: 'test_col',
            times_ms: [1000, 2000, 3000],
            frequencies: [0.0001, 0.0002, 0.0003],
            magnitudes: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
        },
        sample_count: 1000,
    }),
}));

vi.mock('../../utils/chartExport.js', () => ({
    exportEChartsPNG: vi.fn(),
    exportEChartsSVG: vi.fn(),
    exportEChartsHTML: vi.fn(),
}));

vi.mock('../../utils/bindExportButtons.js', () => ({
    bindExportButtons: vi.fn(),
}));

const toastMock = vi.fn();
vi.mock('../../utils/toast.js', () => ({
    toast: (...args: unknown[]) => toastMock(...args),
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

vi.mock('../../platform/pageLifecycle.js', () => ({
    createPageLifecycle: vi.fn(({ init, onVisible }) => {
        return {
            activate: () => {
                init?.();
                onVisible?.();
            },
            dispose: () => {},
        };
    }),
}));

describe('spectrogramPage', () => {
    beforeEach(() => {
        disposeSpectrogramDropdowns();
        toastMock.mockReset();
        document.body.innerHTML = `
            <div id="spectrogram-chart"></div>
            <div id="spectrogram-empty-state"></div>
            <select id="spectrogram-col-select">
              <option value="HUFL" selected>HUFL</option>
            </select>
            <select id="spectrogram-win-size">
              <option value="96" selected>96</option>
              <option value="custom">Custom</option>
            </select>
            <input id="spectrogram-win-size-custom" type="number" value="96" hidden disabled />
            <select id="spectrogram-hop-size">
              <option value="0.5" selected>0.5</option>
              <option value="custom">Custom</option>
            </select>
            <input id="spectrogram-hop-size-custom" type="number" value="48" hidden disabled />
            <input id="spectrogram-log-scale" type="checkbox" checked />
            <button id="spectrogram-zoom-reset-btn">Reset zoom</button>
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
              <option value="none">None</option>
              <option value="minmax">Min-max [0,1]</option>
              <option value="zscore" selected>Z-score</option>
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

    afterEach(async () => {
        const { __resetSpectrogramPageForTests } = await import('./page.js');
        __resetSpectrogramPageForTests();
        disposeSpectrogramDropdowns();
    });

    it('activates its local lifecycle on first lazy-page initialization', async () => {
        const { initSpectrogramPage } = await import('./page.js');
        await initSpectrogramPage({ setLoading: vi.fn() });

        const toggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement;
        const method = document.getElementById('spectrogram-clip-method') as HTMLSelectElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(method.disabled).toBe(false);
    });

    it('replaces the previous runtime before reinitializing the lazy page', async () => {
        const { fetchSpectrogram } = await import('../../services/api/index.js');
        const { initSpectrogramPage } = await import('./page.js');
        chartState.currentStart = Number.NaN;
        chartState.currentEnd = Number.NaN;

        await initSpectrogramPage({ setLoading: vi.fn() });
        await initSpectrogramPage({ setLoading: vi.fn() });
        const fetchMock = vi.mocked(fetchSpectrogram);
        fetchMock.mockClear();
        chartState.currentStart = 0;
        chartState.currentEnd = 1e6;

        (document.getElementById('spectrogram-compute-btn') as HTMLButtonElement).click();
        await Promise.resolve();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('enables clip method and param when the outliers toggle is checked via input', async () => {
        const { initSpectrogramPage } = await import('./page.js');
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
        const { upgradeSelects } = await import('../../ui/primitives/Dropdown.js');
        upgradeSelects(document);

        const { initSpectrogramPage } = await import('./page.js');
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
        disposeSpectrogramDropdowns();
        if (echartsInstances.length > 0 && !firstEchartsInstance) {
            firstEchartsInstance = echartsInstances[0];
        }
        echartsInitMock.mockClear();
        toastMock.mockReset();
        document.body.innerHTML = `
            <section id="page-spectrogram">
              <div id="spectrogram-summary" aria-live="polite" hidden>
                <span id="spectrogram-summary-rate"></span>
                <span id="spectrogram-summary-nyquist"></span>
                <span id="spectrogram-summary-points"></span>
                <span id="spectrogram-summary-bins"></span>
              </div>
              <label><input id="spectrogram-auto-fit-toggle" type="checkbox" checked />Auto-fit</label>
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
                <option value="custom">Custom</option>
              </select>
              <input id="spectrogram-win-size-custom" type="number" value="96" hidden disabled />
              <select id="spectrogram-hop-size">
                <option value="0.5" selected>0.5</option>
                <option value="custom">Custom</option>
              </select>
              <input id="spectrogram-hop-size-custom" type="number" value="48" hidden disabled />
              <input id="spectrogram-log-scale" type="checkbox" checked />
              <button id="spectrogram-zoom-reset-btn">Reset zoom</button>
              <select id="spectrogram-normalize">
                <option value="none">None</option>
                <option value="zscore" selected>Z-score</option>
              </select>
              <input id="spectrogram-clip-toggle" type="checkbox" />
              <select id="spectrogram-clip-method" disabled><option value="percentile" selected>Percentile</option></select>
              <input id="spectrogram-clip-param" type="number" value="0.5" disabled />
              <button id="spectrogram-compute-btn">Compute</button>
            </section>
        `;
        makeChartReady();
    });

    afterEach(async () => {
        const { __resetSpectrogramPageForTests } = await import('./page.js');
        __resetSpectrogramPageForTests();
        disposeSpectrogramDropdowns();
    });

    async function mountAndCompute(): Promise<void> {
        chartState.currentStart = 0;
        chartState.currentEnd = 1e6;
        const { initSpectrogramPage } = await import('./page.js');
        await initSpectrogramPage({ setLoading: vi.fn() });
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
        expect(wrap?.querySelector('.scatter-colorbar-vname')?.textContent).toContain('[0,1]');
    });

    it('releases control listeners when the page runtime unmounts', async () => {
        const { createSpectrogramChartRuntime } = await import('./runtime.js');
        const runtime = createSpectrogramChartRuntime({
            setLoading: vi.fn(),
            workspace: {
                getSnapshot: () => ({
                    dataset: { metadata: null },
                    viewport: { xMin: Number.NaN, xMax: Number.NaN },
                }) as any,
            },
        });
        const unmount = runtime.mount();
        runtime.activate();
        const toggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement;
        const method = document.getElementById('spectrogram-clip-method') as HTMLSelectElement;

        expect(method.disabled).toBe(true);
        unmount();
        toggle.checked = true;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(method.disabled).toBe(true);
    });

    it('renders spectrogram axes with extra padding so titles cannot collide with ticks', async () => {
        await mountAndCompute();
        const instance = echartsInstances[echartsInstances.length - 1];
        const option = instance.setOption.mock.calls.at(-1)?.[0];

        expect(option.grid.left).toBeGreaterThanOrEqual(88);
        expect(option.grid.top).toBeGreaterThanOrEqual(36);
        expect(option.xAxis.nameGap).toBeLessThanOrEqual(52);
        expect(option.yAxis.nameGap).toBeGreaterThanOrEqual(72);
        expect(option.yAxis.name).toBe('Frequency (µHz)');
        expect(option.yAxis.axisLabel.formatter(0.00028)).toBe('280.00 µHz');
        expect(option.xAxis.axisLabel.rotate).toBeLessThanOrEqual(15);
        expect(option.xAxis.axisLabel.formatter(option.xAxis.data[0])).not.toContain('\n');
        expect(option.xAxis.axisLabel.formatter(option.xAxis.data[0])).toMatch(/[/:]/);
    });

    it('renders a spectrogram summary and auto-fits the y-range to the dominant band', async () => {
        await mountAndCompute();

        const instance = echartsInstances[echartsInstances.length - 1];
        const yZoomCalls = instance.dispatchAction.mock.calls.filter(([action]: any[]) =>
            action?.type === 'dataZoom' && action?.dataZoomIndex === 1
        );

        // The summary panel keeps the single-line "Spectrogram of …" text
        // as an aria-label for screen readers and populates the four
        // structured fields (sample rate, Nyquist, time points, freq bins)
        // for sighted users. See plan 2026-07-11-spectrogram-ui-improvements.
        const summary = document.getElementById('spectrogram-summary');
        expect(summary?.getAttribute('aria-label')).toContain('Spectrogram of test_col');
        expect(summary?.getAttribute('aria-label')).toContain('Window 96');
        expect(summary?.getAttribute('aria-label')).toContain('Hop 48');
        expect(summary?.getAttribute('aria-label')).toMatch(/(z-score|min-max|robust|raw)/i);
        // Structured fields must be populated.
        expect(document.getElementById('spectrogram-summary-points')?.textContent).toMatch(/[0-9]/);
        expect(document.getElementById('spectrogram-summary-bins')?.textContent).toMatch(/[0-9]/);
        expect(document.getElementById('spectrogram-summary-rate')?.textContent).not.toBe('—');
        expect(document.getElementById('spectrogram-summary-nyquist')?.textContent).not.toBe('—');
        expect(yZoomCalls.some(([action]: any[]) => action.start > 0 || action.end < 100)).toBe(true);
    });

    it('auto-computes on first load when a default column is already selected', async () => {
        const { fetchSpectrogram } = await import('../../services/api/index.js');
        const beforeCalls = vi.mocked(fetchSpectrogram).mock.calls.length;
        chartState.currentStart = 0;
        chartState.currentEnd = 1e6;

        const { initSpectrogramPage } = await import('./page.js');
        await initSpectrogramPage({ setLoading: vi.fn() });
        for (let i = 0; i < 30; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        expect(vi.mocked(fetchSpectrogram).mock.calls.length).toBe(beforeCalls + 1);
        expect(toastMock).toHaveBeenCalledWith(
            'Loaded HUFL automatically. Pick another column and press Compute to switch.',
            'info',
            expect.anything(),
        );
    });

    it('treats normalize as a staged control and only applies it after Compute', async () => {
        await mountAndCompute();

        const { fetchSpectrogram } = await import('../../services/api/index.js');
        const { setDropdownValue } = await import('../../ui/primitives/Dropdown.js');
        const fetchMock = vi.mocked(fetchSpectrogram);
        const computeButton = document.getElementById('spectrogram-compute-btn') as HTMLButtonElement;
        const instance = echartsInstances[echartsInstances.length - 1];
        const setOptionCallsBefore = instance.setOption.mock.calls.length;
        const fetchCallsBefore = fetchMock.mock.calls.length;

        setDropdownValue('spectrogram-normalize', 'zscore', { emitChange: true });
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore);
        expect(instance.setOption.mock.calls.length).toBe(setOptionCallsBefore);

        computeButton.click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore + 1);
        expect(fetchMock.mock.calls.at(-1)?.[7]).toEqual(expect.objectContaining({ normalize: 'zscore' }));
        expect(instance.setOption.mock.calls.length).toBeGreaterThan(setOptionCallsBefore);
    });

    it('reveals custom window and hop inputs and sends absolute sample values on Compute', async () => {
        const { fetchSpectrogram } = await import('../../services/api/index.js');
        const { setDropdownValue } = await import('../../ui/primitives/Dropdown.js');
        chartState.currentStart = 0;
        chartState.currentEnd = 1e6;

        const { initSpectrogramPage } = await import('./page.js');
        await initSpectrogramPage({ setLoading: vi.fn() });
        for (let i = 0; i < 10; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const fetchMock = vi.mocked(fetchSpectrogram);
        fetchMock.mockClear();

        const winCustom = document.getElementById('spectrogram-win-size-custom') as HTMLInputElement;
        const hopCustom = document.getElementById('spectrogram-hop-size-custom') as HTMLInputElement;
        const computeButton = document.getElementById('spectrogram-compute-btn') as HTMLButtonElement;

        setDropdownValue('spectrogram-win-size', 'custom', { emitChange: true });
        setDropdownValue('spectrogram-hop-size', 'custom', { emitChange: true });

        expect(winCustom.hidden).toBe(false);
        expect(winCustom.disabled).toBe(false);
        expect(hopCustom.hidden).toBe(false);
        expect(hopCustom.disabled).toBe(false);

        winCustom.value = '320';
        hopCustom.value = '48';

        computeButton.click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[3]).toBe(320);
        expect(fetchMock.mock.calls[0]?.[4]).toBe(48);
    });

    it('renders normalized spectrogram values even when log scale remains checked', async () => {
        const { fetchSpectrogram } = await import('../../services/api/index.js');
        const { setDropdownValue } = await import('../../ui/primitives/Dropdown.js');
        chartState.currentStart = 0;
        chartState.currentEnd = 1e6;

        const fetchMock = vi.mocked(fetchSpectrogram);
        const { initSpectrogramPage } = await import('./page.js');
        await initSpectrogramPage({ setLoading: vi.fn() });
        for (let i = 0; i < 20; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        fetchMock.mockClear();
        fetchMock.mockResolvedValueOnce({
            result: {
                column: 'HUFL',
                times_ms: [1000, 2000],
                frequencies: [10, 20],
                magnitudes: [[-1, 0.5], [1.25, -0.25]],
            },
            sample_count: 4,
        });

        setDropdownValue('spectrogram-normalize', 'zscore', { emitChange: true });
        const computeButton = document.getElementById('spectrogram-compute-btn') as HTMLButtonElement;
        computeButton.click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const instance = echartsInstances[echartsInstances.length - 1];
        const option = instance.setOption.mock.calls.at(-1)?.[0];
        expect(option?.series?.[0]?.data).toHaveLength(4);
    });

    it('reuses the cached log-series array when toggling log off and back on', async () => {
        await mountAndCompute();

        const logToggle = document.getElementById('spectrogram-log-scale') as HTMLInputElement;
        const instance = echartsInstances[echartsInstances.length - 1];
        const initialOption = instance.setOption.mock.calls.at(-1)?.[0];
        const firstLogData = initialOption?.series?.[0]?.data;

        logToggle.checked = false;
        logToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        logToggle.checked = true;
        logToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const afterOption = instance.setOption.mock.calls.at(-1)?.[0];
        expect(afterOption?.series?.[0]?.data).toBe(firstLogData);
    });

    it('formats tooltip values from axis indices and compact point payloads', async () => {
        await mountAndCompute();

        const instance = echartsInstances[echartsInstances.length - 1];
        const option = instance.setOption.mock.calls.at(-1)?.[0];
        const formatter = option?.tooltip?.formatter as ((params: { value: number[] }) => string) | undefined;
        const tooltipHtml = formatter?.({ value: [1, 2, 0.5, 7] });

        expect(String(tooltipHtml)).toContain('Frequency: 300.00 µHz');
        expect(String(tooltipHtml)).toContain('Raw magnitude: 7.0000e+0');
    });

    it('dragging the high handle down filters the rendered heatmap points', async () => {
        await mountAndCompute();

        const instance = echartsInstances[echartsInstances.length - 1];
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

    it('reuses the visible data buffer across colorbar drags', async () => {
        await mountAndCompute();

        const instance = echartsInstances[echartsInstances.length - 1];
        const handleHigh = document.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
        (handleHigh as any).setPointerCapture = vi.fn();
        (handleHigh as any).releasePointerCapture = vi.fn();

        handleHigh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0, button: 0, pointerId: 1 }));
        handleHigh.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 100, pointerId: 1 }));
        handleHigh.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 100, pointerId: 1 }));

        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const firstFiltered = instance.setOption.mock.calls.at(-1)?.[0]?.series?.[0]?.data;
        const firstFilteredLength = firstFiltered?.length ?? 0;

        handleHigh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 100, button: 0, pointerId: 2 }));
        handleHigh.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 120, pointerId: 2 }));
        handleHigh.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 120, pointerId: 2 }));

        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const secondFiltered = instance.setOption.mock.calls.at(-1)?.[0]?.series?.[0]?.data;
        expect(firstFilteredLength).toBeGreaterThan(0);
        expect(secondFiltered).toBe(firstFiltered);
    });
});
