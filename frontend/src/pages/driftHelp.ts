/**
 * driftHelp — page-level "?" help for the Drift Analysis page.
 *
 * Drift compares a reference window against a sliding analysis window
 * using KS / Wasserstein / PSI / ES tests, and surfaces results as
 * per-column timelines and a detail view. The help modal covers
 * windowing, metric choice, thresholds, and the export menu.
 *
 * Wired from `initDriftPage` so the help loads the first time the
 * user navigates to the page (lazy via `pageModules`).
 */

import { initPageHelp, type PageHelpContent } from '../ui/pageHelp.js';

export const DRIFT_HELP: PageHelpContent = {
    pageName: 'Drift',
    intro:
        'Distribution-drift analysis. Pick a reference window and a sliding analysis window, choose per-column metrics (KS, Wasserstein, PSI, ES), then run the comparison to see how each column has shifted over time.',
    sections: [
        {
            title: 'Column picker',
            body:
                'The first segment picks which numeric columns to analyze.',
            bullets: [
                'Single — analyze one column at a time (lowest compute, clearest detail view)',
                'All — analyze every numeric column at once (broader view, slower on wide schemas)',
                'Subset — pick a custom set with the checkboxes',
                'None — clears the selection; useful when starting a new investigation',
            ],
        },
        {
            title: 'Window and reference',
            body:
                'The next two segments control how the data is sliced into windows.',
            bullets: [
                'Window size — how many samples each analysis window contains; smaller windows = finer time resolution but noisier drift signal',
                'Reference window — how the "baseline" distribution is built; choose first N, last N, a custom date range, or the full dataset',
                'Evaluation mode — sliding (windows overlap by default) or tumbling (non-overlapping)',
                'Latest N — restrict the analysis to the most recent N samples; useful when only the recent regime matters',
                'Segment by — split the analysis by a categorical or time column (e.g. weekday vs weekend)',
            ],
        },
        {
            title: 'Thresholds',
            body:
                'Each metric has its own threshold; the page uses the thresholds to color the timeline (green / yellow / red).',
            bullets: [
                'KS threshold — p-value below which KS rejects "same distribution"; 0.05 is the typical default',
                'ES (effect size) threshold — minimum effect size to count as drift; 0.1 is small, 0.3 medium, 0.5 large',
                'PSI minor / major — Population Stability Index thresholds; 0.1 minor, 0.2 major are common defaults',
                'Wasserstein std multiplier — number of std-devs of the reference distribution that counts as drift',
            ],
        },
        {
            title: 'Result timeline',
            body:
                'The top chart shows the per-column drift score over the analysis windows. Hover for the score and p-value; click a window to inspect it in the detail view.',
            bullets: [
                'Color — green (below minor threshold), yellow (between minor and major), red (above major)',
                'Hover — tooltip with the window range, score, p-value, and contributing column',
                'Click — jumps to the detail view for that window',
                'Sort — by drift magnitude (largest first) or alphabetically; affects the column list, not the timeline',
            ],
        },
        {
            title: 'Detail view',
            body:
                'The bottom panel shows the reference vs analysis distribution for one column and one window.',
            bullets: [
                'Histogram overlay — reference in one color, analysis in another; CDF on the right',
                'Summary stats — mean, std, min, max, skewness for each window',
                'Switch columns — pick a different column from the dropdown to inspect another metric for the same window',
            ],
        },
        {
            title: 'Export',
            body:
                'CSV exports the full window × column matrix; JSON includes the per-window detail.',
            bullets: [
                'CSV — per-window, per-column score and p-value; safe to import into another tool',
                'JSON — full per-window detail with histograms and summary stats',
                'PNG — visual snapshot of the timeline (key P)',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥0', description: 'Open the Drift page (this page)' },
        { keys: '⌥2', description: 'Open the Timeseries page — pick columns there first' },
        { keys: 'Enter / D', description: 'Run the drift computation' },
        { keys: 'E', description: 'Export the drift CSV' },
        { keys: 'J / P', description: 'Export JSON / PNG' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
    ],
    tips: [
        'Start with KS + Wasserstein on a single column for a fast first look; switch to PSI when you care about categorical-style stability.',
        'Tumbling windows give cleaner "did the distribution shift between these two intervals" answers; sliding windows are better for trend detection.',
        'Watch out for short windows: too few samples per window and the test loses power. The status bar shows the window count — aim for ≥30 windows for stable thresholds.',
        'Save the session (Ctrl+S) to keep the column / window / threshold settings.',
    ],
};

export function initDriftHelp(): void {
    initPageHelp('drift', DRIFT_HELP);
}