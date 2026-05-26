/**
 * Tests for frontend/src/charts/fallback.ts
 *
 * Covers: FallbackChart bootstrap, no-op stubs, and basic render path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FallbackChart } from './fallback';
import type { FilteredDataObject } from '../types';

describe('FallbackChart', () => {
    describe('construction', () => {
        it('stores containerId without touching DOM', () => {
            const chart = new FallbackChart('my-container');
            expect(chart).toBeDefined();
        });
    });

    describe('no-op stubs', () => {
        it('supportsZoomControls returns false', () => {
            const chart = new FallbackChart('c');
            expect(chart.supportsZoomControls()).toBe(false);
        });

        it('getXDomain returns null', () => {
            const chart = new FallbackChart('c');
            expect(chart.getXDomain()).toBeNull();
        });

        it('getYRange returns null', () => {
            const chart = new FallbackChart('c');
            expect(chart.getYRange()).toBeNull();
        });

        it('no-op methods do not throw', () => {
            const chart = new FallbackChart('c');
            expect(() => chart.setXRange()).not.toThrow();
            expect(() => chart.onCrosshairMove()).not.toThrow();
            expect(() => chart.onClick()).not.toThrow();
            expect(() => chart.setChartText()).not.toThrow();
            expect(() => chart.setDrawMode()).not.toThrow();
            expect(() => chart.clearDrawings()).not.toThrow();
            expect(() => chart.fitYToData()).not.toThrow();
            expect(() => chart.exportPNG()).not.toThrow();
            expect(() => chart.exportSVG()).not.toThrow();
            expect(() => chart.exportHTML()).not.toThrow();
        });
    });

    describe('init', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="test-container" style="width:400px;height:300px;"></div>';
        });

        it('creates a canvas inside the container', async () => {
            const chart = new FallbackChart('test-container');
            await chart.init();
            const container = document.getElementById('test-container')!;
            const canvas = container.querySelector('canvas');
            expect(canvas).not.toBeNull();
        });

        it('throws when container not found', async () => {
            const chart = new FallbackChart('nonexistent');
            await expect(chart.init()).rejects.toThrow('not found');
        });
    });

    describe('updateDataMulti', () => {
        let chart: FallbackChart;

        beforeEach(async () => {
            document.body.innerHTML = '<div id="chart-box" style="width:200px;height:100px;"></div>';
            chart = new FallbackChart('chart-box');
            await chart.init();

            // Happy-dom canvas mock: ensure getContext returns a mock 2D context
            const canvas = document.querySelector('canvas')!;
            const mockCtx = {
                clearRect: vi.fn(),
                fillRect: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                fillText: vi.fn(),
                fillStyle: '',
                strokeStyle: '',
                lineWidth: 1,
                font: '',
            };
            vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);
            // Re-init to pick up mocked context
            await chart.init();
        });

        it('does not throw with empty data', () => {
            const data: FilteredDataObject = {
                series: {},
                colorByColumn: {},
            };
            expect(() => chart.updateDataMulti(data, [])).not.toThrow();
        });

        it('does not throw with valid series data', () => {
            const data: FilteredDataObject = {
                series: {
                    temperature: {
                        x: new Float64Array([1, 2, 3, 4, 5]),
                        y: new Float64Array([20, 22, 21, 23, 19]),
                    },
                },
                colorByColumn: {},
            };
            expect(() => chart.updateDataMulti(data, ['temperature'])).not.toThrow();
        });

        it('handles multiple columns', () => {
            const data: FilteredDataObject = {
                series: {
                    a: { x: new Float64Array([1, 2]), y: new Float64Array([10, 20]) },
                    b: { x: new Float64Array([1, 2]), y: new Float64Array([30, 40]) },
                },
                colorByColumn: {},
            };
            expect(() => chart.updateDataMulti(data, ['a', 'b'])).not.toThrow();
        });

        it('handles missing column gracefully', () => {
            const data: FilteredDataObject = {
                series: {},
                colorByColumn: {},
            };
            expect(() => chart.updateDataMulti(data, ['nonexistent'])).not.toThrow();
        });
    });

    describe('destroy', () => {
        it('cleans up without error', async () => {
            document.body.innerHTML = '<div id="d"></div>';
            const chart = new FallbackChart('d');
            await chart.init();
            expect(() => chart.destroy()).not.toThrow();
        });

        it('can be called before init', () => {
            const chart = new FallbackChart('x');
            expect(() => chart.destroy()).not.toThrow();
        });
    });
});
