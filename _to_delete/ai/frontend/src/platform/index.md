# frontend/src/platform/
> Platform / cross-feature infrastructure. Provides page lifecycle, page runtime,
> request-task runner, feature events, navigation events, session lifecycle,
> lifecycle scope, analysis runtime, analytics columns, and the runtime module
> registry. Used by both `frontend/src/app/*` and `frontend/src/features/*`.

## Files

| File | Role |
| --- | --- |
| `pageLifecycle.ts` | Shared `createPageLifecycle({ page, init, onVisible, onEveryPageChange })` factory. |
| `pageRuntime.ts` | Per-page runtime host shared between time-series and scatter pages. |
| `requestTask.ts` | Cancellable async task wrapper with progress + cleanup hooks. |
| `featureEvents.ts` | Cross-feature event bus for feature-to-feature coordination. |
| `navigationEvents.ts` | Page navigation event emitter and subscriber. |
| `sessionLifecycle.ts` | Bootstrap and tear-down of an in-app session (open/close dataset, scroll memory, etc.). |
| `lifecycleScope.ts` | Async scope for cleanup-on-page-leave. |
| `analysisRuntime.ts` | Analysis-task runtime shared by the analytics drawer, anomaly panel, and FFT/Spectrogram pages. |
| `analyticsColumns.ts` | Column-set helpers shared by the analytics surface. |
| `runtimeModules.ts` | Module registration table and lookup helpers. |

> Migration note: The previous `frontend/src/app/pageLifecycle.ts` and
> `frontend/src/app/runtime.ts` were moved here. The previous
> `frontend/src/pages/shared/analysisPageRuntime.ts` was **retired** in favor
> of per-feature runtimes (`features/{fft,heatmap,spectrogram,causal,drift,scatter}/runtime.ts`).
