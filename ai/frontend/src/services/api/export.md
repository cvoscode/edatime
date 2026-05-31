# ai/frontend/src/services/api/export.md
> Export wrappers for downloading filtered datasets as Parquet files.

## Functions
- `exportParquet(params: URLSearchParams): Promise<Blob>`
  - Downloads a filtered dataset as Parquet from the main chart endpoint. [deps: [http][1]]
- `exportScatterParquet(payload: unknown): Promise<Blob>`
  - Downloads scatter/density filtered points as Parquet via POST. [deps: [http][1]]

---
[1]: ./http.md