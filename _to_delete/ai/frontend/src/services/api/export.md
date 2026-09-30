# frontend/src/services/api/export.ts
> Export wrappers for downloading filtered datasets as Parquet files.

## Functions
- `exportScatterParquet(payload: unknown, options?: ApiRequestOptions): Promise<Blob>`
  - POST `/api/v1/scatter/export/parquet` with the supplied payload; returns the response as a `Blob`. [deps: [http][1], [routes][2]]

---
[1]: ./http.md
[2]: ../contracts/api/v1/routes.md