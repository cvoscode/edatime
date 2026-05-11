/**
 * pageLoaders.ts — lazy-load and bootstrap all non-timeseries page modules.
 *
 * Each page module owns its own init function with its own deps interface.
 * This file maps page names → loader functions and provides the
 * ensurePageModuleLoaded() call used by the app shell's router.
 *
 * Page modules that are NOT listed here (timeseries, home, upload) are
 * handled by their own bootstrap files or inline in app.ts.
 */

import { appState } from '../state.js';
import { getAnalyticsChipColor, getNumericColumns } from '../pages/analyticsPageUtils.js';
import { setComputeLoading } from '../app.js'; // app.ts helper; lives here for reuse

/* ── helper: setComputeLoading (imported from app.ts) ── */
// (inline docs below)

// ── Spectrogram ────────────────────────────────────────────────────────────

async function initSpectrogramPage(): Promise<void> {
    const { initSpectrogramPage: init } = await import('../pages/spectrogramPage.js');
    await init({ setLoading: setComputeLoading });
}

// ── FFT ───────────────────────────────────────────────────────────────────

async function initFftPage(): Promise<void> {
    const { initFftPage: init } = await import('../pages/fftPage.js');
    await init({ renderTimeseries: () => {/* handled by timeseriesPageController */ } });
}

// ── Correlation Heatmap ───────────────────────────────────────────────────

async function initHeatmapPage(): Promise<void> {
    const { initHeatmapPage: init } = await import('../pages/heatmapPage.js');
    await init({
        showPage: (name: string) => {
            // imported dynamically to avoid circular dep via appShell; showPage is
            // provided by the app shell router on navigation
            (document.querySelector(`.sidebar .nav-item[data-page="${name}"]`) as HTMLElement)?.click?.();
        }
    });
}

// ── Scatter ───────────────────────────────────────────────────────────────

async function initScatterPage(): Promise<void> {
    const scatterPage = document.getElementById('page-scatter');
    if (!scatterPage) return;
    const { initScatterPage } = await import('../scatter/scatterPage.js');
    await initScatterPage(appState.metadata!);
}

// ── Drift ─────────────────────────────────────────────────────────────────

async function initDriftPage(): Promise<void> {
    const { initDriftPage: init } = await import('../drift/driftPage.js');
    await init(appState.metadata);
}

// ── Causal ────────────────────────────────────────────────────────────────

async function initCausalPage(): Promise<void> {
    const { initCausalPage: init } = await import('../causal/causalPage.js');
    const { initCausalComparison } = await import('../causal/causalComparison.js');
    init({
        getMetadata: () => appState.metadata!,
        chipColor: (col: string, idx: number) => getAnalyticsChipColor(col, idx),
        numericColumns: () => getNumericColumns(appState.metadata),
        setLoading: setComputeLoading,
    });
}

/* ── Registry ────────────────────────────────────────────────────────────── */

export const pageModuleLoaders: Record<string, () => Promise<void>> = {
    scatter: initScatterPage,
    scattermatrix: initScatterPage,
    heatmap: initHeatmapPage,
    spectrogram: initSpectrogramPage,
    causal: initCausalPage,
    fft: initFftPage,
    drift: initDriftPage,
};

const _loadedPageModules = new Set<string>();
let _metadataReady = false;

/**
 * Load and initialise a page module (once). Waits for metadata readiness
 * before invoking the loader so that page modules can rely on appState.metadata.
 */
export async function ensurePageModuleLoaded(page: string): Promise<void> {
    if (_loadedPageModules.has(page)) return;

    const loader = pageModuleLoaders[page];
    if (!loader) return;

    if (!_metadataReady) {
        await new Promise<void>((resolve) => {
            const onReady = () => {
                window.removeEventListener('edatime:metadata-ready', onReady);
                resolve();
            };
            window.addEventListener('edatime:metadata-ready', onReady);
        });
    }

    try {
        await loader();
        _loadedPageModules.add(page);
    } catch (error: unknown) {
        console.error(`Failed to load page module for ${page}:`, error);
    }
}

/** Call after metadata is first fetched so subsequent ensurePageModuleLoaded()
 *  calls don't wait for the metadata-ready event again. */
export function markMetadataReady(): void {
    _metadataReady = true;
}

/** Returns true if metadata has been marked ready (or was already ready). */
export function isMetadataReady(): boolean {
    return _metadataReady;
}

/** Clear the loaded page module cache so pages re-initialize on next visit.
 *  Called by ensureDatasetReady() when a new dataset is loaded. */
export function clearLoadedPageModules(): void {
    _loadedPageModules.clear();
}