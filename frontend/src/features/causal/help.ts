import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

export const CAUSAL_HELP: PageHelpContent = {
    pageName: 'Causality',
    intro: 'Explore candidate directional lag relationships using native Rust implementations of PCMCI-family methods. Observational results depend on assumptions; a small p-value is not a probability that an edge is causal.',
    sections: [
        { title: 'Methods and assumptions', bullets: [
            'PCMCI selects candidate lagged parents, then tests conditional independence. PCMCI+ also considers contemporaneous relationships.',
            'LPCMCI addresses possible latent confounders; it does not remove stationarity requirements or automatically handle changing regimes.',
            'FullCI conditions on the full lagged variable set. BivCI uses pairwise tests without controlling for other series.',
            'Check time order, regular sampling, stationarity, measurement coverage, and plausible confounders. Unmeasured confounding and aggregation can change the interpretation.',
        ] },
        { title: 'Time range and point budget', bullets: [
            'Choose the full working range or the Signals viewport. Enabled Preparation stages apply to both.',
            'The point budget bounds computation. Continuous data above the budget are averaged into evenly spaced bins spanning the entire range. No tail is discarded.',
            'Read the returned source coverage, analyzed point count, and effective cadence. Lag 1 is one analyzed time step; the maximum lag is also shown as a duration.',
            'Averaging can blur short effects and alter graph structure. Narrow the range or increase the budget for shorter lags. Symbolic tests require exact observations.',
        ] },
        { title: 'Parameters', bullets: [
            'Max lag sets the largest tested delay. Alpha sets the final p-value cutoff; PC alpha controls candidate parent selection for PCMCI, PCMCI+, and LPCMCI.',
            'ParCorr tests linear partial correlation. RobustParCorr uses a rank-based transform. CMI-KNN is a nonlinear continuous-data test with higher compute cost.',
            'G-squared and CMI-Symb require suitable discrete categories; do not treat arbitrary continuous measurements as categories.',
            'Max conditioning dimension bounds candidate conditioning sets. BH FDR adjusts the tested family; no FDR means unadjusted p-values.',
        ] },
        { title: 'Results and export', body: 'The graph groups links by node pair. Inspect per-link direction, lag, statistic, and p-value in the evidence view. Graph JSON and model exports include sampling metadata. Manual graph edits are analyst hypotheses, not statistical discoveries.' },
        { title: 'Graph editing and run comparison', bullets: [
            'Select + Edge, then click two nodes to add a link from the first to the second. Press Escape to cancel.',
            'Right-click a node or link to edit its attributes or delete it. Edits change the displayed graph and exports, not the computed evidence.',
            'Save Run keeps the current graph in this browser (up to 20 runs). With two saved runs, compare them to see added, removed, and changed links.',
        ] },
    ],
    tips: ['Start with a small set of scientifically plausible variables and inspect the Signals page before choosing lags.', 'Check whether conclusions survive reasonable ranges, preprocessing, lag limits, and tests.'],
};
export function initCausalHelp(): () => void { return initPageHelp('causal', CAUSAL_HELP); }
