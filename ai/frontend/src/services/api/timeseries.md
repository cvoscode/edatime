# frontend/src/services/api/timeseries.ts
> Time-series data fetching from the Arrow IPC endpoint with timestamp resolution, buffered lookaround windows, and provenance headers.

## Functions
- `fetchData(start: string, end: string, width: number, columns?: string = 'value', colorColumn?: string | null = null, lookaroundMs?: number = 0, options?: ApiRequestOptions): Promise<DataObject>` [deps: [http][1], [routes][2], [cleaning/store][3], [cleaning/compiler][4]]
  - **Active cleaning plan is required** — throws `Timeseries data requires an active cleaning plan` when `cleaningPlanStore.getSnapshot()` returns `null`.
  - Forces `safeWidth = Math.max(50, Math.floor(width))` to prevent `width=1` LTTB escape hatch.
  - Captures the dataset request scope, sends `POST /api/v1/data` with body `{ start, end, width, columns, color_column, lookaround_ms, cleaning_plan }`.
  - Decodes Arrow IPC response, resolves timestamp column via `resolveTimestampColumnName`, projects numeric columns to `Float64Array`, and copies the color column (number/string/null) when supplied.
  - Returns a `DataObject` with `_meta` populated from response headers:
    - `downsampled` / `downsampleKnown` (`x-edatime-downsampled`)
    - `returnedRows`, `targetPoints`, `filteredRows`, `candidateRows`, `droppedRows`
    - `samplingAlgorithm`, `approximate` (`x-edatime-sampling-algorithm`, `x-edatime-approximate`)
    - `executionIdentity` (via `readExecutionIdentity`)
  - Invalidates stale responses via `assertDatasetRequestScopeActive` after the response body is decoded.

---
[1]: ./http.md
[2]: ../contracts/api/v1/routes.md
[3]: ../cleaning/store.md
[4]: ../cleaning/compiler.md