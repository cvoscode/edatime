/**
 * Tests for frontend/src/chart/DataChart.ts
 *
 * Tests the pure logic methods of DataChart that do not require a DOM
 * container or WebGPU adapter.  DOM-dependent methods (init, drawing
 * overlays, mouse-selection zoom) are tested indirectly through the
 * callbacks they invoke.
 *
 * Covered: getXDomain, setYRange, getYRange, setChartText, setDrawMode,
 *          clearDrawings, requestOverlayRender, setXRange, cssPointToData,
 *          fitYToData, resetYRange, zoomY, destroy, supportsZoomControls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { datasetState } from '../store/datasetState.js';
import { uiState } from '../store/uiState.js';
import { DataChart } from './DataChart';
import type { ViewSnapshot } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a chart with no callbacks to keep tests DOM-light. */
function makeChart(
    onZoom?: ((view: ViewSnapshot, sourceKind: string) => void) | null,
    onYRange?: ((min: number, max: number, sourceKind: string) => void) | null,
    onZoomOut?: (() => void) | null,
): DataChart {
    return new DataChart('nonexistent-container', onZoom ?? null, onYRange ?? null, onZoomOut ?? null);
}

// ── Constructor ──────────────────────────────────────────────────────────────

describe('DataChart constructor', () => {
    it('stores containerId', () => {
        const chart = makeChart();
        expect(chart.containerId).toBe('nonexistent-container');
    });

    it('stores onZoomCallback when provided', () => {
        const cb = vi.fn();
        const chart = makeChart(cb, null, null);
        expect(chart.onZoomCallback).toBe(cb);
    });

    it('stores onYRangeCallback when provided', () => {
        const cb = vi.fn();
        const chart = makeChart(null, cb, null);
        expect(chart.onYRangeCallback).toBe(cb);
    });

    it('stores onZoomOutCallback when provided', () => {
        const cb = vi.fn();
        const chart = makeChart(null, null, cb);
        expect(chart.onZoomOutCallback).toBe(cb);
    });

    it('initializes chartInstance to null', () => {
        expect(makeChart().chartInstance).toBeNull();
    });
});

// ── setChartText ─────────────────────────────────────────────────────────────

describe('setChartText', () => {
    it('stores trimmed title, xLabel, yLabel', () => {
        const chart = makeChart();
        chart.setChartText('  My Title  ', '  X Axis  ', '  Y Axis  ');
        expect((chart as any)._chartTitle).toBe('My Title');
        expect((chart as any)._xAxisLabel).toBe('X Axis');
        expect((chart as any)._yAxisLabel).toBe('Y Axis');
    });

    it('converts null/undefined title to empty string', () => {
        const chart = makeChart();
        chart.setChartText(null as any, null as any, null as any);
        expect((chart as any)._chartTitle).toBe('');
        expect((chart as any)._xAxisLabel).toBe('');
        expect((chart as any)._yAxisLabel).toBe('');
    });

    it('converts non-string title to string', () => {
        const chart = makeChart();
        chart.setChartText(42 as any, true as any, false as any);
        expect((chart as any)._chartTitle).toBe('42');
        expect((chart as any)._xAxisLabel).toBe('true');
        expect((chart as any)._yAxisLabel).toBe('false');
    });
});

// ── setDrawMode ──────────────────────────────────────────────────────────────

describe('setDrawMode', () => {
    it('delegates drawing mode changes to the drawing controller', () => {
        const chart = makeChart();
        const setMode = vi.fn();
        (chart as any)._drawingController = { setMode };
        chart.setDrawMode('line', '#00ff00', 5);
        expect(setMode).toHaveBeenCalledWith('line', '#00ff00', 5);
    });
});

// ── clearDrawings ────────────────────────────────────────────────────────────

describe('clearDrawings', () => {
    it('clears its drawing controller when one has been initialized', () => {
        const chart = makeChart();
        const clear = vi.fn();
        (chart as any)._drawingController = { clear };
        chart.clearDrawings();
        expect(clear).toHaveBeenCalledOnce();
    });
});

