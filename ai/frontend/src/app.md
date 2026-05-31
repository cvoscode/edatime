# frontend/src/app.ts
> Slim orchestrator — wires all domain modules, initializes chart runtime, and bootstraps the session.

## State

```typescript
let _timeseriesReady: boolean
let _timeseriesReadyPromise: Promise<void> | null
let _sessionPersistenceStarted: boolean
const _appCleanups: Array<() => void>
const runtime: ReturnType<typeof createAppRuntime>
const timeseriesPage: ReturnType<typeof createTimeseriesPageController>
```

## Functions

### ensureSessionPersistenceStarted
- `ensureSessionPersistenceStarted(): void`
  - Starts session persistence once (`startSessionPersistence`). Idempotent.

### ensureTimeseriesReady
- `ensureTimeseriesReady(): Promise<void>`
  - Initializes ChartGPU (or fallback) once; runs adaptive gesture binding, overlay callbacks, chart text, initial render, and session restore. Returns early if already ready.

### fetchAndRender
- `fetchAndRender(): Promise<void>`
  - Ensures timeseries ready then calls `timeseriesPage.fetchAndRender()`.

### renderCurrentData
- `renderCurrentData(): void`
  - Delegates to `timeseriesPage.renderCurrentData()`.

### emitChartRangeChange
- `emitChartRangeChange(sourceKind?: string): void`
  - Emits chart range change via `timeseriesPage.emitChartRangeChange()`.

### onZoomRangeChange
- `onZoomRangeChange(newStart: number, newEnd: number, sourceKind?: string): void`
  - Delegates to `timeseriesPage.onZoomRangeChange()`.

---
[1]: ./app/runtime.md
[2]: ./app/pageRegistry.md
[3]: ./app/shell.md
[4]: ./app/webgpuGuard.md
[5]: ./app/adaptiveGesture.md
[6]: ./app/pageModules.md
[7]: ./bootstrap/sessionBootstrap.md
[8]: ./bootstrap/analyticsOverlay.md
[9]: ../store/index.md
[10]: ../ui/toolbar.md
[11]: ../ui/upload.md
[12]: ../ui/profile.md
[13]: ../chart/annotations.md