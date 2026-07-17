# frontend/src/services/api/upload.ts
> Upload, database connection, and drift API wrappers. Database status/connect calls use `{ datasetScoped: false }`; `loadDatabaseTable` is dataset-scoped because it mutates the active dataset.

## Functions (Upload)
- `previewUpload(formData: FormData, options?: ApiRequestOptions): Promise<Response>`
  - POST `/api/v1/upload/preview` with raw `FormData` body. Returns the raw `Response` (preview metadata is consumed via `frontend/src/features/upload/preview.ts`). [deps: [routes][1]]
- `uploadDataset(formData: FormData): Promise<Response>`
  - POST `/api/v1/upload` with raw `FormData` body. [deps: [routes][1]]

## Functions (Database — `datasetScoped: false` unless noted)
- `fetchDatabaseTables(): Promise<unknown>` — GET `/api/v1/database/tables`. [deps: [http][2]]
- `connectDatabase(body: unknown): Promise<unknown>` — POST `/api/v1/database/connect`. [deps: [http][2]]
- `loadDatabaseTable(body: unknown): Promise<unknown>` — POST `/api/v1/database/load`. **Dataset-scoped** because the call mutates the active dataset. [deps: [http][2]]
- `deleteDatabaseConnection(): Promise<unknown>` — DELETE `/api/v1/database/connect`. [deps: [http][2]]
- `fetchDatabaseStatus(): Promise<unknown>` — GET `/api/v1/database/status`. [deps: [http][2]]

## Functions (Drift)
- `fetchDriftStats<T>(payload: unknown, options?: ApiRequestOptions): Promise<T>`
  - POST `/api/v1/drift/stats`. The cleaning plan is attached only when at least one stage is enabled (`plan.stages.some(s => s.enabled)`). [deps: [http][2], [cleaning/store][3], [cleaning/compiler][4]]
- `fetchDriftInvestigation<T>(payload: unknown, options?: ApiRequestOptions): Promise<T>`
  - POST `/api/v1/drift/investigate`. Same cleaning-plan attachment rule as `fetchDriftStats`. [deps: [http][2], [cleaning/store][3], [cleaning/compiler][4]]

---
[1]: ../contracts/api/v1/routes.md
[2]: ./http.md
[3]: ../cleaning/store.md
[4]: ../cleaning/compiler.md