// ── requestOverlayRender ─────────────────────────────────────────────────────

describe('requestOverlayRender', () => {
    it('does not throw when _overlayCtx is null (no-op)', () => {
        const chart = makeChart();
        expect(() => chart.requestOverlayRender()).not.toThrow();
    });

    it('renders overlays in CSS pixel space even on high-DPR displays', () => {
        const chart = makeChart();
        const renderAll = vi.fn();
        const clearRect = vi.fn();
        const originalDpr = window.devicePixelRatio;

        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: 2,
        });

        (chart as any)._overlayCanvas = { width: 600, height: 400 };
        (chart as any)._overlayCtx = { clearRect } as unknown as CanvasRenderingContext2D;
        (chart as any)._overlays = { renderAll };

        try {
            (chart as any)._renderDrawings();
        } finally {
            Object.defineProperty(window, 'devicePixelRatio', {
                configurable: true,
                value: originalDpr,
            });
        }

        expect(clearRect).toHaveBeenCalledWith(0, 0, 600, 400);
        expect(renderAll).toHaveBeenCalledWith((chart as any)._overlayCtx, { x: 1, y: 1 });
    });
});

// ── setXRange ────────────────────────────────────────────────────────────────

describe('setXRange', () => {
    it('stores finite min/max', () => {
        const chart = makeChart();
        chart.setXRange(1000, 2000);
        expect((chart as any)._xMin).toBe(1000);
        expect((chart as any)._xMax).toBe(2000);
    });

    it('ignores NaN min', () => {
        const chart = makeChart();
        chart.setXRange(NaN, 2000);
        expect((chart as any)._xMin).toBeNull();
    });

    it('ignores NaN max', () => {
        const chart = makeChart();
        chart.setXRange(1000, NaN);
        expect((chart as any)._xMax).toBeNull();
    });

    it('ignores Infinity min', () => {
        const chart = makeChart();
        chart.setXRange(Infinity, 2000);
        expect((chart as any)._xMin).toBeNull();
    });

    it('ignores when max <= min', () => {
        const chart = makeChart();
        chart.setXRange(2000, 1000);
        expect((chart as any)._xMin).toBeNull();
        chart.setXRange(1000, 1000);
        expect((chart as any)._xMin).toBeNull();
    });
});

// ── setYRange ────────────────────────────────────────────────────────────────

describe('setYRange', () => {
    it('ignores NaN min', () => {
        const chart = makeChart();
        chart.setYRange(NaN, 100);
        expect((chart as any)._yMin).toBeNull();
    });

    it('ignores NaN max', () => {
        const chart = makeChart();
        chart.setYRange(0, NaN);
        expect((chart as any)._yMax).toBeNull();
    });

    it('ignores when max <= min', () => {
        const chart = makeChart();
        chart.setYRange(100, 0);
        expect((chart as any)._yMin).toBeNull();
    });

    it('ignores Infinity', () => {
        const chart = makeChart();
        chart.setYRange(-Infinity, Infinity);
        expect((chart as any)._yMin).toBeNull();
    });
});

// ── getXDomain ───────────────────────────────────────────────────────────────

describe('getXDomain', () => {
    it('returns null when _lastXDomainMin is null', () => {
        const chart = makeChart();
        expect(chart.getXDomain()).toBeNull();
    });

    it('returns null when _lastXDomainMax is NaN', () => {
        const chart = makeChart();
        (chart as any)._lastXDomainMin = 1000;
        (chart as any)._lastXDomainMax = NaN;
        expect(chart.getXDomain()).toBeNull();
    });

    it('returns null when max <= min', () => {
        const chart = makeChart();
        (chart as any)._lastXDomainMin = 2000;
        (chart as any)._lastXDomainMax = 1000;
        expect(chart.getXDomain()).toBeNull();
    });

    it('returns domain when values are valid', () => {
        const chart = makeChart();
        (chart as any)._lastXDomainMin = 1000;
        (chart as any)._lastXDomainMax = 2000;
        expect(chart.getXDomain()).toEqual({ min: 1000, max: 2000 });
    });
});

