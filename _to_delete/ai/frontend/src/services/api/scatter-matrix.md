# frontend/src/services/api/scatter-matrix.ts
> Thin wrapper that POSTs `/api/v1/scatter/correlations/matrix` with the active cleaning plan attached.

## Functions
- `fetchCorrelationMatrix(mode: CorrelationMetric = 'pearson_raw'): Promise<CorrelationMatrixResponse>`
  - Reads the active cleaning plan from `cleaningPlanStore`, throws if absent. Sends `{ mode, cleaning_plan }`. [deps: [http][1], [routes][2], [analytics][3], [cleaning/store][4], [cleaning/compiler][5]]

---
[1]: ./http.md
[2]: ../contracts/api/v1/routes.md
[3]: ./analytics.md
[4]: ../cleaning/store.md
[5]: ../cleaning/compiler.md