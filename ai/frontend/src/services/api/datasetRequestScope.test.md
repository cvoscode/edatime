# ai/frontend/src/services/api/datasetRequestScope.test.md
> Unit tests for the dataset request-scope adapter. Verifies scope lifecycle (capture / assert / invalidate) and the in-flight dedupe cache behavior shared with `http.ts`.

## Test Suites

### `datasetRequestScope`
- `starts at scope 0 and increments on invalidation`
  - Confirms `captureDatasetRequestScope()` returns `0` initially and that `invalidateDatasetRequestScope()` returns the new value and updates subsequent captures.
- `throws AbortError when a captured scope is invalidated`
  - Captures a scope, invalidates, and expects `assertDatasetRequestScopeActive` to throw an `Error` with `name === 'AbortError'`.
- `accepts a still-active scope`
  - Captures a scope and confirms `assertDatasetRequestScopeActive` does not throw when the scope has not been invalidated.
- `clears the inflight dedupe cache when invalidated`
  - Asserts that `dedupeInflight` returns the same promise for the same key while pending, but a new promise is returned after `invalidateDatasetRequestScope()` (which clears the inflight map). Drains both promises to avoid dangling timers.
- `removes a dedupe key once the request settles`
  - Asserts that `dedupeInflight` returns a fresh promise for the same key once the previous one has resolved (the key is removed from the inflight map on settle).

## Hooks
- `beforeEach` / `afterEach` call `__resetDatasetRequestScopeForTests()` so each test starts with `scope = 0` and an empty inflight map.

---
[1]: ./datasetRequestScope.md
