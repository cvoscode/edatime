# ai/frontend/src/features/upload/partialLoadControls.md
> Partial-load helper module for upload file validation, row/time input state, and multipart form shaping.

## Constants
- `UI_MAX_UPLOAD_BYTES: number`

## Interface: PartialTimeRangeInputs
- `startInput: HTMLInputElement`
- `endInput: HTMLInputElement`
- `hint: HTMLElement | null`

## Interface: PartialLoadParams
- `partialEnabled: boolean`
- `nRowsInput: HTMLInputElement`
- `skipInput: HTMLInputElement`
- `timeStartInput: HTMLInputElement | null`
- `timeEndInput: HTMLInputElement | null`

## Functions
- `getPartialTimeRangeInputs(): PartialTimeRangeInputs | null`
  - Returns the partial-load time input group when the DOM controls exist.
- `clearPartialTimeRangeInputs(inputs: PartialTimeRangeInputs): void`
  - Clears min/max metadata hints from the partial-load time inputs.
- `setPartialTimeRangeInputs(inputs: PartialTimeRangeInputs, minLocal: string, maxLocal: string, overwriteInputs: boolean): void`
  - Writes the detected time bounds into the partial-load time inputs.
- `applyPartialTimeRangeFromMetadata(metadata: DatasetMetadata | null, overwriteInputs?: boolean): void`
  - Applies metadata time bounds to the partial-load controls.
- `formatUploadRowCountValue(rowCount: number): string`
  - Formats upload row counts into compact K/M text.
- `validateFileSize(file: File | null): string | null`
  - Validates file presence, extension, and size against the upload policy.
- `buildPartialLoadFormData(params: PartialLoadParams, formData: FormData): { valid: boolean; error?: string }`
  - Appends partial-load parameters to upload form data when valid.
