import { describe, expect, it, vi } from 'vitest';
import { DataChart } from './DataChart.js';
import { FftChart } from './FftChart.js';
import { EchartsScatterChart } from './EchartsScatterChart.js';

describe('Chart Disposal & Resource Teardown Leak Guard', () => {
    it('calls dispose() on underlying chart instance and releases interactions on DataChart destroy()', () => {
        const mockDispose = vi.fn();
        const disposeInteractions = vi.fn();
        const chart = new DataChart('chart-root', null);
        (chart as any).chartInstance = { dispose: mockDispose, setOption: vi.fn() };
        (chart as any)._disposeInteractions = disposeInteractions;

        chart.destroy();
        chart.destroy();

        expect(mockDispose).toHaveBeenCalledOnce();
        expect(disposeInteractions).toHaveBeenCalledTimes(2);
        expect(chart.chartInstance).toBeNull();
    });

    it('disposes interaction and overlay resources on FftChart destroy()', () => {
        const mockInteractionDispose = vi.fn();
        const mockOverlayDispose = vi.fn();
        const mockChartDispose = vi.fn();

        const fftChart = new FftChart('fft-root');

        (fftChart as any)._interactionResources = { dispose: mockInteractionDispose };
        (fftChart as any)._overlayResources = { dispose: mockOverlayDispose };
        (fftChart as any)._chart = { dispose: mockChartDispose };

        fftChart.destroy();

        expect(mockInteractionDispose).toHaveBeenCalledOnce();
        expect(mockOverlayDispose).toHaveBeenCalledOnce();
        expect(mockChartDispose).toHaveBeenCalledOnce();
    });

    it('invokes dispose() on underlying ECharts instance when EchartsScatterChart is disposed', () => {
        const mockScatterDispose = vi.fn();
        const scatter = new EchartsScatterChart('scatter-root');

        (scatter as any)._chart = { dispose: mockScatterDispose, setOption: vi.fn() };

        scatter.dispose();

        expect(mockScatterDispose).toHaveBeenCalledOnce();
    });
});
