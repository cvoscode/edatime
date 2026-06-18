# ai/frontend/src/app.md
> Frontend orchestrator. Boots the shell, lazy-loads data transport and chart constructors, wires global shortcuts, and hands the timeseries page off to `timeseriesModule`.

## State
- `_appCleanups: Array<() => void>`
- `runtime: ReturnType<typeof createAppRuntime>`
- `timeseriesModule: ReturnType<typeof createTimeseriesModule> | null`
- `fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null`
- `fetchData: ((start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>) | null`
- `fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null`
- `postTransform: ((expression: string, outputName: string) => Promise<TransformResponse>) | null`
- `DataChartCtor: (new (containerId: string, onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null`
- `__edatime.state` points at `appStateComposite` from [store/index.md][1].

## Functions
- `ensureDataModules(): Promise<void>`
  - Lazy-loads the shared API transport via [ensureDataModules][2].
- `ensurePrimaryChartCtor(): Promise<new (...) => ChartInstance>`
  - Lazy-loads the `DataChart` constructor via [ensureChartModules][3] and caches it.
- `fetchAndRenderAnalytics(): Promise<void>`
  - Forwards to the analytics overlay fetch helper with the lazily loaded anomaly transport.
- `ensureSessionPersistenceStarted(): void`
  - Starts session persistence once.
- `init(): Promise<void>` [deps: [initAppShell][4], [loadPageDescriptors][5], [initGlobalShortcuts][6], [initTimeseriesShortcuts][7], [createTimeseriesModule][8]]
  - Boots the app shell, loads the timeseries module, mounts page descriptors, installs global and timeseries shortcuts, and triggers the initial dataset bootstrap when needed.

---
[1]: ./store/index.md
[2]: ./app/bootstrap/chartBootstrap.md#ensureDataModules
[3]: ./app/bootstrap/chartBootstrap.md#ensureChartModules
[4]: ./app/shell.md#initAppShell
[5]: ./app/pageModules.md#loadPageDescriptors
[6]: ./app/bootstrap/globalShortcuts.md#initGlobalShortcuts
[7]: ./app/bootstrap/timeseriesShortcuts.md#initTimeseriesShortcuts
[8]: ./pages/timeseriesModule.md#createTimeseriesModule
