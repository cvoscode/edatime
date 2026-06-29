# frontend/src/services/api/upload.ts
> Upload, database connection, and drift API wrappers — re-exports all route-family implementations for the upload/database/drift domain.

## Functions (Upload)
- `previewUpload(formData: FormData, signal?: AbortSignal): Promise<Response>`
  - Uploads a file for preview; returns raw `Response`. [deps: [postJson][1]]
- `uploadDataset(formData: FormData): Promise<Response>`
  - Ingests the dataset upload; returns raw `Response`. [deps: [postJson][1]]

## Functions (Database)
- `fetchDatabaseTables(): Promise<unknown>` — Lists tables from connected database (dataset-scoped: false). [deps: [getJson][1]]
- `connectDatabase(body: unknown): Promise<unknown>` — Establishes DB connection with credentials/config. [deps: [postJson][1]]
- `loadDatabaseTable(body: unknown): Promise<unknown>` — Loads a database table into in-memory dataset (dataset-scoped: true). [deps: [postJson][1]]
- `deleteDatabaseConnection(): Promise<Response>` — Closes active DB connection. Returns raw `Response`.
- `fetchDatabaseStatus(): Promise<unknown>` — Returns current DB connection health and metadata. [deps: [getJson][1]]

## Functions (Drift)
- `fetchDriftStats<T>(payload: DriftQueryPayload, signal?: AbortSignal): Promise<T>`
  - Posts drift query payload (`{ column, window, reference_start, reference_end, ...thresholdOverrides }`) to `/api/drift/stats`; returns typed response. [deps: [postJson][1]]

- `fetchDriftInvestigation(payload: DriftInvestigateQueryPayload, signal?: AbortSignal): Promise<DriftInvestigationResponse>`
  - Posts multi-column drift investigation request to `/api/drift/investigate`. Returns full investigation response with rankings and optional segmentation. [deps: [postJson][1]]

---
[1]: ./http.md
