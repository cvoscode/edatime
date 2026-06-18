# ai/frontend/src/services/api/scatter.md
> Scatter point and correlation fetching with Arrow IPC and JSON fallback support.

## Functions
- `normalizeScatterLineFilters(lineFilters: unknown[]): Array<{ column: string; x1: number; y1: number; x2: number; y2: number; keepAbove: boolean }>`
  - Normalizes scatter line filters before serialization by coercing the numeric fields, dropping invalid entries, and stripping compatibility-only `id` fields.
- `fetchScatterPoints(x: string, y: string, limit?: number, color?: string | null, options?: ScatterFetchOptions | null, signal?: AbortSignal): Promise<ScatterPointsResponse>`
  - Fetches scatter points for an X/Y pair with optional color encoding, time range, and filter propagation; serializes line filters through `normalizeScatterLineFilters` and supports Arrow IPC (with metadata headers) and JSON responses. [deps: [http][1]]
- `fetchScatterCorrelations(base?: string | null, threshold?: number): Promise<ScatterCorrelationsResponse>`
  - Fetches ranked correlation suggestions filtered by a minimum threshold; optionally scoped to a base column. [deps: [http][1]]

---
[1]: ./http.md
