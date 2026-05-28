# frontend/src/dataClient.ts
> HTTP/Arrow data transport layer with response guards, inflight deduplication, and timestamp resolution.

## Interfaces
```typescript
interface ArrowTable {
    schema?: { fields?: Array<{ name?: string; type?: unknown }> };
    numRows: number;
    getChild(name: string): ArrowColumn | null;
}
interface ArrowColumn { get(index: number): unknown; }
```

## Type Aliases
```typescript
type TableFromIPCFn = (buffer: ArrayBuffer) => ArrowTable;
```

## Functions
- `function resolveTimestampColumnName(table: ArrowTable, requestedCols: string[], colorColumn: string | null, headerName: string | null): string | null`
  - Resolves timestamp column name from header or schema heuristics.

## Fetch Helpers
- `async function ensureArrowParser(): Promise<TableFromIPCFn>`
- `async function getJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T>`
- `async function postJson<T>(url: string, body: unknown, label: string, signal?: AbortSignal): Promise<T>`
- `export const getJsonForApi = getJson`
- `export const postJsonForApi = postJson`

## Runtime Guards (assertions)
- `function assertDatasetMetadata(data: unknown): asserts data is DatasetMetadata`
- `function assertScatterPoints(data: unknown): asserts data is ScatterPointsResponse`
- `function assertScatterCorrelations(data: unknown): asserts data is ScatterCorrelationsResponse`

## Metadata & Data
- `export async function fetchMetadata(): Promise<DatasetMetadata>`
- `export async function fetchData(start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal): Promise<DataObject>`

## Scatter
- `export async function fetchScatterPoints(x: string, y: string, limit?: number, color?: string | null, options?: ScatterFetchOptions | null, signal?: AbortSignal): Promise<ScatterPointsResponse>`
  - Handles Arrow IPC responses with header-guided column resolution (`x-edatime-scatter-x`, `x-edatime-scatter-y`, `x-edatime-scatter-color`).
- `export async function fetchScatterCorrelations(base: string | null, threshold?: number): Promise<ScatterCorrelationsResponse>`

## Analytics
- `export async function fetchRollingBands(start: string, end: string, columns: string, window?: number, signal?: AbortSignal): Promise<RollingResponse>`
- `export async function fetchAnomalies(start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal): Promise<AnomalyResponse>`
- `export async function fetchFft(start: string, end: string, columns: string, maxPoints?: number, signal?: AbortSignal): Promise<FftResponse>`
- `export async function fetchSpectrogram(start: string, end: string, column: string, windowSize?: number, hopSize?: number, maxPoints?: number, signal?: AbortSignal): Promise<SpectrogramResponse>`
- `export async function fetchCausalGraph(columns: string[], tauMax?: number, alpha?: number, method?: string, maxPoints?: number, signal?: AbortSignal, pcAlpha?: number, test?: string, maxCondsDim?: number, fdrMethod?: string): Promise<CausalGraphResponse>`
- `export async function postTransform(expression: string, outputName: string): Promise<TransformResponse>`
- `export async function postRemoveOutliers(columns: string[] | null, method?: string, threshold?: number, window?: number): Promise<OutlierRemovalResult>`
- `export async function fetchSpectralFilter(params: URLSearchParams, signal?: AbortSignal): Promise<SpectralFilterResponse>`
- `export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>`

## Export & Upload
- `export async function exportParquet(params: URLSearchParams): Promise<Blob>`
- `export async function exportScatterParquet(payload: unknown): Promise<Blob>`
- `export async function previewUpload(formData: FormData, signal?: AbortSignal): Promise<Response>`
- `export async function uploadDataset(formData: FormData): Promise<Response>`

## Database
- `export async function fetchDatabaseTables(): Promise<unknown>`
- `export async function connectDatabase(body: unknown): Promise<unknown>`
- `export async function loadDatabaseTable(body: unknown): Promise<unknown>`
- `export async function deleteDatabaseConnection(): Promise<Response>`
- `export async function fetchDatabaseStatus(): Promise<unknown>`
- `export async function fetchSampleDataset(filename: string): Promise<Blob>`
- `export async function fetchDriftStats<T>(payload: unknown): Promise<T>`
