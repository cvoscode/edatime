/**
 * fftHelp — page-level "?" help for the FFT / PSD page.
 *
 * The FFT page transforms selected numeric columns from the time
 * domain to the frequency domain. Two display modes (Magnitude vs
 * PSD), optional log scale, optional pre-scaling (normalize + clip),
 * and per-trace overlays. The help modal covers all of that.
 *
 * Wired from `initFftPage` so the help loads the first time the user
 * navigates to the page (lazy via `pageModules`).
 */

import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

export const FFT_HELP: PageHelpContent = {
    pageName: 'Spectrum',
    intro:
        'Frequency-domain view of the selected numeric columns. Every visible series on the Timeseries page gets its own FFT trace here; choose Magnitude or PSD, scale, then look for peaks that dominate the spectrum.',
    sections: [
        {
            title: 'Display segment',
            body:
                'The first segment picks the display mode and the vertical scale.',
            bullets: [
                'Mode — Magnitude (raw amplitude) or PSD (power spectral density; integrates energy over a frequency band)',
                'Log scale — when on (default), the y-axis is in dB; useful when peaks span many orders of magnitude',
                'Linear scale — when off, y-axis is the raw amplitude; useful for short, peaky signals',
            ],
        },
        {
            title: 'Pre-scaling segment',
            body:
                'The second segment applies optional normalization and outlier clipping before the FFT. The same controls are mirrored on the Spectrogram page.',
            bullets: [
                'Normalize — none (raw values), min-max [0,1], or z-score (subtract mean, divide by std)',
                'Outliers — when enabled, clips the input time series before the FFT to suppress transient spikes that would otherwise dominate the spectrum',
                'Method — percentile (clip above/below a percentile) or IQR (clip outside Q1 − k·IQR … Q3 + k·IQR)',
                'Param — the percentile or k value; the hint next to the input tells you which one is active',
            ],
        },
        {
            title: 'FFT chart',
            body:
                'Each numeric column from the Timeseries chart is plotted as its own line, sharing the x-axis (frequency in Hz). Peaks in a trace line up with periodic components in the original signal.',
            bullets: [
                'X axis — frequency, scaled to the time window of the data (a 60-second window reaches 30 Hz, a 1-day window reaches ~5.8 µHz)',
                'Y axis — amplitude (Magnitude mode) or power (PSD mode); log scale shows dB',
                'Hover — tooltip with frequency, amplitude, and the originating column',
                'Double-click — reset zoom to the full frequency range',
                'Drag — box-zoom on either axis',
            ],
        },
        {
            title: 'Export',
            body:
                'PNG / SVG / HTML capture the visual; CSV saves the frequency grid and the per-trace amplitude (or PSD) values for downstream analysis.',
            bullets: [
                'PNG / SVG — visual snapshot for slides and documentation',
                'HTML — single-file with the FFT traces visible',
                'CSV — raw frequency column plus one column per trace; safe to import into another tool',
            ],
        },
        {
            title: 'How the help button works',
            body:
                'Every page has its own "?" button like this one. Hover or focus it for a one-line title; click for the full guide. Press Esc to close, or click outside the dialog. Toolbar-level "?" icons open a smaller inline tip with the same content.',
        },
    ],
    shortcuts: [
        { keys: '⌥6', description: 'Open the FFT / PSD page (this page)' },
        { keys: '⌥8', description: 'Open the Spectrogram page — useful for time-localized frequency content' },
        { keys: '?', description: 'Show the global keyboard shortcuts modal' },
        { keys: 'P', description: 'Export the chart as PNG' },
        { keys: 'E', description: 'Export the FFT traces as CSV' },
        { keys: 'Ctrl+K', description: 'Command palette — every action above is searchable here' },
    ],
    tips: [
        'If the FFT looks dominated by a single huge spike at low frequency, the data has a slow trend — switch to first-differences on the Timeseries page first, or enable Outlier clipping here.',
        'Pre-scaling is mostly cosmetic for visual interpretation but does not change the underlying frequency content. Use it for side-by-side comparison of columns with different units.',
        'Switch to PSD when you care about power in a band; stick with Magnitude when you care about the amplitude of a specific peak.',
        'Save the session (Ctrl+S) to keep your Mode/Scale/Pre-scaling choices; otherwise they reset on reload.',
    ],
};

export function initFftHelp(): () => void {
    return initPageHelp('fft', FFT_HELP);
}
