# ai/frontend/src/features/upload/fileSource.md
> Upload file-source workflow owner for progress animation and upload submission.

## Interface: FileUploadDeps
- `buildColumnToggles: () => void`
- `buildRangeControls: () => void`

## Interface: FileUploadParams
- `selectedFile: File`
- `partialEnabled: boolean`
- `nRowsInput: HTMLInputElement`
- `skipInput: HTMLInputElement`
- `timeStartInput: HTMLInputElement | null`
- `timeEndInput: HTMLInputElement | null`
- `uploadBtn: HTMLButtonElement`
- `statusEl: HTMLElement`
- `progressWrap: HTMLElement`
- `progressBar: HTMLElement`
- `fileInput: HTMLInputElement`
- `fileDisplay: HTMLElement`
- `deps: FileUploadDeps`
- `hydrateColumnProfiles: (metadata: DatasetMetadata) => void`
- `renderColumnProfilesGrid: (resetScroll: boolean) => void`

## Functions
- `loadedRowCountFromResponse(response: unknown): number` [deps: [loadedRowCountFromResponse][1]]
  - Re-exports the loaded-row parser from the preview module.
- `formatUploadRowCountValue(rowCount: number): string` [deps: [formatUploadRowCountValue][2]]
  - Re-exports upload row-count formatting.
- `animateProgress(bar: HTMLElement, wrap: HTMLElement | null): () => void`
  - Animates the upload progress bar and returns a completion callback.
- `submitFileUpload(params: FileUploadParams): Promise<void>` [deps: [uploadDataset][3], [validateFileSize][2]]
  - Validates, submits, and reconciles a file upload with metadata refresh and UI updates.

---
[1]: ./preview.md#loadedRowCountFromResponse
[2]: ./partialLoadControls.md
[3]: ../../services/api/upload.md#uploadDataset
