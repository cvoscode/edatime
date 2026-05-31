# ai/frontend/src/services/api/index.md
> Barrel re-export of all route-family API implementations; stable public contract for the API layer.

## Re-exports
- `getJson`, `postJson` [deps: [http][1]]
- `fetchMetadata`, `fetchSampleDataset` [deps: [metadata][2]]
- `fetchData` [deps: [timeseries][3]]
- `fetchScatterPoints`, `fetchScatterCorrelations` [deps: [scatter][4]]
- `fetchCorrelationMatrix` [deps: [scatter-matrix][5]]
- `fetchRollingBands`, `fetchAnomalies`, `fetchFft`, `fetchSpectrogram`, `fetchCausalGraph`, `postTransform`, `postRemoveOutliers`, `fetchSpectralFilter` [deps: [analytics][6]]
- `exportParquet`, `exportScatterParquet` [deps: [export][7]]
- `previewUpload`, `uploadDataset`, `fetchDatabaseTables`, `connectDatabase`, `loadDatabaseTable`, `deleteDatabaseConnection`, `fetchDatabaseStatus`, `fetchDriftStats` [deps: [upload][8]]

---
[1]: ./http.md
[2]: ./metadata.md
[3]: ./timeseries.md
[4]: ./scatter.md
[5]: ./scatter-matrix.md
[6]: ./analytics.md
[7]: ./export.md
[8]: ./upload.md