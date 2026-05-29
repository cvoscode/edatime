# frontend/src/app.ts
> Main bootstrapping — orchestrates app shell, chart, pages, analytics overlays.

## State Variables

```typescript
const runtime = createAppRuntime()
const _appCleanups: Array<() => void>  // legacy — now delegates to runtime
let fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null
let fetchData: ((start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>) | null
let fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null
```

**`runtime`** — created via `createAppRuntime()` from `./app/runtime.js`. Provides centralized cleanup tracking and disposal.

**`registerCleanup`** — now sourced from `runtime.registerCleanup` instead of pushing to `_appCleanups`.

## Key Functions

### `setComputeLoading(btnId, overlayId, loading, label?): void`
- Set a compute button + loading overlay into loading or idle state.

### `storeFetchedMetadata(metadata: DatasetMetadata): void`
- Store metadata and dataset revision in sub-states.

### `fetchAndRenderAnalytics(): Promise<void>`
- Lazy-imports and fetches anomaly regions for overlay.

### Internal bootstrap
- `ensureChartModules(): Promise<void>` — lazy-loads data client and DataChart
- `checkWebGPU(): Promise<string | null>` — checks WebGPU availability
- `showFatalError(message: string): void`
- `ensureTimeseriesReady(): Promise<void>`
- `ensureDatasetReady(pageName?): Promise<void>`
- `refreshDatasetAfterMutation(options?): Promise<void>`
- `init(): Promise<void>` — main entry point

### Page controller factory
- `createTimeseriesPageController(deps)` — creates timeseries page controller

## Re-exports (from sub-modules)

- `DEBUG, dbg, dbgGroup` — from `../debug.js`
- `appState, SERIES_COLORS, setMetaText, buildMetaBar, sanitizeSelectedColumns, applyColumnRanges, buildAdaptiveLineY` — from `../state.js`
- `buildColumnToggles, buildRangeControls, initColumnFilterModal` — from `../ui/columns.js`
- `setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata, initUploadPanel` — from `../ui/upload.js`
- `hydrateColumnProfiles, renderColumnProfilesGrid, initColumnProfilesGrid` — from `../ui/profile.js`
- `installWindowsWebGpuRequestAdapterWorkaround, requestGpuAdapter` — from `../utils/platform.js`
- `getDefaultTimeseriesColumns, getNumericColumns` — from `../pages/analyticsPageUtils.js`
- `fetchAnomalyRegions, computeAndSetRollingBands, cancelAnalyticsFetch` — from `../bootstrap/analyticsOverlay.js`
- `initAppShell` — from `../bootstrap/appShell.js`
- `createAppRuntime` — from `../app/runtime.js`
- `ensurePageModuleLoaded, isMetadataReady, markMetadataReady, clearLoadedPageModules` — from `../bootstrap/pageLoaders.js`
- `restoreSessionAfterChartReady, startSessionPersistence` — from `../bootstrap/sessionBootstrap.js`
- `getHashPage` — from `../utils/router.js`
- `pageNeedsDatasetBootstrap` — from `../utils/pageBootstrap.js`
- `initDatasetSearchInputs, initTimeseriesActions` — from `../bootstrap/timeseriesBootstrap.js`
- `initSeriesCollapse` — from `../ui/columns.js`
- `updateAnalysisZoom, updateAnalysisYRange, refreshZoomControlsState, getCurrentView, zoomOut, resetZoom, initAnalysisControls, bindAnalysisChartEvents, initChartPageFilterGesture, initPages` — from `../ui/toolbar.js`
- `registerChartType, getChartType` — from `../charts/registry.js`
- `FallbackChart` — from `../charts/fallback.js`
- `initAnnotations, setAnnotationOverlayCallback` — from `../chart/annotations.js` and `../ui/annotationPanel.js`
- `setAnomalyOverlayCallback` — from `../bootstrap/analyticsOverlay.js`
- `toast` — from `../utils/toast.js`
- Store setters: `appendAdaptiveLineFilter, setAdaptiveFilterColumn, setAnalysisBound, setChartInstance, setDatasetRevision, setInitialView, setMetadata, setNumericCols, setPendingAdaptivePoint, setRollingBands, setSelectedCols, setViewport` — from `../store/index.js`