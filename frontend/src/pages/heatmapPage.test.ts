import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCorrelationMatrixMock = vi.fn();

vi.mock('../dataClient.js', () => ({
    fetchCorrelationMatrix: (...args: unknown[]) => fetchCorrelationMatrixMock(...args),
}));

vi.mock('../utils/chartExport.js', () => ({
    exportElementPNG: vi.fn(),
    exportElementSVG: vi.fn(),
    exportElementHTML: vi.fn(),
    exportMatrixCSV: vi.fn(),
}));

vi.mock('../utils/toast.js', () => ({
    toast: vi.fn(),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <section id="page-heatmap">
            <select id="heatmap-metric"><option value="pearson" selected>Pearson</option><option value="spearman">Spearman</option></select>
            <input id="heatmap-cell-size" type="range" value="36">
            <span id="heatmap-cell-size-value">36</span>
            <span id="heatmap-status"></span>
            <div id="heatmap-container"></div>
            <div id="heatmap-empty-state" data-empty-reason=""></div>
            <button id="heatmap-export-png-btn" type="button"></button>
            <button id="heatmap-export-svg-btn" type="button"></button>
            <button id="heatmap-export-html-btn" type="button"></button>
            <button id="heatmap-export-csv-btn" type="button"></button>
        </section>
        <select id="scatter-x-col"><option value=""></option><option value="a">a</option><option value="b">b</option></select>
        <select id="scatter-y-col"><option value=""></option><option value="a">a</option><option value="b">b</option></select>
    `;
        (document.getElementById('page-heatmap') as HTMLElement).hidden = false;
    }

describe('initHeatmapPage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        (window as any).__edatime = {};
        buildDom();
    });

    it('loads the matrix and routes cell clicks into scatter', async () => {
        fetchCorrelationMatrixMock.mockResolvedValueOnce({
            columns: ['a', 'b'],
            pearson: [[1, 0.5], [0.5, 1]],
            spearman: [[1, 0.4], [0.4, 1]],
        });
        const showPage = vi.fn();

        const { initHeatmapPage } = await import('./heatmapPage');
        await initHeatmapPage({ showPage });

        expect(document.querySelectorAll('.heatmap-cell')).toHaveLength(4);
        expect(document.getElementById('heatmap-status')?.textContent).toContain('2 columns');

        (document.querySelector('.heatmap-cell[data-row="0"][data-col="1"]') as HTMLElement).click();

        expect((document.getElementById('scatter-x-col') as HTMLSelectElement).value).toBe('a');
        expect((document.getElementById('scatter-y-col') as HTMLSelectElement).value).toBe('b');
        expect(showPage).toHaveBeenCalledWith('scatter');
    });
});