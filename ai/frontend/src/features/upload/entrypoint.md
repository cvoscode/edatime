# ai/frontend/src/features/upload/entrypoint.md
> Upload feature entrypoint that composes the upload panel rendering surface with file, preview, database, and partial-load workflows.

## Interface: UploadFeatureDeps
- `buildColumnToggles: () => void`
- `buildRangeControls: () => void`

## Functions
- `createUploadEntrypoint(deps: UploadFeatureDeps): { init(hydrateColumnProfiles: (metadata: DatasetMetadata) => void, renderColumnProfilesGrid: (resetScroll: boolean) => void): void; _setMock(fn: InitUploadPanelFn | null): void }`
  - Creates the upload feature owner with idempotent initialization and a test-only upload-panel mock seam.
