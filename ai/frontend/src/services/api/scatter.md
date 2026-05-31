# ai/frontend/src/services/api/scatter.md
> Scatter point and correlation fetching with Arrow IPC and JSON fallback support.

## Functions
- `fetchScatterPoints(x: string, y: string, limit?: number, color?: string | null, options?: ScatterFetchOptions | null, signal?: AbortSignal): Promise<ScatterPointsResponse>`
  - Fetches scatter points for an X/Y pair with optional color encoding, time range, and filter propagation; supports Arrow IPC (with metadata headers) and JSON responses. [deps: [http][1]]
- `fetchScatterCorrelations(base?: string | null, threshold?: number): Promise<ScatterCorrelationsResponse>`
  - Fetches ranked correlation suggestions filtered by a minimum threshold; optionally scoped to a base column. [deps: [http][1]]

---
[1]: ./http.md