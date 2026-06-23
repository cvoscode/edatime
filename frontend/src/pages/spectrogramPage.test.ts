import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';

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

// happy-dom doesn't ship a ResizeObserver; the runtime constructs one
// when it creates the spectrogram chart. Provide a no-op stub.
class ResizeObserverStub {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}
(globalThis as any).ResizeObserver = ResizeObserverStub;

// ECharts is dynamically imported in the runtime. Expose a stub
// instance factory that records setOption calls so tests can assert
// on the points array the runtime hands to the heatmap series.
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
        // Run init() once at mount so listeners are wired up in tests,
        // matching the real flow where init runs on first page-change.
        try { init?.(); } catch (e) { console.error('init threw:', e); }
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
              <option value="minmax">Min–max [0,1]</option>
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

    it('spectrogram page initializes with createAnalysisPageRuntime', async () => {
        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({
            setLoading: vi.fn(),
        });
    });

    it('enables clip method and param when the outliers toggle is checked (input event)', async () => {
        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({ setLoading: vi.fn() });

        const toggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement;
        const method = document.getElementById('spectrogram-clip-method') as HTMLSelectElement;
        const param = document.getElementById('spectrogram-clip-param') as HTMLInputElement;

        // Initially disabled.
        expect(method.disabled).toBe(true);
        expect(param.disabled).toBe(true);
        expect(method.title).toMatch(/Outliers/);

        // Flip via the input event (label-driven toggles, programmatic flips).
        toggle.checked = true;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(method.disabled).toBe(false);
        expect(param.disabled).toBe(false);
        expect(method.title).toBe('');

        // Flip back to disabled.
        toggle.checked = false;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(method.disabled).toBe(true);
        expect(param.disabled).toBe(true);
    });

    it('enables clip method and param via the change event (parity with previous behavior)', async () => {
        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({ setLoading: vi.fn() });

        const toggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement;
        const method = document.getElementById('spectrogram-clip-method') as HTMLSelectElement;

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));

        expect(method.disabled).toBe(false);
    });

    it('enables clip method even when the select was upgraded to a custom dropdown (regression)', async () => {
        // Simulate the real app flow: upgradeSelects() at app startup
        // replaces <select> with a custom dropdown <div>. The runtime must
        // re-query by id and use setDropdownDisabled to update the live
        // element rather than a detached <select>.
        const { upgradeSelects } = await import('../ui/primitives/Dropdown.js');
        upgradeSelects(document);

        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({ setLoading: vi.fn() });

        const toggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement;
        const method = document.getElementById('spectrogram-clip-method') as HTMLElement;
        const param = document.getElementById('spectrogram-clip-param') as HTMLInputElement;

        // After upgrade, the <select> is replaced with a div.dropdown.
        expect(method.tagName.toLowerCase()).toBe('div');

        // Initial state — disabled, with hint.
        expect(method.classList.contains('is-disabled') || method.querySelector('button[disabled]') !== null || method.hasAttribute('data-disabled')).toBe(true);
        // Use setDropdownDisabled to read state via the trigger.
        const trigger = method.querySelector<HTMLButtonElement>('button.dropdown__trigger');
        expect(trigger?.disabled).toBe(true);
        expect(param.disabled).toBe(true);

        // Flip the toggle.
        toggle.checked = true;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(trigger?.disabled).toBe(false);
        expect(param.disabled).toBe(false);
    });
});

/* ── Colorbar value-range filter ────────────────────────────────────────── */

