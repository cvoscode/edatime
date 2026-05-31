# frontend/src/store/datasetState.ts
> Metadata, numeric columns, column profiles, dataset revision.

## Interface `DatasetState`
- `metadata: DatasetMetadata | null`
- `numericCols: string[]`
- `columnProfiles: ProfileRow[]`
- `datasetRevision: number`

## Exports
- `datasetState: DatasetState`
- `setMetadata(metadata: DatasetMetadata | null): void`
- `setNumericCols(cols: string[]): void`
- `setColumnProfiles(profiles: ProfileRow[]): void`
- `setDatasetRevision(rev: number): void`
- `incrementDatasetRevision(): void`

---
[1]: events.md