# frontend/src/services/api/index.ts
> Main HTTP client layer. Arrow IPC for data, JSON for metadata/analytics.

## Key Functions

### Metadata & Data
- `fetchMetadata(): Promise<DatasetMetadata>`
- `fetchData(start, end, width, columns?, colorColumn?, signal?): Promise<DataObject>`
  - Parses Arrow IPC response; converts timestamps to epoch ms.

### Scatter
- `fetchScatterPoints(x, y, limit?, color?, options?, signal?): Promise<ScatterPointsResponse>`
- `fetchScatterCorrelations(base?, threshold?): Promise<ScatterCorrelationsResponse>`
- `fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>`
- `exportScatterParquet(payload): Promise<Blob>`

### Analytics
- `fetchRollingBands(start, end, columns, window?, signal?): Promise<RollingResponse>`
- `fetchAnomalies(start, end, columns, method?, threshold?, signal?): Promise<AnomalyResponse>`
- `fetchFft(start, end, columns, maxPoints?, signal?): Promise<FftResponse>`
- `fetchSpectrogram(start, end, column, windowSize?, hopSize?, maxPoints?, signal?): Promise<SpectrogramResponse>`
- `fetchCausalGraph(columns, tauMax?, alpha?, method?, maxPoints?, signal?, pcAlpha?, test?, maxCondsDim?, fdrMethod?): Promise<CausalGraphResponse>`
- `postTransform(expression, outputName): Promise<TransformResponse>`
- `postRemoveOutliers(columns?, method?, threshold?, window?): Promise<OutlierRemovalResult>`
- `fetchSpectralFilter(params, signal?): Promise<SpectralFilterResponse>`

### Upload & Export
- `previewUpload(formData, signal?): Promise<Response>`
- `uploadDataset(formData): Promise<Response>`
- `exportParquet(params): Promise<Blob>`

### Database
- `fetchDatabaseTables(): Promise<unknown>`
- `connectDatabase(body): Promise<unknown>`
- `loadDatabaseTable(body): Promise<unknown>`
- `deleteDatabaseConnection(): Promise<Response>`
- `fetchDatabaseStatus(): Promise<unknown>`

### Misc
- `fetchSampleDataset(filename): Promise<Blob>`
- `fetchDriftStats<T>(payload): Promise<T>`

### Low-level
- `getJsonForApi<T>(url, label, signal?): Promise<T>`
- `postJsonForApi<T>(url, body, label, signal?): Promise<T>`