# ai/frontend/src/ui/upload.md
> Upload panel rendering surface that re-exports upload helpers and binds DOM events to upload feature modules.

## Interfaces
- `UploadPanelDeps`: `{ buildColumnToggles: () => void; buildRangeControls: () => void }`

## Functions
- `setUploadPreviewStatus(text: string, kind?: string): void` [deps: [setUploadPreviewStatus][1]]
  - Re-exports the preview-status setter from the upload preview module.
- `setProfileMode(mode: 'dataset' | 'preview'): void` [deps: [setProfileMode][1]]
  - Re-exports the profile-mode badge updater from the upload preview module.
- `applyPartialTimeRangeFromMetadata(metadata: DatasetMetadata | null, overwriteInputs?: boolean): void` [deps: [applyPartialTimeRangeFromMetadata][2]]
  - Re-exports the partial time-range input sync helper.
- `formatUploadRowCount(rowCount: number): string` [deps: [formatUploadRowCountValue][2]]
  - Re-exports row-count formatting for upload progress text.
- `loadedRowCountFromResponse(response: unknown): number` [deps: [loadedRowCountFromResponse][1]]
  - Re-exports the upload/database loaded-row extractor.
- `initUploadPanel(hydrateColumnProfiles: (metadata: DatasetMetadata) => void, renderColumnProfilesGrid: (resetScroll: boolean) => void, deps: UploadPanelDeps): void`
  - Binds upload panel DOM events and delegates preview/file/database workflows to feature-owned helpers.

---
[1]: ../features/upload/preview.md
[2]: ../features/upload/partialLoadControls.md
