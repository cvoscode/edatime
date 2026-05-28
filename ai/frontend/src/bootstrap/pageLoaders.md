# ai/frontend/src/bootstrap/pageLoaders.md
> Dynamic page loading based on route — lazy-loads and bootstraps non-timeseries page modules.

## Functions
- `ensurePageModuleLoaded(page: string): Promise<void>`
  - Load and initialize a page module (once). Waits for metadata readiness before invoking the loader.
- `markMetadataReady(): void`
  - Call after metadata is first fetched so subsequent ensurePageModuleLoaded calls do not wait for the metadata-ready event again.
- `isMetadataReady(): boolean`
  - Returns true if metadata has been marked ready (or was already ready).
- `clearLoadedPageModules(): void`
  - Clear the loaded page module cache so pages re-initialize on next visit. Called when a new dataset is loaded.

## Constants
- `pageModuleLoaders: Record<string, () => Promise<void>>`
  - Registry mapping page names to their async loader functions (scatter, scattermatrix, heatmap, spectrogram, causal, fft, drift).
