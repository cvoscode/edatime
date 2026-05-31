# ai/frontend/src/services/api/metadata.md
> Metadata fetching for dataset schema, numeric columns, time range, and sample dataset loading.

## Functions
- `fetchMetadata(): Promise<DatasetMetadata>`
  - Fetches dataset schema, numeric columns, time range, and column profiles. [deps: [http][1]]
- `fetchSampleDataset(filename: string): Promise<Blob>`
  - Fetches a built-in sample dataset blob by filename. [deps: [http][1]]

---
[1]: ./http.md