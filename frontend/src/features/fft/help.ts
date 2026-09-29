import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';

export const FFT_HELP: PageHelpContent = {
    pageName: 'Spectrum',
    intro: 'Find recurring cycles in selected numeric traces over the Signals time range. Spectrum has an independent trace selection, initially the first two numeric columns, and remembers that selection.',
    sections: [
        { title: 'Input processing', bullets: [
            'Detrend: None retains the level; Remove mean subtracts the average; Remove linear trend subtracts a fitted straight line before the transform.',
            'A symmetric Hann window reduces leakage. Magnitude corrects its coherent gain. PSD uses sample-rate and window-energy normalization.',
            'The point budget bounds work. Larger inputs are averaged over equal-width bins covering the selected range. The returned effective cadence determines Nyquist and the shortest resolvable period.',
            'The source must have an ascending regular time grid. Masked observations retain their time positions and contribute no centered value; extensive gaps can bias spectra. Review missing counts in export provenance.',
        ] },
        { title: 'Display', bullets: [
            'Magnitude is one-sided amplitude in signal units, with coherent-gain correction. PSD is a one-sided periodogram in signal²/Hz; a frequency-band sum times bin width estimates mean-square signal power, not total energy.',
            'Log displays log10 of positive spectral values. It is not decibels. A normalized or clipped display no longer has the raw physical units.',
            'Normalize and Clip plotted values act on returned spectral ordinates only. They do not remove time-domain spikes, recompute the transform, or change the ranked raw peaks.',
            'To change time-domain outliers, add an explicit Preparation rule and recompute. To reveal cycles beneath a slow trend, try Remove linear trend and compare the results.',
        ] },
        { title: 'Resolution', body: 'Frequency spacing depends on analyzed duration; the highest frequency depends on effective cadence. Narrow the Signals range or raise the point budget to retain shorter cycles. Peaks may reflect trend, leakage, or nonstationarity rather than a stable recurring process.' },
        { title: 'Export', body: 'PNG, SVG, and HTML capture the display. CSV exports raw magnitudes or PSD before Normalize, Clip, or log10. Provenance records detrending, Hann window, estimator, units, range, missing observations, and sampling.' },
    ],
};
export function initFftHelp(): () => void { return initPageHelp('fft', FFT_HELP); }
