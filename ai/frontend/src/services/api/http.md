# ai/frontend/src/services/api/http.md
> Core HTTP fetch helpers with request-dedupe, Arrow IPC parsing utilities, timestamp resolution, and response-shape assertion helpers. Dataset request-scope state and `dedupeInflight` are owned by `datasetRequestScope.ts` and re-exported here for the public contract.

## Types
- `ApiRequestOptions { signal?: AbortSignal; datasetScoped?: boolean }`
  - Options accepted by API request helpers. `datasetScoped` defaults to `true`; database status/table/connect calls pass `false`.
- `TableFromIPCFn = (buffer: ArrayBuffer) => ArrowTable`
- `ArrowTable { schema?: { fields?: Array<{ name?: string; type?: unknown }> }; numRows: number; getChild(name: string): ArrowColumn | null }`
- `ArrowColumn { get(index: number): unknown }`

## Functions
- `normalizeOptions(signalOrOptions: AbortSignal | ApiRequestOptions | undefined): ApiRequestOptions`
  - Normalizes legacy `AbortSignal` argument or `ApiRequestOptions` object into a consistent `ApiRequestOptions` shape.
- `dedupe<T>(key: string, factory: () => Promise<T>): Promise<T>`
  - Deduplicates in-flight requests by URL+body key; ensures only one outstanding request per key. Delegates to `dedupeInflight` from [datasetRequestScope][2].
- `ensureArrowParser(): Promise<TableFromIPCFn>`
  - Lazily loads and caches the Apache Arrow `tableFromIPC` parser.
- `resolveTimestampColumnName(table: ArrowTable, requestedCols: string[], colorColumn: string | null, headerName: string | null): string | null`
  - Resolves the timestamp column name from explicit header, single non-value column, temporal name pattern, or first column fallback.
- `toEpochMs(value: unknown): number`
  - Converts numeric timestamps to epoch-ms using backend-aligned unit thresholds (s/ms/µs/ns). [deps: [debug][1]]
- `isObject(v: unknown): v is Record<string, unknown>`
  - Type guard that returns true for plain object values.
- `assertDatasetMetadata(data: unknown): asserts data is DatasetMetadata`
  - Throws if the metadata response lacks required `total_rows`, `columns`, and `numeric_columns` fields.
- `assertScatterPoints(data: unknown): asserts data is ScatterPointsResponse`
  - Throws if scatter points response lacks a `points` array.
- `assertScatterCorrelations(data: unknown): asserts data is ScatterCorrelationsResponse`
  - Throws if correlations response lacks a `correlations` array.
- `readApiError(response: Response, label: string): Promise<Error & { status?: number }>`
  - Extracts error message from JSON error payloads (`message`, `code`, `correlation_id`) or plain text fallback; attaches `status` from response.
- `getJson<T>(url: string, label: string, options?: AbortSignal | ApiRequestOptions): Promise<T>`
  - Performs a cached GET request with deduplication and JSON parsing; throws on non-OK status.
- `postJson<T>(url: string, body: unknown, label: string, options?: AbortSignal | ApiRequestOptions): Promise<T>`
  - Performs a POST request with JSON serialization and deduplication; throws on non-OK status.
- `getJsonForApi`, `postJsonForApi`
  - Aliases of `getJson` / `postJson` for backward-compatible facade file imports.
- `captureDatasetRequestScope(): number`
  - Re-exported from [datasetRequestScope][2]. Returns the current scope value.
- `assertDatasetRequestScopeActive(scope: number): void`
  - Re-exported from [datasetRequestScope][2]. Throws if the scope is no longer current.
- `invalidateDatasetRequestScope(): number`
  - Re-exported from [datasetRequestScope][2]. Increments scope and clears in-flight dedupe.
- `__resetApiRequestStateForTests(): void`
  - Re-exported from [datasetRequestScope][2]. Resets all request state for test isolation.
- `dbg`, `DEBUG`
  - Debug logging utilities re-exported for route-family modules. [deps: [debug][1]]

---
[1]: ../../../debug.md
[2]: ./datasetRequestScope.md
