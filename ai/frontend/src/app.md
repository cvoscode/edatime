# frontend/src/app.ts
> Main bootstrapping — orchestrates app shell, chart, pages, analytics overlays.

## State Variables
- `const runtime = createAppRuntime()`
- `const _appCleanups: Array<() => void>` — now delegates to `runtime.registerCleanup`

## Page Registration
```typescript
register('fft', { requiresMetadata: true, init: createFftEntrypoint({ getRenderTimeseries: () => renderCurrentData }).init });
register('heatmap', { requiresMetadata: true, init: createHeatmapEntrypoint({ showPage }).init });
register('scatter', { requiresMetadata: true, init: createScatterEntrypoint({ initScatterPage, getMetadata: () => appState.metadata! }).init });
register('spectrogram', { requiresMetadata: true, init: createSpectrogramEntrypoint({ setLoading: setComputeLoading }).init });
register('causal', { requiresMetadata: true, init: createCausalEntrypoint({ getMetadata: () => appState.metadata, chipColor: (col, idx) => getAnalyticsChipColor(col, idx), numericColumns: () => getNumericColumns(appState.metadata), setLoading: setComputeLoading }).init });
register('drift', { requiresMetadata: true, init: createDriftEntrypoint({ initDriftPage, getMetadata: () => appState.metadata! }).init });
```

## Key Functions
- `storeFetchedMetadata(metadata: DatasetMetadata): void`
- `setComputeLoading(btnId, overlayId, loading, label?): void`
- `fetchAndRenderAnalytics(): Promise<void>`
- `ensureChartModules(): Promise<void>`
- `checkWebGPU(): Promise<string | null>`
- `showFatalError(message: string): void`
- `ensureTimeseriesReady(): Promise<void>`
- `renderCurrentData(): void` — via timeseriesPage
- `init(): Promise<void>` — main entry point

## Delegated to sub-modules
- `createAppRuntime` from `./app/runtime.js`
- `register` from `./app/pageRegistry.js`
- `initScatterPage` from `./scatter/scatterPage.js`
- `initDriftPage` from `./drift/driftPage.js`
- `createFftEntrypoint`, `createHeatmapEntrypoint`, `createScatterEntrypoint`, `createSpectrogramEntrypoint`, `createCausalEntrypoint`, `createDriftEntrypoint` from `./features/*/entrypoint.js`

---
[1]: ./app/runtime.md
[2]: ./app/pageRegistry.md
[3]: ./app/pageLifecycle.md
[4]: ./features/fft/entrypoint.md
[5]: ./features/heatmap/entrypoint.md
[6]: ./features/scatter/entrypoint.md
[7]: ./features/spectrogram/entrypoint.md
[8]: ./features/causal/entrypoint.md
[9]: ./features/drift/entrypoint.md