# ai/frontend/src/services/api/timeseries.md
> Time-series data fetching from the Arrow IPC endpoint with timestamp resolution and color column support.

## Functions
- `fetchData(start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal): Promise<DataObject>`
  - Fetches downsampled time-series data for the specified columns and color column over a time range, returning a `DataObject` with epoch-ms timestamps and per-column `Float64Array` values. [deps: [http][1]]

---
[1]: ./http.md