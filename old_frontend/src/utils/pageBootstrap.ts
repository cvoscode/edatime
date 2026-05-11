/**
 * Pages that trigger eager dataset bootstrap on initial navigation.
 *
 * Upload is intentionally excluded so the ingest page stays source-first
 * and does not waste startup budget on metadata/data/status fetches before
 * the user chooses a File or Database ingestion path.
 */
const DATASET_BOOTSTRAP_PAGES = new Set([
    'timeseries',
    'scatter',
    'fft',
    'heatmap',
    'spectrogram',
    'causal',
    'drift',
]);

export function pageNeedsDatasetBootstrap(pageName: string | null | undefined): boolean {
    return Boolean(pageName && DATASET_BOOTSTRAP_PAGES.has(pageName));
}

/**
 * Pages that load analysis-specific module code lazily on first visit.
 * These are "advanced" surfaces that users enter after the core workflow
 * has been explored. They do not need the dataset ready to render.
 */
export const LAZY_ANALYSIS_PAGES = new Set([
    'fft',
    'spectrogram',
    'causal',
    'drift',
]);

export function isLazyAnalysisPage(pageName: string | null | undefined): boolean {
    return Boolean(pageName && LAZY_ANALYSIS_PAGES.has(pageName));
}

/**
 * Core workflow pages that should always be quick to navigate to.
 * These are the primary path: Upload → Timeseries → Correlations → Scatter.
 */
export const CORE_WORKFLOW_PAGES = new Set([
    'home',
    'upload',
    'timeseries',
    'correlations',
    'scatter',
]);

export function isCoreWorkflowPage(pageName: string | null | undefined): boolean {
    return Boolean(pageName && CORE_WORKFLOW_PAGES.has(pageName));
}