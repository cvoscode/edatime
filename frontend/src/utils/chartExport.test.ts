import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    downloadBlob: vi.fn(),
    downloadUrl: vi.fn(),
    toast: vi.fn(),
}));

vi.mock('./dom.js', () => ({ downloadBlob: mocks.downloadBlob, downloadUrl: mocks.downloadUrl }));
vi.mock('./toast.js', () => ({ toast: mocks.toast }));

import { exportElementHTML, exportElementSVG } from './chartExport.js';

function buildMatrix(): HTMLElement {
    document.body.innerHTML = `<div id="matrix"><div class="heatmap-cell" tabindex="0" aria-label="x × y: +0.75"><canvas></canvas></div></div>`;
    const canvas = document.querySelector('canvas')!;
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,cGl4ZWxz');
    return document.getElementById('matrix')!;
}

describe('element exports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('accepts a live element and preserves canvas pixels in SVG exports', async () => {
        const matrix = buildMatrix();

        exportElementSVG(matrix, 'matrix.svg');

        const [blob, filename] = mocks.downloadBlob.mock.calls[0]!;
        expect(filename).toBe('matrix.svg');
        expect(await (blob as Blob).text()).toContain('data:image/png;base64,cGl4ZWxz');
    });

    it('exports interactive standalone HTML instead of flattening the matrix to one image', async () => {
        const matrix = buildMatrix();

        await exportElementHTML(matrix, 'matrix.html');

        const [blob, filename] = mocks.downloadBlob.mock.calls[0]!;
        const html = await (blob as Blob).text();
        expect(filename).toBe('matrix.html');
        expect(html).toContain('data:image/png;base64,cGl4ZWxz');
        expect(html).toContain('heatmap-cell');
        expect(html).toContain("event.target.closest('.heatmap-cell')");
    });
});
