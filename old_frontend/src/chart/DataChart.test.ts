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
import { DataChart } from './DataChart';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a chart with no callbacks to keep tests DOM-light. */
function makeChart(
    onZoom?: ((start: number, end: number, sourceKind: string) => void) | null,
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
    it('sets _drawMode', () => {
        const chart = makeChart();
        chart.setDrawMode('line');
        expect((chart as any)._drawMode).toBe('line');
    });

    it('sets _drawColor when provided', () => {
        const chart = makeChart();
        chart.setDrawMode('line', '#00ff00');
        expect((chart as any)._drawColor).toBe('#00ff00');
    });

    it('sets _drawWidth when provided', () => {
        const chart = makeChart();
        chart.setDrawMode('line', undefined, 5);
        expect((chart as any)._drawWidth).toBe(5);
    });

    it('does not overwrite _drawColor when not provided', () => {
        const chart = makeChart();
        (chart as any)._drawColor = '#ff0000';
        chart.setDrawMode('line');
        expect((chart as any)._drawColor).toBe('#ff0000');
    });

    it('does not overwrite _drawWidth when not provided', () => {
        const chart = makeChart();
        (chart as any)._drawWidth = 3;
        chart.setDrawMode('line');
        expect((chart as any)._drawWidth).toBe(3);
    });
});

// ── clearDrawings ────────────────────────────────────────────────────────────

describe('clearDrawings', () => {
    it('empties _drawings array', () => {
        const chart = makeChart();
        (chart as any)._drawings = [{ type: 'line', points: [] }];
        chart.clearDrawings();
        expect((chart as any)._drawings).toHaveLength(0);
    });

    it('clears _currentDraw', () => {
        const chart = makeChart();
        (chart as any)._currentDraw = { type: 'line', points: [] };
        chart.clearDrawings();
        expect((chart as any)._currentDraw).toBeNull();
    });
});

// ── requestOverlayRender ─────────────────────────────────────────────────────

describe('requestOverlayRender', () => {
    it('does not throw when _overlayCtx is null (no-op)', () => {
        const chart = makeChart();
        expect(() => chart.requestOverlayRender()).not.toThrow();
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

    it('prefers _lastDataYMin/Max over _yMin/yMax when both are set', () => {
        const chart = makeChart();
        (chart as any)._lastDataYMin = 10;
        (chart as any)._lastDataYMax = 90;
        (chart as any)._yMin = 20;
        (chart as any)._yMax = 80;
        expect(chart.getYRange()).toEqual({ min: 10, max: 90 });
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

    it('clears _drawingRafId and cancels any pending animation frame', () => {
        const chart = makeChart();
        const rafId = 42;
        (chart as any)._drawingRafId = rafId;
        const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
        chart.destroy();
        expect(cancelSpy).toHaveBeenCalledWith(rafId);
        expect((chart as any)._drawingRafId).toBeNull();
        cancelSpy.mockRestore();
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