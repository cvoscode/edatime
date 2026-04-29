import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../debug.js', () => ({ DEBUG: true }));
const chartHandlers = new Map<string, (params: any) => void>();
const chartMock = {
    setOption: vi.fn(),
    clear: vi.fn(),
    resize: vi.fn(),
    on: vi.fn((event: string, handler: (params: any) => void) => {
        chartHandlers.set(event, handler);
    }),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    dispatchAction: vi.fn(),
    getDataURL: vi.fn(() => 'data:image/png;base64,abc'),
};

vi.mock('echarts', () => ({
    init: vi.fn(() => chartMock),
}));

class ResizeObserverMock {
    observe() { }
    unobserve() { }
    disconnect() { }
}

describe('drift page accessibility and debug metadata', () => {
    beforeEach(() => {
        chartHandlers.clear();
        chartMock.setOption.mockClear();
        chartMock.clear.mockClear();
        chartMock.resize.mockClear();
        chartMock.on.mockClear();
        chartMock.showLoading.mockClear();
        chartMock.hideLoading.mockClear();
        chartMock.dispatchAction.mockClear();
        chartMock.getDataURL.mockClear();

        (globalThis as any).ResizeObserver = ResizeObserverMock;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
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
        }) as any);
        document.body.innerHTML = `
            <section id="page-drift" data-page-name="drift">
              <div class="drift-layout"></div>
              <!-- column picker -->
              <div id="drift-col-picker-wrap" class="drift-col-picker">
                <button id="drift-col-picker-btn" type="button" aria-haspopup="true" aria-expanded="false"></button>
                <span id="drift-col-picker-label"></span>
                <div id="drift-col-picker-panel" hidden>
                  <button id="drift-cols-all" type="button">All</button>
                  <button id="drift-cols-single" type="button">Single</button>
                  <button id="drift-cols-none" type="button">None</button>
                  <div id="drift-col-picker-list"></div>
                </div>
              </div>
              <select id="drift-col-select" multiple style="display:none;"></select>
              <select id="drift-window-select"><option value="daily" selected>Daily</option></select>
              <select id="drift-plot-type"><option value="box" selected>Box</option></select>
              <select id="drift-ref-preset"><option value="50" selected>50</option></select>
              <input id="drift-ref-start" type="datetime-local" />
              <input id="drift-ref-end" type="datetime-local" />
              <button id="drift-compute-btn" type="button">Compute</button>
              <button id="drift-zoom-reset-btn" type="button">Reset</button>
              <span id="drift-status"></span>
              <div id="drift-timeline-chart"></div>
              <div id="drift-detail-chart"></div>
              <select id="drift-detail-col-select"></select>
              <div id="drift-loading" hidden></div>
              <div id="drift-empty"></div>
              <div id="drift-detail-header"></div>
              <div id="drift-detail-stats"></div>
              <div id="drift-window-list"></div>
              <select id="drift-sort-select"><option value="time-asc" selected>time-asc</option></select>
              <button id="drift-export-png" type="button" disabled></button>
              <button id="drift-export-detail-png" type="button" disabled></button>
              <button id="drift-export-csv" type="button" disabled></button>
              <button id="drift-export-json" type="button" disabled></button>
            </section>
        `;

        const timelineEl = document.getElementById('drift-timeline-chart') as HTMLDivElement;
        Object.defineProperty(timelineEl, 'clientWidth', { configurable: true, value: 700 });
        Object.defineProperty(timelineEl, 'clientHeight', { configurable: true, value: 320 });
        const detailEl = document.getElementById('drift-detail-chart') as HTMLDivElement;
        Object.defineProperty(detailEl, 'clientWidth', { configurable: true, value: 320 });
        Object.defineProperty(detailEl, 'clientHeight', { configurable: true, value: 220 });
    });

    it('renders keyboard-selectable drift window rows with option semantics', async () => {
        vi.resetModules();
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                column: 'value',
                reference: {
                    start_ms: 0,
                    end_ms: 10,
                    label: 'ref',
                    count: 10,
                    null_count: 0,
                    completeness: 1,
                    mean: 1,
                    std: 0.2,
                    min: 0,
                    max: 2,
                    quantiles: [0.2, 0.7, 1.0, 1.3, 1.8],
                    hist_bins: [0, 1, 2],
                    hist_counts: [3, 7],
                    ecdf_x: [0, 1, 2],
                    ecdf_y: [0.2, 0.6, 1],
                },
                windows: [
                    {
                        start_ms: 11,
                        end_ms: 20,
                        label: 'w1',
                        count: 8,
                        null_count: 0,
                        completeness: 1,
                        mean: 1.2,
                        std: 0.2,
                        min: 0.5,
                        max: 2.1,
                        quantiles: [0.5, 0.9, 1.2, 1.4, 1.9],
                        hist_bins: [0, 1, 2],
                        hist_counts: [2, 6],
                        ecdf_x: [0.5, 1.2, 2.1],
                        ecdf_y: [0.2, 0.7, 1],
                        ks_stat: 0.1,
                        ks_pvalue: 0.8,
                        es_stat: 0.12,
                        es_pvalue: 0.7,
                        wasserstein: 0.2,
                        psi: 0.12,
                        drift_level: 'yellow',
                        low_sample_warning: false,
                    },
                    {
                        start_ms: 21,
                        end_ms: 30,
                        label: 'w2',
                        count: 9,
                        null_count: 0,
                        completeness: 1,
                        mean: 1.6,
                        std: 0.3,
                        min: 0.8,
                        max: 2.4,
                        quantiles: [0.8, 1.2, 1.6, 1.9, 2.3],
                        hist_bins: [0, 1, 2],
                        hist_counts: [1, 8],
                        ecdf_x: [0.8, 1.6, 2.4],
                        ecdf_y: [0.2, 0.75, 1],
                        ks_stat: 0.2,
                        ks_pvalue: 0.5,
                        es_stat: 0.19,
                        es_pvalue: 0.4,
                        wasserstein: 0.3,
                        psi: 0.26,
                        drift_level: 'red',
                        low_sample_warning: false,
                    },
                ],
                thresholds: {
                    ks_threshold: 0.1,
                    wasserstein_threshold: 0.2,
                    psi_minor_threshold: 0.1,
                    psi_major_threshold: 0.25,
                },
                metadata: {
                    computation_time_ms: 12,
                    num_windows: 2,
                    reference_samples: 10,
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { initDriftPage } = await import('./driftPage.js');
        await initDriftPage({
            numeric_columns: ['value'],
            time_range: { min: 0, max: 1_000 },
        });

        // The picker auto-selects the first column; set reference dates so compute runs.
        (document.getElementById('drift-ref-start') as HTMLInputElement).value = '1970-01-01T00:00';
        (document.getElementById('drift-ref-end') as HTMLInputElement).value = '1970-01-01T00:10';

        (document.getElementById('drift-compute-btn') as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const items = Array.from(document.querySelectorAll<HTMLElement>('#drift-window-list .drift-window-item'));
        expect(items.length).toBe(2);
        expect(items[0].getAttribute('role')).toBe('option');
        expect(items[0].getAttribute('tabindex')).toBe('0');
        expect(items[0].getAttribute('aria-selected')).toBe('true');

        items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const rerenderedItems = Array.from(document.querySelectorAll<HTMLElement>('#drift-window-list .drift-window-item'));
        expect(rerenderedItems[1].getAttribute('aria-selected')).toBe('true');
        expect(debugSpy).toHaveBeenCalled();
    });
});
