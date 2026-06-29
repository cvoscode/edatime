import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../debug.js', () => ({ DEBUG: false, dbg: vi.fn() }));
vi.mock('../utils/toast.js', () => ({ toast: vi.fn() }));

class ResizeObserverMock {
    observe() { }
    unobserve() { }
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

describe('drift compute payload', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createCanvasContextMock() as any);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                overview: {
                    driftScore: 84,
                    worstLevel: 'red',
                    columnsFlagged: 1,
                    totalColumns: 1,
                    windowsFlagged: 1,
                    firstChangePoint: '1970-01-01T00:11:00.000Z',
                },
                columns: {
                    value: {
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
                        windows: [],
                        thresholds: {
                            ks_pvalue_threshold: 0.05,
                            es_pvalue_threshold: 0.05,
                            wasserstein_threshold: 0.2,
                            psi_minor_threshold: 0.1,
                            psi_major_threshold: 0.2,
                        },
                        metadata: { computation_time_ms: 12, num_windows: 0, reference_samples: 10 },
                    },
                },
                rankings: {
                    features: [],
                    segments: [],
                    changePoints: [],
                    qualityIssues: [],
                    relationships: [],
                },
                quality: { byColumn: {} },
                relationships: { mode: 'pearson_raw', pairs: [] },
            }),
        }));

        document.body.innerHTML = `
            <section id="page-drift" data-page-name="drift">
              <div class="drift-layout"></div>
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
              <select id="drift-evaluation-mode"><option value="all" selected>All later windows</option><option value="latest">Latest window only</option><option value="latest-n">Latest N windows</option></select>
              <input id="drift-latest-n" type="number" value="3" />
              <select id="drift-segment-by"><option value="" selected>None</option><option value="segment">segment</option></select>
              <input id="drift-ks-threshold" type="number" value="0.05" />
              <input id="drift-es-threshold" type="number" value="0.05" />
              <input id="drift-psi-minor-threshold" type="number" value="0.10" />
              <input id="drift-psi-major-threshold" type="number" value="0.20" />
              <input id="drift-wasserstein-std-multiplier" type="number" value="0.10" />
              <input id="drift-ref-start" type="datetime-local" />
              <input id="drift-ref-end" type="datetime-local" />
              <button id="drift-compute-btn" type="button">Compute</button>
              <button id="drift-zoom-reset-btn" type="button">Reset</button>
              <div id="drift-investigation-tabs">
                <button type="button" data-drift-tab="overview">Overview</button>
                <button type="button" data-drift-tab="timeline">Timeline plots</button>
                <button type="button" data-drift-tab="segments">Segments</button>
                <button type="button" data-drift-tab="quality">Quality</button>
                <button type="button" data-drift-tab="relationships">Relationships</button>
              </div>
              <div id="drift-overview-panel"></div>
              <div id="drift-segments-panel"></div>
              <div id="drift-quality-panel"></div>
              <div id="drift-relationships-panel"></div>
              <div id="drift-summary-strip"></div>
              <div id="drift-column-summary"></div>
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
        const pageEl = document.getElementById('page-drift') as HTMLElement;
        Object.defineProperty(pageEl, 'clientWidth', { configurable: true, value: 800 });
        Object.defineProperty(pageEl, 'clientHeight', { configurable: true, value: 600 });
    });

    it('posts camelCase investigation fields expected by the backend', async () => {
        const { initDriftPage } = await import('./driftPage.js');
        await initDriftPage({
            numeric_columns: ['value'],
            columns: [{ name: 'value', dtype: 'Float64' }, { name: 'segment', dtype: 'String' }],
            time_range: { min: 0, max: 1_000 },
        });

        (document.getElementById('drift-ref-start') as HTMLInputElement).value = '1970-01-01T00:00';
        (document.getElementById('drift-ref-end') as HTMLInputElement).value = '1970-01-01T00:10';

        (document.getElementById('drift-compute-btn') as HTMLButtonElement).click();

        await vi.waitFor(() => {
            expect(fetch).toHaveBeenCalled();
        });

        const request = (fetch as any).mock.calls[0];
        const body = JSON.parse(request[1].body);
        expect(body).toMatchObject({
            window: 'daily',
            columns: ['value'],
            referenceStart: expect.any(String),
            referenceEnd: expect.any(String),
            comparisonStart: expect.any(String),
            includeQuality: true,
            includeChangePoints: true,
            includeCorrelations: true,
        });
        expect(request[0]).toBe('/api/drift/investigate');
        expect(body.column).toBeUndefined();
    });

    it('updates the picker label after bulk-selecting all columns', async () => {
        const { initDriftPage } = await import('./driftPage.js');
        await initDriftPage({
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            time_range: { min: 0, max: 1_000 },
        });

        (document.getElementById('drift-cols-all') as HTMLButtonElement).click();

        expect(document.getElementById('drift-col-picker-label')?.textContent).toBe('3 columns');
        expect(document.querySelectorAll('#drift-col-picker-list input[type="checkbox"]')).toHaveLength(3);
    });

    it('posts optional threshold controls using camelCase backend fields', async () => {
        const { initDriftPage } = await import('./driftPage.js');
        await initDriftPage({
            numeric_columns: ['value'],
            columns: [{ name: 'value', dtype: 'Float64' }, { name: 'segment', dtype: 'String' }],
            time_range: { min: 0, max: 1_000 },
        });

        (document.getElementById('drift-ref-start') as HTMLInputElement).value = '1970-01-01T00:00';
        (document.getElementById('drift-ref-end') as HTMLInputElement).value = '1970-01-01T00:10';
        (document.getElementById('drift-ks-threshold') as HTMLInputElement).value = '0.03';
        (document.getElementById('drift-es-threshold') as HTMLInputElement).value = '0.04';
        (document.getElementById('drift-psi-minor-threshold') as HTMLInputElement).value = '0.11';
        (document.getElementById('drift-psi-major-threshold') as HTMLInputElement).value = '0.22';
        (document.getElementById('drift-wasserstein-std-multiplier') as HTMLInputElement).value = '0.15';

        (document.getElementById('drift-compute-btn') as HTMLButtonElement).click();

        await vi.waitFor(() => {
            expect(fetch).toHaveBeenCalled();
        });

        const request = (fetch as any).mock.calls[0];
        const body = JSON.parse(request[1].body);
        expect(body).toMatchObject({
            ksPvalueThreshold: 0.03,
            esPvalueThreshold: 0.04,
            psiMinorThreshold: 0.11,
            psiMajorThreshold: 0.22,
            wassersteinStdMultiplier: 0.15,
        });
    });

    it('posts optional segmentBy when selected and renders investigation tabs', async () => {
        const { initDriftPage } = await import('./driftPage.js');
        await initDriftPage({
            numeric_columns: ['value'],
            columns: [{ name: 'value', dtype: 'Float64' }, { name: 'segment', dtype: 'String' }],
            time_range: { min: 0, max: 1_000 },
        });

        (document.getElementById('drift-ref-start') as HTMLInputElement).value = '1970-01-01T00:00';
        (document.getElementById('drift-ref-end') as HTMLInputElement).value = '1970-01-01T00:10';
        (document.getElementById('drift-segment-by') as HTMLSelectElement).value = 'segment';

        (document.getElementById('drift-compute-btn') as HTMLButtonElement).click();

        await vi.waitFor(() => {
            expect(fetch).toHaveBeenCalled();
        });

        const request = (fetch as any).mock.calls[0];
        const body = JSON.parse(request[1].body);
        expect(body.segmentBy).toBe('segment');
        expect(document.querySelectorAll('[data-drift-tab]')).toHaveLength(5);
    });
});
