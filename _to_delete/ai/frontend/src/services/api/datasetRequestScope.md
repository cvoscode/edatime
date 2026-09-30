# ai/frontend/src/services/api/datasetRequestScope.md
> Service-owned dataset request-scope adapter. A monotonically increasing counter that invalidates inflight requests whenever the underlying dataset changes (e.g. partial upload). Shares state with `http.ts` so dedupe cache and request scope stay consistent.

## State
- `datasetRequestScope: number` — module-level counter.
- `inflight: Map<string, Promise<unknown>>` — module-level in-flight request map.

## Functions

### captureDatasetRequestScope
- `captureDatasetRequestScope(): number`
  - Returns the current scope value. Callers capture it before issuing a long-lived request so they can detect staleness after the response.

### assertDatasetRequestScopeActive
- `assertDatasetRequestScopeActive(scope: number): void`
  - Throws a synthetic `AbortError` (`new Error('Stale response ignored after dataset change')` with `name = 'AbortError'`) if `scope !== datasetRequestScope`.

### invalidateDatasetRequestScope
- `invalidateDatasetRequestScope(): number`
  - Increments the counter and clears the inflight map. Returns the new value.

### dedupeInflight
- `dedupeInflight<T>(key: string, factory: () => Promise<T>): Promise<T>`
  - Service-internal dedupe. Reuses an existing in-flight promise if `key` matches; otherwise registers a new one and removes it on settle. Shared with `http.ts`.

### __resetDatasetRequestScopeForTests
- `__resetDatasetRequestScopeForTests(): void`
  - Test-only: clears the inflight map and resets the scope counter to `0`.

## Wiring
- `datasetBootstrap.ts` captures the scope before fetching metadata, asserts it is still active after the response, and invalidates whenever a dataset mutation occurs.
- `http.ts` re-exports `captureDatasetRequestScope`, `assertDatasetRequestScopeActive`, and `invalidateDatasetRequestScope` to preserve the public contract.

---
[1]: ./http.md
[2]: ../../app/bootstrap/datasetBootstrap.md
