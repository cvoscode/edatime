# ai/frontend/src/drift/controls.md
> Drift control wiring — all event listeners bound to the drift page controls without importing `driftPage.ts`.

## Interface `DriftControlCallbacks`
- `getSelectedColumns: () => string[]`
- `runCompute: () => Promise<void>`
- `onSelectionChange: () => void`
- `exportDriftCsv: () => void`
- `exportDriftJson: () => void`
- `renderTimeline: () => void`
- `renderDetail: () => void`
- `renderWindowList: () => void`
- `updateDetailStats: () => void`
- `syncEmptyState: (show: boolean, message?: string) => void`
- `scheduleDriftChartRefresh: () => void`

## Interface `DriftControlOptions`
- Includes the drift column-picker elements plus `evaluationModeSelect`, `latestNInput`, `latestNHelper`, chart dispatchers, export callbacks, and the detail-column change callback.

## Module-level state
- `selectedCols: Set<string>`
- `numericCols: string[]`
- `pickerLabelEl: HTMLElement | null`
- `hiddenColSelectEl: HTMLSelectElement | null`
- `selectionChangeCallback: (() => void) | null`

## Functions
- `getSelectedColumns(): string[]`
- `resetDriftControlsState(): void`
- `syncPickerLabel(allCols?: string[]): void`
  - Writes the inline picker summary as `selected of total selected`.
- `syncHiddenSelect(allCols: string[]): void`
- `renderColumnChips(colPickerList: HTMLElement | null, allCols: string[]): void`
  - Renders the drift column picker with `renderSeriesChipList`, per-column colors, and selection callbacks.
- `openPicker(colPickerPanel: HTMLElement | null, colPickerBtn: HTMLButtonElement | null): void`
- `closePicker(colPickerPanel: HTMLElement | null, colPickerBtn: HTMLButtonElement | null): void`
- `repopulateColumnSelect(colPickerList: HTMLElement | null, allCols: string[]): void`
- `bindDriftControls(cb: DriftControlCallbacks, opts: DriftControlOptions): void`
  - Binds drift controls, inline chip selection, evaluation-mode helper text, bulk selection actions, exports, zoom reset, and page-change behavior.
