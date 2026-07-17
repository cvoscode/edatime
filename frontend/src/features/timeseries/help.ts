/**
 * timeseriesHelp — page-level "?" help for the Timeseries page.
 *
 * Kept separate from `timeseriesPage.ts` (the heavy page controller)
 * so the help module stays small, lazy-loadable, and easy to test in
 * isolation. The `initAnalysisControls` subsystem already runs when
 * the user navigates to the Timeseries page, so we hook the help init
 * onto it.
 */

import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

/**
 * Content of the Timeseries help modal. Walks through each part of
 * the page top-to-bottom: command bar, utility shelf, chart area,
 * overlays, then keyboard shortcuts and tips. Short on opinions,
 * long on actionable detail — this is the page new users get lost on.
 */
export const TIMESERIES_HELP: PageHelpContent = {
    pageName: 'Timeseries',
    intro:
        'Multi-series time-series chart with zoom, drawing, adaptive filters, and overlays. Pick the columns you care about, narrow the time window, then layer in analytics.',
    sections: [
        {
            title: 'Command bar (top)',
            body:
                'The first row is the series command bar. It hosts the column filter input, the series chips that toggle each numeric column on/off, and the color-by slot on the right.',
            bullets: [
                'Series chips — click to toggle a column on the chart; Ctrl+click a selected chip to set it as the adaptive-filter target',
                'Per-chip color — each chip has a small swatch; click it to override the default color without leaving the page',
                'Color-by slot — on the right of the command bar; pick a numeric or categorical column to encode color on the chart and the colorbar below',
                'Filter input — type to narrow the chip list; matching is case-insensitive substring',
            ],
        },
        {
            title: 'Utility shelf (Draw / Labels / Notes / Export / Analytics / Zoom / Quick range)',
            body:
                'Seven segments in two rows. Each segment has an eyebrow label and its own controls. On narrow screens the shelf collapses some segments into a single "More" disclosure.',
            bullets: [
                'Draw — pick a Tool (Zoom/inspect, Arrow, or Box), a Color and a Width; click Clear drawings to remove all annotations; click the small "?" for an inline reminder of Ctrl+click',
                'Labels — opens the chart title and axis label editor; changes apply to the chart and to exported PNG/SVG',
                'Notes — opens the annotations panel: sticky notes, text callouts, and shapes that persist with the session',
                'Export — PNG / CSV are one click each; "More" opens SVG, JSON, and Parquet options',
                'Analytics — opens rolling bands, anomalies, and cleanup controls; results are rendered as overlays on the chart',
                'Zoom — the −/↺ buttons zoom out one step and reset to the initial view; the badge shows the current zoom percentage',
                'Quick range — 24h / 7d / 30d / All snap the time window to common ranges (UTC); the buttons enable once the dataset has a valid time column',
            ],
        },
        {
            title: 'Chart area',
            body:
                'The WebGPU-accelerated chart renders the selected series. The header legend, the cursor crosshair, and the analysis status bar are all part of the chart. Pan with drag in zoom mode; double-click to reset to the initial view.',
            bullets: [
                'Zoom — wheel to zoom in/out; drag a horizontal band to box-zoom',
                'Pan — drag the chart left/right; the chart redraws at the new viewport',
                'Cursor — move the mouse over the chart to see the live value, time, and Y-range at the cursor in the status bar',
                'Click — in zoom mode, click a series to focus it; Ctrl+click to draw an adaptive line filter at that point',
                'Reset — double-click anywhere on the chart to reset to the initial viewport',
            ],
        },
        {
            title: 'Overlays (rolling bands, anomalies, adaptive filters, drawings)',
            body:
                'Overlays are drawn on top of the series lines. They never replace the underlying data — they are visual annotations you can toggle off in the Analytics panel.',
            bullets: [
                'Rolling bands — shaded confidence interval from a rolling window; visible after enabling in Analytics',
                'Anomalies — point markers from the anomaly detector; severity-coloured',
                'Adaptive filters — horizontal lines drawn at Ctrl+click points; filtered samples become gaps in the targeted series while timestamps and other traces stay aligned; "Clear filters" removes them',
                'Drawings — Arrows and Boxes you draw with the Draw tool; persistent per session',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons (like the small "?" next to the Draw label) open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥2', description: 'Open the Timeseries page (this page)' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'Double-click', description: 'Reset zoom to the initial view' },
        { keys: 'Drag', description: 'Pan the chart or draw a zoom box' },
        { keys: 'Wheel', description: 'Zoom in/out at the cursor' },
        { keys: 'Ctrl+click', description: 'On the chart, draw an adaptive filter; on a series chip, set the adaptive-filter target column' },
        { keys: 'P', description: 'Export the chart as PNG' },
        { keys: 'E', description: 'Export the filtered data as CSV' },
        { keys: 'Ctrl+Z', description: 'Undo the last chart edit (zoom, filter, drawing)' },
        { keys: 'Shift+C', description: 'Clear all adaptive line filters' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
    ],
    tips: [
        'Start with 2–3 related columns for a clearer first view; add more once the time window is set.',
        'Ctrl+click a series chip to set it as the adaptive-filter target — the small "?" next to Draw reminds you of this.',
        'The Quick range buttons (24h / 7d / 30d / All) are UTC-anchored; combine them with manual drag-zoom to investigate a specific event.',
        'Save the session (Ctrl+S) before exploring — your filters, zoom, and drawings persist across reloads.',
        'If WebGPU is unavailable, the chart falls back to a Canvas renderer automatically; the rest of the page is unaffected.',
    ],
};

export function initTimeseriesHelp(): () => void {
    return initPageHelp('timeseries', TIMESERIES_HELP);
}
