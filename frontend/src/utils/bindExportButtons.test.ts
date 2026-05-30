import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindExportButtons } from './bindExportButtons.js';

const pngMock = vi.fn();
const svgMock = vi.fn();
const htmlMock = vi.fn();
const csvMock = vi.fn();

vi.mock('./toast.js', () => ({ toast: vi.fn() }));

beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any buttons that may have been added to the DOM
    document.body.innerHTML = '';
});

describe('bindExportButtons', () => {
    it('does not throw when no buttons exist for a prefix', () => {
        expect(() => {
            bindExportButtons('nonexistent', {
                png: { fn: pngMock, filename: 'a.png' },
                svg: { fn: svgMock, filename: 'a.svg' },
                html: { fn: htmlMock, filename: 'a.html' },
            });
        }).not.toThrow();
    });

    it('wires the PNG button to the correct function and filename', () => {
        document.body.innerHTML = `<button id="my-export-png-btn" type="button">PNG</button>`;

        bindExportButtons('my', {
            png: { fn: pngMock, filename: 'my_chart.png' },
            svg: { fn: svgMock, filename: 'my_chart.svg' },
            html: { fn: htmlMock, filename: 'my_chart.html' },
        });

        document.getElementById('my-export-png-btn')!.click();
        expect(pngMock).toHaveBeenCalledTimes(1);
        expect(pngMock).toHaveBeenCalledWith('my_chart.png');
    });

    it('wires the SVG button to the correct function and filename', () => {
        document.body.innerHTML = `<button id="my-export-svg-btn" type="button">SVG</button>`;

        bindExportButtons('my', {
            png: { fn: pngMock, filename: 'x.png' },
            svg: { fn: svgMock, filename: 'my_chart.svg' },
            html: { fn: htmlMock, filename: 'x.html' },
        });

        document.getElementById('my-export-svg-btn')!.click();
        expect(svgMock).toHaveBeenCalledTimes(1);
        expect(svgMock).toHaveBeenCalledWith('my_chart.svg');
    });

    it('wires the HTML button to the correct function and filename', () => {
        document.body.innerHTML = `<button id="my-export-html-btn" type="button">HTML</button>`;

        bindExportButtons('my', {
            png: { fn: pngMock, filename: 'x.png' },
            svg: { fn: svgMock, filename: 'x.svg' },
            html: { fn: htmlMock, filename: 'my_chart.html' },
        });

        document.getElementById('my-export-html-btn')!.click();
        expect(htmlMock).toHaveBeenCalledTimes(1);
        expect(htmlMock).toHaveBeenCalledWith('my_chart.html');
    });

    it('wires the CSV button and calls the export function with filename', () => {
        document.body.innerHTML = `<button id="my-export-csv-btn" type="button">CSV</button>`;

        bindExportButtons('my', {
            png: { fn: pngMock, filename: 'x.png' },
            svg: { fn: svgMock, filename: 'x.svg' },
            html: { fn: htmlMock, filename: 'x.html' },
            csv: { fn: csvMock, filename: 'my_data.csv' },
        });

        document.getElementById('my-export-csv-btn')!.click();
        expect(csvMock).toHaveBeenCalledTimes(1);
        expect(csvMock).toHaveBeenCalledWith('my_data.csv');
    });

    it('CSV button shows a toast and does not call export fn when dataCheck returns false', async () => {
        const { toast } = await import('./toast.js');
        document.body.innerHTML = `<button id="my-export-csv-btn" type="button">CSV</button>`;

        bindExportButtons('my', {
            png: { fn: pngMock, filename: 'x.png' },
            svg: { fn: svgMock, filename: 'x.svg' },
            html: { fn: htmlMock, filename: 'x.html' },
            csv: {
                fn: csvMock,
                filename: 'should_not_export.csv',
                dataCheck: () => false,
            },
        });

        document.getElementById('my-export-csv-btn')!.click();
        expect(csvMock).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('No data to export.', 'warning');
    });

    it('CSV button calls export fn when dataCheck returns true', () => {
        document.body.innerHTML = `<button id="my-export-csv-btn" type="button">CSV</button>`;

        bindExportButtons('my', {
            png: { fn: pngMock, filename: 'x.png' },
            svg: { fn: svgMock, filename: 'x.svg' },
            html: { fn: htmlMock, filename: 'x.html' },
            csv: {
                fn: csvMock,
                filename: 'with_data.csv',
                dataCheck: () => true,
            },
        });

        document.getElementById('my-export-csv-btn')!.click();
        expect(csvMock).toHaveBeenCalledTimes(1);
        expect(csvMock).toHaveBeenCalledWith('with_data.csv');
    });

    it('wires all buttons independently so one click does not affect others', () => {
        document.body.innerHTML = `
            <button id="my-export-png-btn" type="button">PNG</button>
            <button id="my-export-svg-btn" type="button">SVG</button>
            <button id="my-export-html-btn" type="button">HTML</button>
            <button id="my-export-csv-btn" type="button">CSV</button>
        `;

        bindExportButtons('my', {
            png: { fn: pngMock, filename: 'all.png' },
            svg: { fn: svgMock, filename: 'all.svg' },
            html: { fn: htmlMock, filename: 'all.html' },
            csv: { fn: csvMock, filename: 'all.csv', dataCheck: () => true },
        });

        document.getElementById('my-export-png-btn')!.click();
        document.getElementById('my-export-svg-btn')!.click();
        document.getElementById('my-export-html-btn')!.click();
        document.getElementById('my-export-csv-btn')!.click();

        expect(pngMock).toHaveBeenCalledTimes(1);
        expect(svgMock).toHaveBeenCalledTimes(1);
        expect(htmlMock).toHaveBeenCalledTimes(1);
        expect(csvMock).toHaveBeenCalledTimes(1);
    });
});