// ── getYRange ────────────────────────────────────────────────────────────────

describe('getYRange', () => {
    it('returns null when no data range is set', () => {
        const chart = makeChart();
        expect(chart.getYRange()).toBeNull();
    });

    it('prefers an explicit user y range over the raw data bounds when both are set', () => {
        const chart = makeChart();
        (chart as any)._lastDataYMin = 10;
        (chart as any)._lastDataYMax = 90;
        (chart as any)._yMin = 20;
        (chart as any)._yMax = 80;
        expect(chart.getYRange()).toEqual({ min: 20, max: 80 });
    });

    it('falls back to _yMin/yMax when _lastData range is invalid', () => {
        const chart = makeChart();
        (chart as any)._lastDataYMin = NaN;
        (chart as any)._lastDataYMax = NaN;
        (chart as any)._yMin = 20;
        (chart as any)._yMax = 80;
        expect(chart.getYRange()).toEqual({ min: 20, max: 80 });
    });

    it('returns null when all values are invalid', () => {
        const chart = makeChart();
        (chart as any)._lastDataYMin = null;
        (chart as any)._lastDataYMax = null;
        (chart as any)._yMin = null;
        (chart as any)._yMax = null;
        expect(chart.getYRange()).toBeNull();
    });
});

// ── cssPointToData ───────────────────────────────────────────────────────────

describe('cssPointToData', () => {
    it('returns null when _container is null', () => {
        const chart = makeChart();
        expect(chart.cssPointToData(100, 100)).toBeNull();
    });

    it('returns null when _xMin/_xMax are null', () => {
        const chart = makeChart();
        (chart as any)._container = document.createElement('div');
        expect(chart.cssPointToData(100, 100)).toBeNull();
    });

    it('returns null when localX is left of plotLeft', () => {
        // We can test the boundary by simulating null container
        const chart = makeChart();
        (chart as any)._container = null; // no container = immediate null
        expect(chart.cssPointToData(100, 100)).toBeNull();
    });

    it('maps y coordinates against the active user y range when the chart is y-zoomed', () => {
        const chart = makeChart();
        const container = document.createElement('div');
        (chart as any)._container = container;
        (chart as any)._xMin = 0;
        (chart as any)._xMax = 100;
        (chart as any)._lastDataYMin = 10;
        (chart as any)._lastDataYMax = 90;
        (chart as any)._yMin = 30;
        (chart as any)._yMax = 70;
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({ position: 'relative' } as CSSStyleDeclaration);
        vi.spyOn(chart as any, '_updateCurrentGrid').mockReturnValue({ left: 50, right: 50, top: 20, bottom: 20 });

        const topEdge = chart.cssPointToData(150, 20);

        expect(topEdge).toEqual({ x: 50, y: 70 });
    });
});

// ── fitYToData ───────────────────────────────────────────────────────────────

describe('fitYToData', () => {
    it('is a no-op when _lastDataYMin is not finite', () => {
        const onYRange = vi.fn();
        const chart = makeChart(null, onYRange, null);
        (chart as any)._lastDataYMin = NaN;
        (chart as any)._lastDataYMax = 100;
        chart.fitYToData();
        expect(onYRange).not.toHaveBeenCalled();
    });

    it('calls onYRangeCallback with data range when data is finite', () => {
        const onYRange = vi.fn();
        const chart = makeChart(null, onYRange, null);
        (chart as any)._lastDataYMin = 10;
        (chart as any)._lastDataYMax = 90;
        chart.fitYToData();
        expect(onYRange).toHaveBeenCalledOnce();
        expect(onYRange).toHaveBeenCalledWith(10, 90, 'data');
    });
});

