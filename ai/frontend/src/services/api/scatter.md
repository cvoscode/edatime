# ai/frontend/src/services/api/scatter.md
> Frontend API client for scatter plot endpoints — data fetch, correlations, and matrix queries.

## Functions
- `async function fetchScatterData(payload): Promise<ScatterPointsResponse>` [deps: [ScatterPointsResponse][1]]
  - POST to scatter points endpoint with column X/Y, filters, and view parameters.

- `function normalizeScatterLineFilters(lineFilters) -> Array<{column, x1?, x2?, keepAbove?}>` — Normalizes line filter input from various formats into a consistent array shape.

---
[1]: ../../types.md#ScatterPointsResponse