describe('spectrogramPage colorbar filter', () => {
    // Override clientWidth/Height on the chart container so the runtime
    // considers the spectrogram chart ready and proceeds to init ECharts.
    function makeChartReady(): void {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 360 });
        // Also stub getBoundingClientRect so the drag handler can compute
        // the track height.
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: function () {
                return { top: 0, height: 200, bottom: 200, width: 12, left: 0, right: 12, x: 0, y: 0, toJSON() { return {}; } } as DOMRect;
            },
        });
    }

    let firstEchartsInstance: any = null;
    beforeEach(() => {
        // Don't reset echartsInstances — the runtime caches the chart
        // instance, so on subsequent tests in this describe the same
        // instance is reused (no new echarts.init call). Capture the
        // first instance for assertions.
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
              <div id="spectrogram-win-size"></div>
              <div id="spectrogram-log-scale"></div>
              <div id="spectrogram-zoom-reset-btn"></div>
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
        // Click Compute to populate spectrogramResult and render once.
        document.getElementById('spectrogram-compute-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // The runtime's waitForSpectrogramChartReady runs a setTimeout(0)
        // loop up to 20 times; flush enough ticks for the chart to init
        // and render the heatmap with setOption.
        for (let i = 0; i < 30; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    it('exposes two handles and a range track after init', async () => {
        await mountAndCompute();
        const wrap = document.getElementById('spectrogram-colorbar');
        expect(wrap).toBeTruthy();
        expect(wrap?.querySelector('[data-role="cb-handle-high"]')).toBeTruthy();
        expect(wrap?.querySelector('[data-role="cb-handle-low"]')).toBeTruthy();
        expect(wrap?.querySelector('[data-role="cb-track"]')).toBeTruthy();
        expect(wrap?.querySelector('[data-role="cb-fill"]')).toBeTruthy();
        // No filter active: handles at extremes, fill hidden.
        const handleHigh = wrap?.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
        const handleLow = wrap?.querySelector<HTMLElement>('[data-role="cb-handle-low"]')!;
        const fill = wrap?.querySelector<HTMLElement>('[data-role="cb-fill"]')!;
        expect(handleHigh.style.top).toBe('0%');
        expect(handleLow.style.bottom).toBe('0%');
        expect(fill.hidden).toBe(true);
    });

    it('dragging the high handle down filters the heatmap points', async () => {
        await mountAndCompute();
        // Use the first ECharts instance captured by beforeEach (the
        // runtime caches the chart, so on subsequent tests in this
        // describe the same instance is reused without a new init call).
        const initialInstance = firstEchartsInstance ?? echartsInstances[0];
        const beforeCalls = initialInstance.setOption.mock.calls.length;
        const beforeOption = beforeCalls > 0 ? initialInstance.setOption.mock.calls[beforeCalls - 1][0] : null;
        const beforeData: any[] = beforeOption?.series?.[0]?.data ?? [];
        expect(beforeData.length).toBeGreaterThan(0);

        // Simulate dragging the high handle down by 50% of the track.
        const handleHigh = document.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
        // Stub setPointerCapture / releasePointerCapture on the handle.
        (handleHigh as any).setPointerCapture = vi.fn();
        (handleHigh as any).releasePointerCapture = vi.fn();

        handleHigh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0, button: 0, pointerId: 1 }));
        // Move 100px down (50% of 200px track) — should drop the upper half of values.
        const moveEvent = new PointerEvent('pointermove', { bubbles: true, clientY: 100, pointerId: 1 });
        handleHigh.dispatchEvent(moveEvent);
        const upEvent = new PointerEvent('pointerup', { bubbles: true, clientY: 100, pointerId: 1 });
        handleHigh.dispatchEvent(upEvent);

        // The handle's top style should have moved down from 0% to ~50%.
        const topStyle = handleHigh.style.top;
        expect(parseFloat(topStyle)).toBeGreaterThan(0);

        // After pointerup, the runtime queues another render. Wait a tick.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        // The most recent setOption should now have fewer (or equal) data points.
        const afterCalls = initialInstance.setOption.mock.calls.length;
        const afterOption = afterCalls > 0 ? initialInstance.setOption.mock.calls[afterCalls - 1][0] : null;
        const afterData: any[] = afterOption?.series?.[0]?.data ?? [];
        expect(afterData.length).toBeLessThanOrEqual(beforeData.length);
        expect(afterData.length).toBeLessThan(beforeData.length);

        // The fill should now be visible.
        const fill = document.querySelector<HTMLElement>('[data-role="cb-fill"]')!;
        expect(fill.hidden).toBe(false);
    });

    it('double-click on the colorbar resets the filter', async () => {
        await mountAndCompute();

        // First activate a filter via the high handle.
        const handleHigh = document.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
        (handleHigh as any).setPointerCapture = vi.fn();
        (handleHigh as any).releasePointerCapture = vi.fn();
        handleHigh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0, button: 0, pointerId: 1 }));
        handleHigh.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 100, pointerId: 1 }));
        handleHigh.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 100, pointerId: 1 }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(parseFloat(handleHigh.style.top)).toBeGreaterThan(0);

        // Now dblclick the colorbar wrap.
        const wrap = document.getElementById('spectrogram-colorbar')!;
        wrap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Handles should return to extremes; fill should hide.
        expect(handleHigh.style.top).toBe('0%');
        const handleLow = document.querySelector<HTMLElement>('[data-role="cb-handle-low"]')!;
        expect(handleLow.style.bottom).toBe('0%');
        const fill = document.querySelector<HTMLElement>('[data-role="cb-fill"]')!;
        expect(fill.hidden).toBe(true);
    });

    it('keyboard ArrowDown on the high handle moves it down by ~1%', async () => {
        await mountAndCompute();
        const handleHigh = document.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
        expect(handleHigh.style.top).toBe('0%');

        handleHigh.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const topAfter = parseFloat(handleHigh.style.top);
        expect(topAfter).toBeGreaterThan(0);
        // 1% of the scale moves to ~1% top; allow a small tolerance.
        expect(topAfter).toBeLessThan(5);
    });
});