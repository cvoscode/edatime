/**
 * spectrogramHelp — page-level "?" help for the Spectrogram page.
 *
 * The Spectrogram page is a time-frequency heatmap built from
 * short-time FFTs over the selected numeric column. Users adjust the
 * window / hop size, the color normalization, and the outlier
 * clipping; the help modal covers all of that.
 *
 * Wired from `initSpectrogramPage` so the help loads the first time
 * the user navigates to the page (lazy via `pageModules`).
 */

import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

export const SPECTROGRAM_HELP: PageHelpContent = {
    pageName: 'Spectrogram',
    intro:
        'Time-frequency heatmap of the selected numeric column. The page slides a short FFT window across the signal and stacks the resulting spectra into a heatmap; use it to see how the frequency content of a signal evolves over time.',
    sections: [
        {
            title: 'Display segment',
            body:
                'The first segment picks the column and the FFT window / hop settings.',
            bullets: [
                'Column — which numeric column to compute the spectrogram on; defaults to the first one in the active dataset',
                'Window size — number of samples per FFT window; larger windows give better frequency resolution but worse time resolution (Heisenberg)',
                'Hop size — how far the window slides each step; smaller hops give a denser heatmap but cost more compute',
                'Custom — pick "Custom" in either dropdown to enter an arbitrary value; the input is validated against the dataset length',
            ],
        },
        {
            title: 'Pre-scaling segment',
            body:
                'The second segment applies optional normalization and outlier clipping before the FFT. Same controls as the FFT page.',
            bullets: [
                'Normalize — none (raw values), min-max [0,1], or z-score (subtract mean, divide by std)',
                'Outliers — when enabled, clips the input time series before the STFT to suppress transient spikes',
                'Method — percentile or IQR',
                'Param — the percentile or k value; the hint next to the input tells you which one is active',
            ],
        },
        {
            title: 'Spectrogram chart',
            body:
                'The chart is a 2-D heatmap with time on the x-axis and frequency on the y-axis. Color encodes power; the colorbar on the right shows the active scale.',
            bullets: [
                'X axis — time, shared with the Timeseries chart (or the active linked time range)',
                'Y axis — frequency, in the same units as the FFT page',
                'Color — power at each (time, frequency) bin; the colorscale is normalized per the active setting',
                'Colorbar — shows the active scale; the same options as the FFT page (none / min-max [0,1] / z-score / robust [Q1, Q3])',
                'Hover — tooltip with the (time, frequency, power) triple',
                'Double-click — reset zoom',
                'Drag — box-zoom',
            ],
        },
        {
            title: 'Export',
            body:
                'PNG export captures the current heatmap; CSV export saves the (time, frequency, power) grid for downstream analysis.',
            bullets: [
                'PNG — visual snapshot',
                'CSV — raw (time, frequency, power) triples; safe to import into another tool',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥8', description: 'Open the Spectrogram page (this page)' },
        { keys: '⌥6', description: 'Open the FFT / PSD page — useful for the global spectrum' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'P', description: 'Export the heatmap as PNG' },
        { keys: 'E', description: 'Export the spectrogram data as CSV' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
    ],
    tips: [
        'For slowly-varying signals (temperature, weather), start with a large window (≥256) and a small hop (≤1/4 of the window) for the best time-frequency resolution trade-off.',
        'For spiky signals (network traffic, ECG), a smaller window (≤64) catches transient bursts that a large window would smear.',
        'Switching to first-differences on the Timeseries page first often makes low-frequency noise disappear and reveals the true periodic structure.',
        'Save the session (Ctrl+S) to keep your Window/Hop/Normalize/Clip choices.',
    ],
};

export function initSpectrogramHelp(): void {
    initPageHelp('spectrogram', SPECTROGRAM_HELP);
}
