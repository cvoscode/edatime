# frontend/src/services/api/metadata.ts
> Dataset-metadata fetching and sample-dataset blob loader.

## Functions
- `fetchMetadata(options?: ApiRequestOptions): Promise<DatasetMetadata>`
  - Fetches `/api/v1/metadata`, runs `assertDatasetMetadata` on the response, and returns the typed `DatasetMetadata`. [deps: [http][1], [routes][2], [contracts/dataset][3]]
- `fetchSampleDataset(filename: string, options?: ApiRequestOptions): Promise<Blob>`
  - Fetches `/api/v1/sample/{filename}` (URI-encoded). Always passes `{ datasetScoped: false }` because sample datasets do not depend on the active dataset. [deps: [http][1], [routes][2]]

---
[1]: ./http.md
[2]: ../contracts/api/v1/routes.md
[3]: ../contracts/api/v1/dataset.md