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

import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

export const DRIFT_HELP: PageHelpContent = {
    pageName: 'Drift',
    intro:
        'Distribution-drift analysis. Pick a reference baseline, an evaluation window, choose per-column metrics (KS, Wasserstein, PSI, ES), then run the comparison to see how each column has shifted over time.',
    sections: [
        {
            title: 'Column picker',
            body:
                'The first dropdown picks which numeric columns to analyze.',
            bullets: [
                'All — analyze every numeric column at once (broader view, slower on wide schemas)',
                'Single — analyze one column at a time (lowest compute, clearest detail view)',
                'Clear — clears the selection; useful when starting a new investigation',
                'Subset — toggle individual columns with the chips in the dropdown',
            ],
        },
        {
            title: 'Window and reference',
            body:
                'The Window and Reference dropdowns control how the data is sliced into windows.',
            bullets: [
                'Window size — how many samples each analysis window contains; smaller windows = finer time resolution but noisier drift signal',
                'Reference preset — First 50%, Last 50%, Custom range, or Current viewport (matches the Signals page selection)',
                'Evaluation mode — All later windows, Latest window only, or Latest N windows',
                'Latest N — restrict the analysis to the most recent N windows; useful when only the recent regime matters',
                'Switch columns — pick a different column from the dropdown to inspect another metric for the same window',
            ],
        },
        {
            title: 'Thresholds',
            body:
                'Each metric has its own threshold; the page uses the thresholds to color the timeline (green / yellow / red). Hover any threshold for a calibration hint.',
            bullets: [
                'KS p-value — below which KS rejects "same distribution"; 0.05 is typical, but loses power below n = 20',
                'ES (Epps–Singleton) p-value — useful for small windows where KS power is weak',
                'PSI minor / major — Population Stability Index thresholds; 0.1 minor, 0.2 major are common defaults',
                'Wasserstein std multiplier — number of reference std-devs that counts as drift; 0.10 is strict, 0.20–0.30 typical',
                'Sample-size imbalance — when the reference is ≥10× a window, PSI/KS may be inflated; the verdict strip downgrades to a "Method reliability" warning',
            ],
        },
        {
            title: 'Investigation tabs',
            body:
                'Use the tab strip above the timeline to switch between views.',
            bullets: [
                'Timeline plots — the default heatmap, grouped time series, and per-trace distributions',
                'Overview — investigation score, worst level, and the top change points',
                'Segments — drift score per Segment-by value (only when Segment by is set)',
                'Quality — missingness, completeness, zero-rate, and flatline warnings',
                'Relationships — correlation deltas between column pairs across reference vs comparison',
            ],
        },
        {
            title: 'Result timeline',
            body:
                'The top chart shows the per-column drift score over the analysis windows. Hover for the score and p-value; click a window to inspect it in the detail view.',
            bullets: [
                'Color — green (below minor threshold), yellow (between minor and major), red (above major)',
                'Reference band — a translucent blue overlay marks the reference baseline with its start/end dates and row count',
                'Hover — tooltip with the window range, score, p-value, and contributing column',
                'Click — jumps to the detail view for that window',
                
            ],
        },
        {
            title: 'Detail view',
            body:
                'The bottom panel shows the reference vs analysis distribution for one column and one window.',
            bullets: [
                'Distribution selector — Raincloud (default), ECDF, Box plot, or Violin',
                'Latest / Worst / First change — pick the window to inspect',
                'Strongest evidence — opens to "Why this verdict?" in the verdict strip',
                'View all evaluation windows — sortable list of every window with its PSI score',
            ],
        },
        {
            title: 'Export',
            body:
                'CSV exports the full window × column matrix; JSON includes the per-window detail.',
            bullets: [
                'Overview PNG — visual snapshot of the timeline chart',
                'Evidence PNG — visual snapshot of the evidence chart',
                'CSV — per-window, per-column score and p-value; safe to import into another tool',
                'JSON — full per-window detail with histograms and summary stats',
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
        'Aim for ≥30 evaluation windows for stable thresholds; fewer than 10 windows often gives noisy verdicts.',
        'When the reference is much larger than the evaluation window, the verdict strip downgrades to a "Method reliability" warning — lengthen the window or shorten the reference before drawing conclusions.',
        'The "Why this verdict?" disclosure in the verdict strip lists the strongest two pieces of evidence behind the headline.',
        'Save the session (Ctrl+S) to keep the column / window / threshold settings.',
    ],
};

export function initDriftHelp(): () => void {
    return initPageHelp('drift', DRIFT_HELP);
}