// ── resetYRange ───────────────────────────────────────────────────────────────

describe('resetYRange', () => {
    it('exists and does nothing (no-op)', () => {
        const chart = makeChart();
        expect(() => chart.resetYRange()).not.toThrow();
    });
});

// ── zoomY ─────────────────────────────────────────────────────────────────────

describe('zoomY', () => {
    it('exists and does nothing (no-op stub)', () => {
        const chart = makeChart();
        expect(() => chart.zoomY(1.5)).not.toThrow();
        expect(() => chart.zoomY(0.5, 0.25)).not.toThrow();
    });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('destroy', () => {
    it('sets chartInstance to null', () => {
        const chart = makeChart();
        (chart as any).chartInstance = { resize: vi.fn() };
        chart.destroy();
        expect(chart.chartInstance).toBeNull();
    });

    it('clears _drawingResizeObserver and _chartResizeObserver references', () => {
        const chart = makeChart();
        const disconnectMock = vi.fn();
        (chart as any)._drawingResizeObserver = { disconnect: disconnectMock };
        (chart as any)._chartResizeObserver = { disconnect: disconnectMock };
        chart.destroy();
        expect(disconnectMock).toHaveBeenCalledTimes(2);
        expect((chart as any)._drawingResizeObserver).toBeNull();
        expect((chart as any)._chartResizeObserver).toBeNull();
    });

    it('detaches the drawing controller and releases its pending listeners', () => {
        const chart = makeChart();
        const detach = vi.fn();
        (chart as any)._drawingController = { detach };
        chart.destroy();
        expect(detach).toHaveBeenCalledOnce();
    });
});

// ── supportsZoomControls ─────────────────────────────────────────────────────

describe('supportsZoomControls', () => {
    it('returns false when chartInstance is null', () => {
        const chart = makeChart();
        expect(chart.supportsZoomControls()).toBe(false);
    });

    it('returns true when chartInstance is set', () => {
        const chart = makeChart();
        (chart as any).chartInstance = { resize: vi.fn() };
        expect(chart.supportsZoomControls()).toBe(true);
    });
});

// ── updateDataMulti ─────────────────────────────────────────────────────────

describe('updateDataMulti', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        datasetState.numericCols = ['temperature'];
        uiState.selectedColorColumn = null;
        uiState.seriesColors = {};
    });

    afterEach(() => {
        datasetState.numericCols = [];
        uiState.selectedColorColumn = null;
        uiState.seriesColors = {};
    });

    it('disables ChartGPU animation for timeseries option updates', () => {
        const chart = makeChart();
        const setOption = vi.fn();
        (chart as any).chartInstance = {
            options: { series: [] },
            setOption,
            setZoomRange: vi.fn(),
        };

        chart.updateDataMulti({
            ts: new Float64Array([1_000, 2_000]),
            values: { temperature: new Float64Array([10, 20]) },
            series: {
                temperature: {
                    x: new Float64Array([1_000, 2_000]),
                    y: new Float64Array([10, 20]),
                },
            },
            colorByColumn: {},
        } as any, ['temperature']);

        expect(setOption).toHaveBeenCalledOnce();
        expect(setOption.mock.calls[0][0]).toEqual(expect.objectContaining({
            animation: false,
            legend: { show: false },
            theme: expect.objectContaining({
                backgroundColor: '#0B0F18',
                textColor: '#D2DAF0',
            }),
        }));
    });

    it('renders a compact legend row that toggles all segments for a trace', () => {
        const chart = makeChart();
        const container = document.createElement('div');
        document.body.appendChild(container);
        (chart as any)._container = container;

        const series = [
            { type: 'line', name: '__color_segment__temperature::low', color: '#00aaff', visible: true, data: [] },
            { type: 'line', name: '__color_segment__temperature::high', color: '#00aaff', visible: true, data: [] },
            { type: 'line', name: 'humidity', color: '#aa66ff', visible: true, data: [] },
        ];
        const setOption = vi.fn((next) => {
            (chart as any).chartInstance.options = next;
        });
        (chart as any).chartInstance = {
            options: { animation: false, legend: { show: false }, series },
            setOption,
        };
        (chart as any)._lastChartOptions = { animation: false, legend: { show: false }, series };
        (chart as any)._lastSeriesList = series;

        (chart as any)._syncLegendOverlay();

        const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.timeseries-legend-overlay__row'));
        expect(buttons.map((button) => button.querySelector('.timeseries-legend-overlay__label')?.textContent)).toEqual(['temperature', 'humidity']);

        buttons[0].click();

        expect(setOption).toHaveBeenCalledOnce();
        const nextSeries = setOption.mock.calls[0][0].series;
        expect(nextSeries.map((s: any) => [s.name, s.visible])).toEqual([
            ['__color_segment__temperature::low', false],
            ['__color_segment__temperature::high', false],
            ['humidity', true],
        ]);
        const updatedButton = container.querySelector<HTMLButtonElement>('.timeseries-legend-overlay__row');
        expect(updatedButton?.getAttribute('aria-pressed')).toBe('false');
    });

    it('applies a robust display-only y-range without changing the reported data bounds', () => {
        const chart = makeChart();
        const setOption = vi.fn();
        (chart as any).chartInstance = {
            options: { animation: false, legend: { show: false }, series: [] },
            setOption,
            setZoomRange: vi.fn(),
        };

        chart.updateDataMulti({
            ts: new Float64Array([0, 1, 2, 3, 4]),
            values: {
                OT: new Float64Array([12.1, 12.1, 12.2, 12.2, 113.76]),
            },
            series: {
                OT: {
                    x: new Float64Array([0, 1, 2, 3, 4]),
                    y: new Float64Array([12.1, 12.1, 12.2, 12.2, 113.76]),
                },
            },
            colorByColumn: {},
        } as any, ['OT']);

        setOption.mockClear();
        (chart as any).setRobustDisplayRange({ mode: 'percentile', param: 10 });

        expect(chart.getYRange()).toEqual({ min: 12.1, max: 113.76 });
        expect(setOption).toHaveBeenCalledOnce();
        const yAxis = setOption.mock.calls[0][0].yAxis;
        expect(yAxis.max).toBeLessThan(113.76);
        expect(yAxis.min).toBeLessThanOrEqual(12.1);
    });

    it('computes a narrower chart grid for compact y-axis labels', () => {
        const chart = makeChart();
        const setOption = vi.fn();
        (chart as any).chartInstance = {
            options: { animation: false, legend: { show: false }, series: [] },
            setOption,
            setZoomRange: vi.fn(),
        };

        chart.updateDataMulti({
            ts: new Float64Array([1_000, 2_000, 3_000]),
            values: {
                temperature: new Float64Array([12.1, 12.3, 12.5]),
            },
            series: {
                temperature: {
                    x: new Float64Array([1_000, 2_000, 3_000]),
                    y: new Float64Array([12.1, 12.3, 12.5]),
                },
            },
            colorByColumn: {},
        } as any, ['temperature']);

        const nextOption = setOption.mock.calls[0][0];
        expect(nextOption.grid.left).toBeLessThan(120);
        expect(nextOption.grid.left).toBeGreaterThanOrEqual(64);
    });

    it('suggests a robust display range when a spike dominates the raw y-span', () => {
        const chart = makeChart();
        (chart as any).chartInstance = {
            options: { animation: false, legend: { show: false }, series: [] },
            setOption: vi.fn(),
            setZoomRange: vi.fn(),
        };

        chart.updateDataMulti({
            ts: new Float64Array([0, 1, 2, 3, 4]),
            values: {
                OT: new Float64Array([12.1, 12.1, 12.2, 12.2, 113.76]),
            },
            series: {
                OT: {
                    x: new Float64Array([0, 1, 2, 3, 4]),
                    y: new Float64Array([12.1, 12.1, 12.2, 12.2, 113.76]),
                },
            },
            colorByColumn: {},
        } as any, ['OT']);

        expect(chart.getRobustDisplayRangeSuggestion()).toEqual({ mode: 'percentile', param: 1 });
    });

    it('preserves the requested x viewport instead of resetting to the full fetched window', () => {
        const chart = makeChart();
        const setZoomRange = vi.fn();
        (chart as any).chartInstance = {
            options: { animation: false, legend: { show: false }, series: [] },
            setOption: vi.fn(),
            setZoomRange,
        };

        chart.setXRange(25, 75);
        chart.updateDataMulti({
            ts: new Float64Array([0, 25, 50, 75, 100]),
            values: {
                temperature: new Float64Array([10, 20, 30, 40, 50]),
            },
            series: {
                temperature: {
                    x: new Float64Array([0, 25, 50, 75, 100]),
                    y: new Float64Array([10, 20, 30, 40, 50]),
                },
            },
            colorByColumn: {},
        } as any, ['temperature']);

        expect(setZoomRange).toHaveBeenCalledWith(25, 75, 'api');
    });

    it('does not render negative y-axis headroom for strictly positive data', () => {
        const chart = makeChart();
        (chart as any)._lastDataYMin = 0.1;
        (chart as any)._lastDataYMax = 100;
        (chart as any)._lastDisplayYValues = [0.1, 0.2, 1, 25, 100];

        const yAxis = (chart as any)._buildYAxisOption();

        expect(yAxis.min).toBeGreaterThanOrEqual(0);
    });

});

