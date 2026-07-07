# ai/frontend/src/services/api/timeseries.md
> Time-series data fetching from the Arrow IPC endpoint with timestamp resolution and optional buffered lookaround windows.

## Functions
- `fetchData(start: string, end: string, width: number, columns?: string, colorColumn?: string | null, lookaroundMs?: number, signal?: AbortSignal): Promise<DataObject>`
  - Fetches downsampled time-series data for the requested columns and optional color column, forwarding `lookaround_ms` when the caller requests a buffered window.
