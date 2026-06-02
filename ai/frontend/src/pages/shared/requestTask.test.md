# ai/frontend/src/pages/shared/requestTask.test.md
> Tests `createRequestTask` signal ownership, loading transitions, abort swallowing, and cancel semantics.

## Tests
- **getSignal before run**
  - Verifies `getSignal()` returns a non-aborted signal before any request starts.
- **getSignal after run**
  - Verifies `getSignal()` returns the active request signal.
- **loading transitions**
  - Verifies `run()` toggles loading on success and non-abort failures.
- **abort swallowing**
  - Verifies `AbortError` and signal-driven cancellation do not call `onError`.
- **abort-before-new**
  - Verifies a later `run()` aborts the previous request.
- **cancel semantics**
  - Verifies `cancel()` aborts the current request and is safe when idle.
