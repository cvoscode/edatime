/**
 * homePage — Home page wiring.
 *
 * The Home page is the simplest page in the app: it shows a hero, a
 * grid of sample datasets, a recommended workflow, an advanced
 * analyses block, and a keyboard-shortcut summary. It has no heavy
 * module dependencies, so this init is intentionally tiny.
 *
 * Currently it only wires the page-level "?" help button. The rest of
 * the page (cards, sample datasets, theme, navigation) is wired by
 * the existing `wireSampleDatasetCards` and `wireHomeNavigationCards`
 * subsystems that live in `app/shell/`.
 */

import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

/**
 * Content of the Home help modal. Kept terse + bullet-driven to match
 * the existing UI voice on this page (home cards, section copy, etc.).
 * The intro is two short sentences; each section is one block of
 * bullets or a short paragraph.
 */
export const HOME_HELP: PageHelpContent = {
    pageName: 'Home',
    intro:
        'EdaTime is an interactive time-series analytics app. Start by uploading a CSV or Parquet file, or pick a sample dataset below to explore the workflow without preparing data.',
    sections: [
        {
            title: 'What this page is for',
            body:
                'A starting point that gets you into the right page fast. The hero up top is your primary entry into Upload; the sample datasets let you try the full workflow without a file; the workflow and advanced analyses blocks describe the page layout.',
        },
        {
            title: 'Sections on this page',
            bullets: [
                'Hero — primary CTA into the Upload page',
                'Sample datasets — built-in data to explore the workflow',
                'Recommended workflow — Upload → Timeseries → Correlations → Scatter',
                'Advanced analyses — FFT, Spectrogram, Causal, Drift',
                'Keyboard shortcuts — quick reference for navigation and chart controls',
            ],
        },
        {
            title: 'How to get started',
            body:
                'Click "Upload a file to get started" for your own data, or pick a sample dataset below. The first card (ETTm2) is a good first stop — it lands you in the Timeseries page with a 7-column sensor dataset ready to chart.',
            bullets: [
                'ETTm2 Sensor Data — 69K rows, 7 columns; best first stop: Timeseries',
                'Sinusoidal Waves — 10K rows, 4 columns; best for FFT / Spectrogram',
                'Weather Patterns — 50K rows, 6 columns; best for Correlations',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥1', description: 'Open the Upload page' },
        { keys: '⌥2', description: 'Open the Timeseries page' },
        { keys: '⌥3', description: 'Open the Scatter page' },
        { keys: '⌥4', description: 'Open the Scatter matrix view' },
        { keys: '⌥6–0', description: 'FFT, Correlations, Spectrogram, Causal, Drift' },
        { keys: 'Ctrl+K', description: 'Command palette' },
        { keys: 'Ctrl+I', description: 'Analysis context panel' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
    ],
    tips: [
        'If WebGPU is unavailable, EdaTime falls back to a Canvas chart — see the indicator next to the page title.',
        'The guided Workflow panel in the header walks you through the recommended order for a new dataset.',
        'Press Ctrl+S to save your session at any time, including filters, zoom, and color choices.',
    ],
};

export function initHomePage(): () => void {
    return initPageHelp('home', HOME_HELP);
}
