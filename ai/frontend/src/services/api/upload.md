# ai/frontend/src/services/api/upload.md
> Upload, database connection, and drift statistic wrappers.

## Functions
- `previewUpload(formData: FormData, signal?: AbortSignal): Promise<Response>`
  - Uploads a file for preview; returns raw response for column profiling before ingest. [deps: [http][1]]
- `uploadDataset(formData: FormData): Promise<Response>`
  - Ingests the full dataset from an upload with configured column/time selections. [deps: [http][1]]
- `fetchDatabaseTables(): Promise<unknown>`
  - Lists available tables from the connected database. [deps: [http][1]]
- `connectDatabase(body: unknown): Promise<unknown>`
  - Establishes a database connection with supplied credentials/config. [deps: [http][1]]
- `loadDatabaseTable(body: unknown): Promise<unknown>`
  - Loads a table from the connected database into the in-memory dataset. [deps: [http][1]]
- `deleteDatabaseConnection(): Promise<Response>`
  - Closes the active database connection.
- `fetchDatabaseStatus(): Promise<unknown>`
  - Returns current database connection health and metadata. [deps: [http][1]]
- `fetchDriftStats<T>(payload: unknown): Promise<T>`
  - Fetches statistical drift metrics between two time windows. [deps: [http][1]]

---
[1]: ./http.md