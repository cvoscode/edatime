# upload.ts

Data upload API client for dataset ingestion and database operations.

## Functions

```typescript
function previewUpload(
    formData: FormData,
    signal?: AbortSignal,
): Promise<Response>

function uploadDataset(formData: FormData): Promise<Response>

function connectDatabase(body: unknown): Promise<unknown>

function deleteDatabaseConnection(): Promise<Response>

function fetchDatabaseStatus(): Promise<unknown>

function fetchDatabaseTables(): Promise<unknown>

function loadDatabaseTable(body: unknown): Promise<unknown>
```
