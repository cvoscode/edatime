/**
 * scatterHelp — page-level "?" help for the Scatter page.
 *
 * The Scatter page is the deep-dive view for a chosen pair of
 * numeric columns. It can render in two modes (Scatter / Density),
 * color points by an extra column, switch to a Matrix view for
 * pairwise screening, and propagate filters back to the Timeseries
 * page. The help modal covers all of that.
 *
 * Wired from `initScatterPage` so the help loads the first time the
 * user navigates to the page (lazy via `pageModules`).
 */

import { initPageHelp, type PageHelpContent } from '../ui/pageHelp.js';

export const SCATTER_HELP: PageHelpContent = {
    pageName: 'Scatter',
    intro:
        'Deep-dive view for a chosen pair of numeric columns. Switch between Scatter (every point) and Density (binned heatmap), optionally color points by a third column, and use the linked filters to scope both axes.',
    sections: [
        {
            title: 'View toolbar',
            body:
                'The first segment picks the X and Y columns and the page view mode.',
            bullets: [
                'X axis / Y axis — pick any two numeric columns from the dropdowns; the page rerenders automatically',
                'Plot — single pair view; choose Scatter or Density mode in the Display segment',
                'Matrix — pairwise grid that pairs every numeric column with every other one; useful for screening',
            ],
        },
        {
            title: 'Display segment',
            body:
                'The second segment controls rendering and color encoding.',
            bullets: [
                'Mode — Density bins points into a heatmap (good for huge datasets); Scatter draws every point (good for outliers)',
                'Color by — pick a third column to encode point color; numeric columns get a continuous colorbar, categorical get a legend',
                'Colorscale — pick a palette for the color encoding; the choice sticks across pages',
                'Point size / opacity — sliders that only affect Scatter mode; Density ignores them',
            ],
        },
        {
            title: 'Linked filters and color',
            body:
                'When you scope the chart on the Timeseries page (zoom, time range, numeric filter, adaptive line), the Scatter page receives the same scope automatically. The linked filter chips at the top of the page mirror the Timeseries state and can be cleared from here too.',
            bullets: [
                'Linked chips show the active filters — time range, numeric range, adaptive line',
                'Clearing a chip on Scatter also clears it on Timeseries (and vice-versa)',
                'Color-by column changes are local to this page and do not propagate',
            ],
        },
        {
            title: 'Plot interactions',
            body:
                'The plot canvas is interactive. Most interactions stay local to the chart; linked filters are not changed by clicks inside the plot.',
            bullets: [
                'Hover — tooltip with X, Y, and (if color-encoded) the color value',
                'Click a point — pins the tooltip; click again to unpin',
                'Drag to zoom — horizontal and vertical box-zoom; double-click to reset',
                'Legend / colorbar click — toggle visibility of a category or hide outliers',
            ],
        },
        {
            title: 'Export',
            body:
                'The Export disclosure lets you save the current scatter view as PNG, SVG, HTML (keeps the points interactive), CSV (raw X/Y/color), or JSON (full payload for re-import).',
            bullets: [
                'PNG / SVG — visual snapshot of the current view; respects the active filters',
                'HTML — single-file with interactive points; useful for sharing a read-only snapshot',
                'CSV / JSON — the raw points and metadata; CSV is two columns (X, Y) plus an optional color column',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥3', description: 'Open the Scatter page (this page)' },
        { keys: '⌥4', description: 'Switch to the Matrix view from any pair' },
        { keys: '⌥7', description: 'Open the Correlations page — useful for picking a pair' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'P', description: 'Export the chart as PNG' },
        { keys: 'E', description: 'Export the filtered points as CSV' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
    ],
    tips: [
        'Density is the safer default for datasets above ~50k points; switch to Scatter when you suspect outliers or clusters you want to inspect.',
        'Use Color-by on a categorical column to see how a label partitions the X/Y space — categorical encoding is faster to read than a continuous scale.',
        'If the plot feels empty after applying linked filters, the filters may be too narrow: clear them from the chips at the top of the page.',
        'Save the session (Ctrl+S) to keep your X/Y/color choice; otherwise it resets to the dataset defaults on reload.',
    ],
};

export function initScatterHelp(): void {
    initPageHelp('scatter', SCATTER_HELP);
}