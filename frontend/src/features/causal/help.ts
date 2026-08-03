/**
 * causalHelp — page-level "?" help for the Causal Discovery page.
 *
 * The Causal page wraps Tigramite-style algorithms (PCMCI, PCMCI+,
 * FullCI, BivCI, LPCMCI) and renders the directed graph with edge
 * lags and p-values. The help modal covers the algorithm choice,
 * the parameters, and the graph interactions.
 *
 * Wired from `initCausalPage` so the help loads the first time the
 * user navigates to the page (lazy via `pageModules`).
 */

import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

export const CAUSAL_HELP: PageHelpContent = {
    pageName: 'Causality',
    intro:
        'Causal discovery via Tigramite. Pick a method, choose your columns and lags, then run the algorithm to get a directed graph with per-edge lags and p-values. Use it to test "does X cause Y, with what lag, and how confident are we?".',
    sections: [
        {
            title: 'Method picker',
            body:
                'The first segment picks the causal-discovery algorithm and its parameters. The "?" next to each parameter shows an inline tip with the same explanation.',
            bullets: [
                'PCMCI — conditional-independence based; good general-purpose choice for time-series with linear / monotonic relationships',
                'PCMCI+ — extended PCMCI that captures contemporaneous (lag-0) effects; preferred when you suspect same-tick causality',
                'FullCI — exhaustive conditional-independence search; slower but more thorough; recommended for small column sets',
                'BivCI — bivariate conditional independence; the fastest method, useful as a sanity check',
                'LPCMCI — PCMCI for time-series with non-stationary or regime-dependent dynamics',
            ],
        },
        {
            title: 'Parameter panel',
            body:
                'The right panel exposes the per-method parameters. Defaults are sensible for most datasets; override only if you have a reason.',
            bullets: [
                'Max lag (tau_max) — the largest lag to consider; typically 1–5 for short-range dynamics, higher for slow processes',
                'Significance level (alpha) — p-value threshold for keeping an edge; 0.05 is the common default',
                'CI test — conditional-independence test (parcorr / gpdc / cmiknn / cmi); pick gpdc or cmiknn for non-linear / non-Gaussian data',
                'Verbosity — controls how much log output the algorithm prints; the page surfaces the result, not the log',
            ],
        },
        {
            title: 'Column selection',
            body:
                'The left rail lists all numeric columns. Click to toggle; click a column again to remove. Selected columns become the nodes of the graph.',
            bullets: [
                'Search box — narrow the list with substring matching',
                'Selection persists in the workspace store, so navigating away and back keeps your selection',
                'Right-click — open the column context menu for advanced actions (e.g. preselect from another page)',
            ],
        },
        {
            title: 'Graph view',
            body:
                'The directed graph renders on the right. Nodes are columns; edges are causal links, annotated with the lag and the p-value.',
            bullets: [
                'Hover — tooltip with the lag, p-value, and the conditional set used by the test',
                'Edge color — encodes the sign / strength of the effect (red/blue, solid/dashed)',
                'Edge label — lag in samples; the axis label below the graph explains the unit conversion',
                'Drag nodes — reposition; the layout is force-based so manual positions decay on rerun',
                'Click an edge — highlights it and pins the tooltip; click again to unpin',
            ],
        },
        {
            title: 'Export',
            body:
                'Export saves the graph as JSON (nodes + edges + per-edge metadata) or as a torch_geometric Data object for downstream ML pipelines.',
            bullets: [
                'JSON — full graph state; safe to import into another tool or session',
                'torch_geometric — Data object with x / edge_index / edge_attr arrays; load with `torch_geometric.data.Data.from_dict(...)`',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥9', description: 'Open the Causal page (this page)' },
        { keys: '⌥2', description: 'Open the Timeseries page — pick your columns there first' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
    ],
    tips: [
        'Start with PCMCI + tau_max = 5 + parcorr. The defaults are tuned for short, roughly-linear, roughly-Gaussian signals.',
        'Switch to PCMCI+ if you expect same-tick causality (e.g. two columns that react to the same external trigger).',
        'Switch the CI test to gpdc or cmiknn when the data is non-linear or has heavy tails — parcorr assumes linearity.',
        'Results depend heavily on the time range and any applied filters. Run on the full dataset first, then narrow once you have a baseline.',
        'Save the session (Ctrl+S) to keep the column selection and method parameters.',
    ],
};

export function initCausalHelp(): () => void {
    return initPageHelp('causal', CAUSAL_HELP);
}
