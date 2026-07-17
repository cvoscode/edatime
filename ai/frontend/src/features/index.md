# frontend/src/features/
> Feature-scoped entrypoints and page modules. Each feature is a single folder
> containing `index.ts` (public surface), `page.ts` (page entry when present),
> `runtime.ts` (page lifecycle), `help.ts` (page help wiring), `state.ts` (page-local
> state if needed), plus feature-specific modules.

## Feature map

| Feature | Public surface (`index.ts`) | Page |
| --- | --- | --- |
| `timeseries/` | `createTimeseriesModule`, `sanitizeSelectedColumns`, `initChartPageFilterGesture`, `initTimeseriesHelp`, `initAdaptiveFilterGesture`, `createAnalyticsOverlayController`, `initAnalyticsListeners` | `pages/timeseries.html` |
| `scatter/` | `disposeScatterPage`, `initScatterPage`, `SCATTER_PLOT_GRID` | `pages/scatter.html` |
| `causal/` | `disposeCausalPage`, `initCausalPage`, `getCurrentCausalGraph` | `pages/causal.html` |
| `drift/` | (initialised via `features/drift/page.ts`) | `pages/drift.html` |
| `fft/` | (initialised via `features/fft/page.ts`) | `pages/fft.html` |
| `heatmap/` | (initialised via `features/heatmap/page.ts`) | `pages/heatmap.html` |
| `spectrogram/` | (initialised via `features/spectrogram/page.ts`) | `pages/spectrogram.html` |
| `upload/` | `initUploadPanel`, `hydrateColumnProfiles`, `initColumnProfilesGrid`, `renderColumnProfilesGrid`, `initUploadHelp` | inside the timeseries page |
| `home/` | `initHomePage`, sample-dataset buttons | `pages/home.html` |
| `dataMutation/` | Data-mutation modal opening helpers | — |
| `export/` | Filter-aware export helpers (Parquet, CSV, JSON) | — |
| `prepare/` | Per-feature prepare hooks (column selection validation, etc.) | — |
| `shared/` | Cross-feature contracts (`featureContract.md`) | — |

## Cross-cutting notes

- Each feature exposes an `init…Page()` function (and sometimes `dispose…Page()`)
  registered through `frontend/src/app/pageModules.ts`.
- Feature pages share lifecycle infrastructure via `frontend/src/platform/pageLifecycle.ts`.
- Feature pages emit store events through `frontend/src/store/events.ts`.
- Per-feature runtimes (`features/*/runtime.ts`) replaced the older
  `frontend/src/pages/shared/analysisPageRuntime.ts`.
