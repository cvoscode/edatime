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

vi.mock('../app/pageLifecycle.js', () => ({
    createPageLifecycle: vi.fn(({ page, init, onVisible, onEveryPageChange }) => {
        return () => {
            init?.();
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
        `;
    });

    it('spectrogram page initializes with createAnalysisPageRuntime', async () => {
        const { initSpectrogramPage } = await import('../pages/spectrogramPage.js');
        await initSpectrogramPage({
            setLoading: vi.fn(),
        });
    });
});