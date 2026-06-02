# ai/frontend/src/features/upload/databaseSource.md
> Upload database-source workflow owner for connection status, table refresh, loading, and disconnect flows.

## Interface: DbConnectParams
- `connectionString: string`
- `schema: string`
- `dbConnectBtn: HTMLButtonElement`
- `dbStatus: HTMLElement`
- `dbLoadBtn: HTMLButtonElement | null`
- `dbDisconnectBtn: HTMLButtonElement | null`

## Interface: DbLoadParams
- `schema: string`
- `table: string`
- `timeColumn: string | null`
- `dbLoadBtn: HTMLButtonElement`
- `dbStatus: HTMLElement`

## Interface: DbDisconnectParams
- `dbDisconnectBtn: HTMLButtonElement`
- `dbLoadBtn: HTMLButtonElement | null`
- `dbStatus: HTMLElement`
- `dbTableSelect: HTMLSelectElement | null`

## State
- `_dbStatusLoaded: boolean`

## Functions
- `refreshDbTables(): Promise<void>` [deps: [fetchDatabaseTables][1]]
  - Refreshes the database table selector from the backend table list.
- `syncDatabaseStatus(): Promise<void>` [deps: [fetchDatabaseStatus][1]]
  - Loads the current database connection status once and updates the upload panel state.
- `resetDatabaseStatusLoaded(): void`
  - Clears the one-shot database status guard.
- `handleDatabaseConnect(params: DbConnectParams): Promise<void>` [deps: [connectDatabase][1]]
  - Connects to the configured database and updates upload-panel state.
- `handleDatabaseLoad(params: DbLoadParams): Promise<void>` [deps: [loadDatabaseTable][1], [loadedRowCountFromResponse][2]]
  - Loads a database table into the active dataset and emits the dataset-changed event.
- `handleDatabaseDisconnect(params: DbDisconnectParams): Promise<void>` [deps: [deleteDatabaseConnection][1]]
  - Disconnects the active database session and resets table/status UI.

---
[1]: ../../services/api/upload.md
[2]: ./preview.md#loadedRowCountFromResponse
