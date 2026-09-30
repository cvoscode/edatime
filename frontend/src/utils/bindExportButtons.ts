/**
 * Declaratively wire PNG / SVG / HTML / CSV export buttons.
 *
 * Replaces repeated `document.getElementById('{prefix}-export-*.btn')?.addEventListener(...)`
 * boilerplate across fftPage, heatmapPage, and spectrogramPage.
 *
 * Usage:
 *   bindExportButtons('fft', {
 *     png: { fn: exportContainerCanvasPNG, filename: 'edatime_fft.png' },
 *     svg: { fn: exportContainerCanvasSVG, filename: 'edatime_fft.svg' },
 *     html: { fn: exportContainerCanvasHTML, filename: 'edatime_fft.html' },
 *     csv: {
 *       fn: exportTraceCSV,
 *       filename: 'edatime_fft_magnitude.csv',
 *       dataCheck: () => fftTraces.length > 0,
 *     },
 *   });
 */

import { toast } from './toast.js';

export interface ExportButtonConfig {
    png: { fn: (...args: string[]) => void; filename: string };
    svg: { fn: (...args: string[]) => void; filename: string };
    html: { fn: (...args: string[]) => void; filename: string };
    csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean };
}

/**
 * Wire the export buttons for one page instance. The returned function removes
 * every listener, so a remounted page never exports through a previous
 * instance's handlers (and the data they captured).
 */
export function bindExportButtons(prefix: string, config: ExportButtonConfig): () => void {
    const controller = new AbortController();
    const bindOne = (id: string, handler: () => void): void => {
        document.getElementById(id)?.addEventListener('click', handler, { signal: controller.signal });
    };
    bindOne(`${prefix}-export-png-btn`, () => config.png.fn(config.png.filename));
    bindOne(`${prefix}-export-svg-btn`, () => config.svg.fn(config.svg.filename));
    bindOne(`${prefix}-export-html-btn`, () => config.html.fn(config.html.filename));

    if (config.csv) {
        const { fn, filename, dataCheck } = config.csv;
        bindOne(`${prefix}-export-csv-btn`, () => {
            if (dataCheck && !dataCheck()) {
                toast('No data to export.', 'warning');
                return;
            }
            fn(filename);
        });
    }
    return () => controller.abort();
}