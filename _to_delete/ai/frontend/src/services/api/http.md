# frontend/src/services/api/http.ts
> Core HTTP fetch helpers for the API service layer: JSON / Blob GET/POST/DELETE, dataset request-scope dedupe, Arrow IPC parsing utilities, timestamp resolution, response-shape assertion helpers, and structured error extraction. Dataset request-scope state and `dedupeInflight` are owned by `datasetRequestScope.ts` and re-exported here for backward-compatible imports.

## Types
- `ApiRequestOptions { signal?: AbortSignal; datasetScoped?: boolean }`
  - Options accepted by API request helpers. `signal` is forwarded to `fetch`. `datasetScoped` defaults to `true`; database status/table/connect calls and session jobs pass `false`.
- `TableFromIPCFn = (buffer: ArrayBuffer) => ArrowTable`
  - Lazy-resolved Arrow decoder signature.
- `ArrowTable { schema?: { fields?: Array<{ name?: string; type?: unknown }> }; numRows: number; getChild(name: string): ArrowColumn | null }`
- `ArrowColumn { get(index: number): unknown }`
- `ApiErrorPayload { error?: unknown; message?: unknown; code?: unknown; correlation_id?: unknown }` (internal)

## Functions

### Request helpers
- `getJson<T>(url: string, label: string, options?: ApiRequestOptions): Promise<T>` [deps: [readApiError][1], [datasetRequestScope][2]]
  - GET with dedupe and JSON parsing; throws `readApiError(res, label)` on non-OK status.
- `getBlob(url: string, label: string, options?: ApiRequestOptions): Promise<Blob>` [deps: [datasetRequestScope][2]]
  - Same contract as `getJson` but returns the raw response body as a `Blob`.
- `postJson<T>(url: string, body: unknown, label: string, options?: ApiRequestOptions): Promise<T>` [deps: [datasetRequestScope][2]]
  - POST with `Content-Type: application/json`, dedupe key includes JSON-stringified body.
- `postBlob(url: string, body: unknown, label: string, options?: ApiRequestOptions): Promise<Blob>` [deps: [datasetRequestScope][2]]
  - POST returning `Blob` (used by parquet export etc.).
- `deleteJson<T>(url: string, label: string, options?: ApiRequestOptions): Promise<T>` [deps: [datasetRequestScope][2]]
  - DELETE with `cache: 'no-store'` and JSON response body.

### Error parsing
- `readApiError(response: Response, label: string): Promise<Error & { status?: number; code?: string; correlationId?: string }>` [deps: [debug][1]]
  - Extracts error message from JSON `message` / `code` / `correlation_id` fields, falls back to plain text. Sets `status`, `code`, and `correlationId` properties on the resulting `Error`.

### Arrow / timestamp helpers
- `ensureArrowParser(): Promise<TableFromIPCFn>`
  - Lazily loads and caches the `apache-arrow` ES module, returning its `tableFromIPC` decoder. Throws if the module is missing.
- `resolveTimestampColumnName(table: ArrowTable, requestedCols: string[], colorColumn: string | null, headerName: string | null): string | null`
  - Resolves the timestamp column name from (1) `x-edatime-time-column` header, (2) the single non-value column, (3) any `/time|date|timestamp/i` column, (4) first schema field.
- `toEpochMs(value: unknown): number`
  - Converts numeric timestamps to epoch-ms with backend-aligned thresholds: ≥1e17 → ns, ≥1e14 → µs, ≥1e11 → ms passthrough, else seconds × 1000.
- `readExecutionIdentity(headers: Pick<Headers, 'get'> | null | undefined): ExecutionIdentity | undefined`
  - Decodes the immutable result provenance contract shared by plan-aware routes from `x-edatime-source-version`, `x-edatime-source-revision`, `x-edatime-schema-fingerprint`, `x-edatime-plan-hash` headers. Returns `undefined` when any required header is missing/invalid.

### Response guards
- `isObject(v: unknown): v is Record<string, unknown>` — type guard for plain objects.
- `assertDatasetMetadata(data: unknown): asserts data is DatasetMetadata`
  - Throws if metadata lacks `total_rows`, `columns`, or `numeric_columns`.
- `assertScatterPoints(data: unknown): asserts data is ScatterPointsResponse`
  - Throws if scatter points response lacks a `points` array.
- `assertScatterCorrelations(data: unknown): asserts data is ScatterCorrelationsResponse`
  - Throws if correlations response lacks a `correlations` array.

### Dataset request-scope re-exports (canonical owner is `datasetRequestScope.ts`)
- `captureDatasetRequestScope(): number` — current scope counter.
- `assertDatasetRequestScopeActive(scope: number): void` — throws `AbortError`-named error when stale.
- `invalidateDatasetRequestScope(): number` — bumps scope and clears the inflight dedupe map.
- `__resetApiRequestStateForTests(): void` — alias for `__resetDatasetRequestScopeForTests` (test-only).
- `dedupe` — alias for `dedupeInflight` (internal).

### Debug logging re-exports
- `dbg`, `DEBUG` — re-exported from `../../debug.js` for route-family modules.

---
[1]: ../../debug.md
[2]: ./datasetRequestScope.md