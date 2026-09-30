# frontend/src/services/api/scatter.ts
> Frontend transport for scatter points, scatter matrix batches, and correlation suggestions. All endpoints require an active cleaning plan and use plan-aware request envelopes.

## Internal Types
- `ScatterMatrixCellHeader` — `{ cell_id: string; x: string; y: string; total_points: number; returned_points: number; color_min: number | null; color_max: number | null; color_kind?: 'continuous' | 'categorical' | null }`

## Functions
- `fetchScatterPoints(x: string, y: string, limit = 1_000_000, color: string | null = null, options: ScatterFetchOptions | null = null, requestOptions?: ApiRequestOptions): Promise<ScatterPointsResponse>` [deps: [http][1], [routes][2], [cleaning/store][3], [cleaning/compiler][4]]
  - POST `/api/v1/scatter/points`. Active cleaning plan is required.
  - Accepts Arrow IPC (`Content-Type: application/vnd.apache.arrow.stream`) or JSON response. Arrow path is the canonical path; JSON is a fallback. Headers read on Arrow path:
    - `x-edatime-scatter-x`, `x-edatime-scatter-y`, `x-edatime-scatter-color`
    - `x-edatime-scatter-total`, `x-edatime-scatter-returned`, `x-edatime-color-min`, `x-edatime-color-max`
    - `x-edatime-color-cardinality-{requested,used,bucketed}` (audit issue 2.2)
  - Always attaches `executionIdentity` from response headers.
- `decodeMatrixCellHeaders(value: string | null): ScatterMatrixCellHeader[]`
  - Parses the base64-encoded `x-edatime-matrix-cells` header and validates the decoded JSON array.
- `fetchScatterMatrix(pairs: ScatterMatrixPair[], color: string | null = null, options: ScatterFetchOptions | null = null, limit = 1_000_000, requestOptions?: ApiRequestOptions): Promise<ScatterMatrixResponse>` [deps: [http][1], [routes][2]]
  - POST `/api/v1/scatter/matrix`. **Arrow IPC is required** — throws if the response is JSON.
  - Reads `x-edatime-matrix-cells` for per-cell metadata and groups Arrow rows by `cell_id` into a `Map<string, MatrixCellData>`.
- `fetchScatterCorrelations(base: string | null, threshold = 0.7, mode: CorrelationMetric = 'pearson_raw'): Promise<ScatterCorrelationsResponse>` [deps: [http][1], [routes][2]]
  - POST `/api/v1/scatter/correlations` with `{ base, threshold, mode, cleaning_plan }`. Attaches `executionIdentity` to the response.

---
[1]: ./http.md
[2]: ../contracts/api/v1/routes.md
[3]: ../cleaning/store.md
[4]: ../cleaning/compiler.md