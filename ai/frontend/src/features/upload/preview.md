# ai/frontend/src/features/upload/preview.md
> Upload preview workflow owner for preview requests, status text, profile mode, and preview-driven column/time selection.

## Interface: PreviewCallbacks
- `hydrateColumnProfiles: (metadata: DatasetMetadata) => void`
- `renderColumnProfilesGrid: (resetScroll: boolean) => void`
- `onTimeColumnChanged: (file: File) => void`

## State
- `_previewController: AbortController | null`

## Functions
- `setUploadPreviewStatus(text: string, kind?: string): void`
  - Updates the upload preview status element text and class.
- `setProfileMode(mode: 'dataset' | 'preview'): void`
  - Updates the profile-mode badge to dataset or preview state.
- `abortPreview(): void`
  - Aborts the current preview request when one is active.
- `runFilePreview(file: File, callbacks: PreviewCallbacks): Promise<void>` [deps: [previewUpload][1]]
  - Runs the upload preview request, hydrates preview metadata, and updates selection/time inputs.
- `applyPreviewColumnSelection(metadata: DatasetMetadata, callbacks: PreviewCallbacks): void`
  - Applies preview columns/time-column detection and wires the time-column selector.
- `applyTimeRangeFromMetadata(metadata: DatasetMetadata | null, overwriteInputs: boolean): void` [deps: [getPartialTimeRangeInputs][2]]
  - Applies preview-detected time bounds to partial-load inputs.
- `loadedRowCountFromResponse(response: unknown): number`
  - Extracts a non-negative row count from upload/database responses.
- `formatUploadRowCountValue(rowCount: number): string` [deps: [formatUploadRowCountValue][2]]
  - Re-exports upload row-count formatting.

---
[1]: ../../services/api/upload.md#previewUpload
[2]: ./partialLoadControls.md
