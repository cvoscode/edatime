# ai/frontend/src/services/api/scatter.md
> Frontend transport for scatter points, scatter matrix batches, and correlation suggestions.

## Interfaces
- `ScatterMatrixCellHeader` — `{ cell_id: string; x: string; y: string; total_points: number; returned_points: number; color_min: number | null; color_max: number | null; color_kind?: 'continuous' | 'categorical' | null }`

## Functions
- `normalizeScatterLineFilters(lineFilters: unknown[]): Array<{ column: string; x1: number; y1: number; x2: number; y2: number; keepAbove: boolean }>`
  - Normalizes and validates canonical scatter line-filter payloads before JSON serialization.
- `fetchScatterPoints(x: string, y: string, limit = 1_000_000, color: string | null = null, options: ScatterFetchOptions | null = null, signal?: AbortSignal): Promise<ScatterPointsResponse>` [deps: [ScatterPointsResponse][1]]
  - `POST`s `/api/scatter/points` and decodes either Arrow IPC or JSON fallback.
- `decodeMatrixCellHeaders(value: string | null): ScatterMatrixCellHeader[]`
  - Parses the base64-encoded `x-edatime-matrix-cells` response header.
- `fetchScatterMatrix(pairs: ScatterMatrixPair[], color: string | null = null, options: ScatterFetchOptions | null = null, limit = 1_000_000, signal?: AbortSignal): Promise<ScatterMatrixResponse>` [deps: [ScatterMatrixResponse][1]]
  - `POST`s `/api/scatter/matrix`, requires an Arrow IPC response, and groups rows into per-cell datasets keyed by `cell_id`.
- `fetchScatterCorrelations(base: string | null, threshold = 0.7, mode: CorrelationMetric = 'pearson_raw'): Promise<ScatterCorrelationsResponse>` [deps: [ScatterCorrelationsResponse][1]]
  - Fetches correlation suggestions for the current scatter controls.

---
[1]: ../../types.md
