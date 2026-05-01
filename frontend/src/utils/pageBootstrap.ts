const DATASET_BOOTSTRAP_PAGES = new Set([
    'timeseries',
    'scatter',
    'scattermatrix',
    'fft',
    'heatmap',
    'spectrogram',
    'causal',
    'drift',
]);

export function pageNeedsDatasetBootstrap(pageName: string | null | undefined): boolean {
    return Boolean(pageName && DATASET_BOOTSTRAP_PAGES.has(pageName));
}