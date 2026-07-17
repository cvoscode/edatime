# frontend/src/platform/lifecycleScope.ts
> Owns disposable browser resources for one application or feature lifetime. Controllers register listeners, timers, requests, and imperative renderers here instead of keeping independent cleanup arrays. Disposal is idempotent, aborts in-flight work first, and still runs every cleanup if one fails.

## Interfaces
- `LifecycleScope`
  - `readonly signal: AbortSignal` — propagated to abortable work.
  - `readonly disposed: boolean`
  - `add(cleanup: () => void): () => void` — registers a cleanup; immediate-call when disposed; returns a remover.
  - `listen(target, type, listener, options?): () => void` — `addEventListener` paired with the same `removeEventListener` on scope dispose.
  - `timeout(callback, delayMs): () => void` — `setTimeout` paired with `clearTimeout` on scope dispose.
  - `dispose(): void` — idempotent. Sets `disposed = true`, calls `controller.abort()`, runs every cleanup in reverse order. Aggregates thrown errors via `AggregateError`.

## Functions
- `createLifecycleScope(): LifecycleScope`