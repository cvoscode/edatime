import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../debug.js', () => ({ DEBUG: false }));

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

describe('drift page chart bootstrap', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createCanvasContextMock() as any);

        document.body.innerHTML = `
            <section id="page-drift" data-page-name="drift" hidden>
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

    it('waits for the drift page to become visible before creating charts', async () => {
        const { initDriftPage } = await import('./driftPage.js');

        await initDriftPage({
            numeric_columns: ['value'],
            time_range: { min: 0, max: 1_000 },
        });

        const echarts = await import('echarts');
        const timelineEl = document.getElementById('drift-timeline-chart') as HTMLDivElement;
        const detailEl = document.getElementById('drift-detail-chart') as HTMLDivElement;

        await Promise.resolve();
        expect(echarts.getInstanceByDom(timelineEl)).toBeUndefined();
        expect(echarts.getInstanceByDom(detailEl)).toBeUndefined();

        const page = document.getElementById('page-drift') as HTMLElement;
        page.hidden = false;
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'drift' } }));

        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echarts.getInstanceByDom(timelineEl)).toBeTruthy();
        expect(echarts.getInstanceByDom(detailEl)).toBeTruthy();
    });
});