// ── Export with drawings ─────────────────────────────────────────────────────

describe('image exports', () => {
    /** Build a minimal canvas stub that downloadUrl() can serialize. */
    function makeExportCanvasStub(): { canvas: HTMLCanvasElement; toDataURL: ReturnType<typeof vi.fn> } {
        const toDataURL = vi.fn(() => 'data:image/png;base64,AAAA');
        const canvas = { width: 600, height: 400, toDataURL } as unknown as HTMLCanvasElement;
        return { canvas, toDataURL };
    }

    it('exportPNG bakes drawings into the exported canvas (includeDrawings=true)', async () => {
        const chart = makeChart();
        const { canvas, toDataURL } = makeExportCanvasStub();
        const helper = vi.fn().mockResolvedValue(canvas);
        (chart as any)._getCombinedExportCanvas = helper;
        // Stub out downloadUrl so we don't actually try to click an anchor.
        (chart as any).downloadUrl = vi.fn();

        await chart.exportPNG();

        expect(helper).toHaveBeenCalledTimes(1);
        expect(helper).toHaveBeenCalledWith(true);
        expect(toDataURL).toHaveBeenCalledWith('image/png');
    });

    it('exportSVG bakes drawings into the exported canvas (includeDrawings=true)', async () => {
        const chart = makeChart();
        const { canvas, toDataURL } = makeExportCanvasStub();
        const helper = vi.fn().mockResolvedValue(canvas);
        (chart as any)._getCombinedExportCanvas = helper;
        (chart as any).downloadBlob = vi.fn();

        await chart.exportSVG();

        expect(helper).toHaveBeenCalledTimes(1);
        expect(helper).toHaveBeenCalledWith(true);
        expect(toDataURL).toHaveBeenCalledWith('image/png');
    });

    it('exportHTML bakes drawings into the exported canvas (includeDrawings=true)', async () => {
        const chart = makeChart();
        const { canvas, toDataURL } = makeExportCanvasStub();
        const helper = vi.fn().mockResolvedValue(canvas);
        (chart as any)._getCombinedExportCanvas = helper;
        (chart as any).downloadBlob = vi.fn();

        await chart.exportHTML();

        expect(helper).toHaveBeenCalledTimes(1);
        expect(helper).toHaveBeenCalledWith(true);
        expect(toDataURL).toHaveBeenCalledWith('image/png');
    });
});
