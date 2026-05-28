# frontend/src/ui/upload.ts
> Upload panel logic (file drop, partial load, preview, database connection).

## Interfaces
- `UploadPanelDeps`: `{ buildColumnToggles, buildRangeControls }`

## Functions
- `setUploadPreviewStatus(text, kind?): void`
  - Updates the preview status text.
- `formatUploadRowCount(rowCount): string`
  - Formats row count as K/M shorthand.
- `setProfileMode(mode: 'dataset' | 'preview'): void`
  - Updates profile mode badge.
- `applyPartialTimeRangeFromMetadata(metadata, overwriteInputs?): void`
  - Applies detected time range to partial load inputs.
- `initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid, deps): void`
  - Initializes upload panel with file selection, drag-drop, database connection.
