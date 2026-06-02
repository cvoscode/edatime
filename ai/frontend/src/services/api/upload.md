# ai/frontend/src/services/api/upload.md
> Upload, database connection, and drift statistic wrappers.

## Functions
- `previewUpload(formData: FormData, signal?: AbortSignal): Promise<Response>`
  - Uploads a file for preview and returns the raw `Response`.
- `uploadDataset(formData: FormData): Promise<Response>`
  - Ingests the dataset upload and returns the raw `Response`.
- `fetchDatabaseTables(): Promise<unknown>`
  - Lists available tables from the connected database. [deps: [getJson][1]]
- `connectDatabase(body: unknown): Promise<unknown>`
  - Establishes a database connection with supplied credentials/config. [deps: [postJson][1]]
- `loadDatabaseTable(body: unknown): Promise<unknown>`
  - Loads a database table into the in-memory dataset. [deps: [postJson][1]]
- `deleteDatabaseConnection(): Promise<Response>`
  - Closes the active database connection and returns the raw `Response`.
- `fetchDatabaseStatus(): Promise<unknown>`
  - Returns current database connection health and metadata. [deps: [getJson][1]]
- `fetchDriftStats<T>(payload: unknown, signal?: AbortSignal): Promise<T>`
  - Posts an opaque drift payload and returns the typed response. [deps: [postJson][1]]

---
[1]: ./http.md
