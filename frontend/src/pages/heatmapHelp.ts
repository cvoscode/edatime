/**
 * heatmapHelp — page-level "?" help for the Correlations page (heatmap).
 *
 * Correlations is the entry point for finding which pairs of columns
 * move together. The metric toolbar (Pearson / Spearman / Kendall on
 * raw vs first-differences), the cell-size slider, clustering, fit
 * toggles, and the export format picker all need a clear explanation
 * for first-time users. The page-level help modal lives here.
 *
 * Wired from `initHeatmapPage` so the help loads the first time the
 * user navigates to the page (lazy via `pageModules`).
 */

import { initPageHelp, type PageHelpContent } from '../ui/pageHelp.js';

export const HEATMAP_HELP: PageHelpContent = {
    pageName: 'Correlations',
    intro:
        'A correlation matrix that shows how every numeric column in the dataset moves with every other one. Pick a metric, scan for strong off-diagonal cells, then click any cell to jump to a detailed scatter view.',
    sections: [
        {
            title: 'Metric toolbar',
            body:
                'The first segment picks the correlation metric and how the values are transformed before the correlation is computed. The "?" next to the dropdown shows the same explanation inline.',
            bullets: [
                'Pearson — linear correlation; sensitive to outliers; works best when both columns are roughly Gaussian',
                'Spearman — rank correlation; monotonic but not necessarily linear; robust to outliers',
                'Kendall tau — rank correlation with a different tie-breaking convention; very robust but slower on large matrices',
                'Raw values — correlate the columns as-is',
                'First differences — correlate the per-step changes; strips trends that would otherwise dominate the matrix',
            ],
        },
        {
            title: 'Display segment',
            body:
                'The second segment controls how the matrix looks. Changes apply instantly without re-fetching the data.',
            bullets: [
                'Cell size — slider that drives the cell pixel size; useful on small screens to fit more columns',
                'Cluster — when enabled (default), columns are reordered so similar columns sit next to each other; turn it off to see source order',
                'Snap to panel — bypass the slider cap so the matrix fills the panel width; turn it off when you want slider-driven overflow',
                'Fit color axis — scale the color range to the strongest off-diagonal correlation rather than to ±1; makes subtle patterns more visible',
            ],
        },
        {
            title: 'Matrix interactions',
            body:
                'The matrix is interactive, not a static image. Hover, click, and drag are all wired to actions.',
            bullets: [
                'Hover — shows the column pair, metric value, and a tooltip',
                'Click — opens the Scatter page (⌥3) with that X/Y pair pre-selected',
                'Drag to reorder — grab a column header and drag it to a new position; the order persists with the session and survives reloads',
                'Diagonal — the self-correlation cells (column against itself) are intentionally 1.0 and are not clickable',
            ],
        },
        {
            title: 'Export',
            body:
                'The "Format" disclosure exposes PNG, SVG, HTML, and CSV export of the matrix. PNG/SVG capture the visual; HTML keeps the cells interactive; CSV is the raw value matrix.',
            bullets: [
                'PNG / SVG — for slides, documentation, or sharing',
                'HTML — single-file with the cells clickable; useful when sharing a read-only snapshot of the matrix',
                'CSV — the raw values; open in Excel or load into another tool for downstream analysis',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥7', description: 'Open the Correlations page (this page)' },
        { keys: '⌥3', description: 'Open the Scatter page — landing target when you click a cell' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
    ],
    tips: [
        'Start with Pearson on raw values for a first look; switch to Spearman if the data has clear outliers, and to first-differences if the columns drift over time.',
        'Strong off-diagonal cells in the same row/column often cluster around a common driver — the cluster reorder surfaces this visually.',
        'Click a cell to jump straight to a scatter plot of that pair; the linked time-window and filters from the Timeseries page are carried over.',
        'Save the session (Ctrl+S) if you have a manual column order you want to keep — the order is persisted with the session.',
    ],
};

export function initHeatmapHelp(): void {
    // The DOM id is `heatmap-help-btn` because the page section is
    // #page-heatmap, but the displayed page name is "Correlations".
    initPageHelp('heatmap', HEATMAP_HELP);
}