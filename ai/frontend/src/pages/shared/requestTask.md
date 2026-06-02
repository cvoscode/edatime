# ai/frontend/src/pages/shared/requestTask.md
> Shared abortable request lifecycle helper for page controllers that need abort-before-new semantics and standardized loading/error hooks.

## Interface: RequestTaskOptions
- `setLoading: (loading: boolean) => void`
- `onError: (message: string) => void`

## Functions
- `createRequestTask(options: RequestTaskOptions): { getSignal(): AbortSignal; run(fn: (signal: AbortSignal) => Promise<void>): Promise<void>; cancel(): void }`
  - Creates a single-flight request helper that replaces the active `AbortController`, ignores `AbortError`, and forwards other failures.
