# frontend/src/platform/requestTask.ts
> Abortable single-flight request helper with a run-token guard. Older runs cannot clear loading state or surface errors for a newer request.

## Interfaces
- `RequestTaskOptions`
  - `setLoading: (loading: boolean) => void`
  - `onError: (message: string) => void`

## Functions
- `createRequestTask(options: RequestTaskOptions): { getSignal, run, cancel }`
  - `getSignal(): AbortSignal` — returns the current controller's signal (or a never-aborted `AbortController().signal` when no request is pending).
  - `run(fn: (signal: AbortSignal) => Promise<void>): Promise<void>` — aborts any prior request, increments the run token, calls `fn(signal)`. Swallows `AbortError`. Only the latest run's `setLoading(false)` and `onError` calls take effect.
  - `cancel(): void` — aborts the in-flight request without throwing.