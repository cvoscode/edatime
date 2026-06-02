# ai/frontend/src/drift/controls.md
> Drift control wiring — all event listeners bound to drift page controls. Does NOT import from driftPage.ts to avoid circular deps.

## Interface: DriftControlCallbacks
```ts
interface DriftControlCallbacks {
    getSelectedColumns: () => string[];
    runCompute: () => Promise<void>;
    exportDriftCsv: () => void;
    exportDriftJson: () => void;
    renderTimeline: () => void;
    renderDetail: () => void;
    renderWindowList: () => void;
    updateDetailStats: () => void;
    syncEmptyState: (show: boolean, message?: string) => void;
    scheduleDriftChartRefresh: () => void;
}
```

## Interface: DriftControlOptions
```ts
interface DriftControlOptions {
    pageMetadata: any;
    colPickerBtn: HTMLButtonElement | null;
    colPickerPanel: HTMLElement | null;
    colPickerList: HTMLElement | null;
    colPickerLabel: HTMLElement | null;
    colSelectAllBtn: HTMLButtonElement | null;
    colSelectSingleBtn: HTMLButtonElement | null;
    colSelectNoneBtn: HTMLButtonElement | null;
    colSelect: HTMLSelectElement | null;
    windowSelect: HTMLSelectElement | null;
    plotTypeSelect: HTMLSelectElement | null;
    refPresetSelect: HTMLSelectElement | null;
    refStartInput: HTMLInputElement | null;
    refEndInput: HTMLInputElement | null;
    computeBtn: HTMLButtonElement | null;
    zoomResetBtn: HTMLButtonElement | null;
    statusEl: HTMLElement | null;
    detailColumnSelect: HTMLSelectElement | null;
    loadingOverlay: HTMLElement | null;
    emptyState: HTMLElement | null;
    driftLayoutEl: HTMLElement | null;
    sortSelect: HTMLSelectElement | null;
    onDetailColumnChange: (column: string | null, windowIdx: number | null) => void;
    timelineChartDispatch: (action: { type: string; dataZoomIndex?: number; start?: number; end?: number }) => void;
    detailChartDispatch: (action: { type: string; dataZoomIndex?: number; start?: number; end?: number }) => void;
    exportTimelinePNG: () => void;
    exportDetailPNG: () => void;
}
```

## Module-level State
- `selectedCols: Set<string>` — module-level column selection, survives across page visits
- `numericCols: string[]` — cached numeric column list

## Functions
- `getSelectedColumns(): string[]` [deps: [syncPickerLabel][1]]
  - Returns current selected column list as array.
- `resetDriftControlsState(): void`
  - Resets selectedCols and numericCols to initial state (for test isolation).
- `toDatetimeLocal(ms: number): string`
  - Converts epoch ms to `YYYY-MM-DDTHH:MM` local datetime string.
- `syncPickerLabel(colPickerLabel: HTMLElement | null): void`
  - Updates picker label text (e.g., "3 columns") from current selectedCols size.
- `syncHiddenSelect(colSelect: HTMLSelectElement | null, allCols: string[]): void`
  - Syncs a hidden backing `<select>` with current checkbox state.
- `getCheckboxes(colPickerList: HTMLElement | null): NodeListOf<HTMLInputElement>`
  - Returns all `.drift-col-cb` checkboxes inside the picker list.
- `syncCheckboxes(colPickerList: HTMLElement | null): void`
  - Syncs all checkbox `checked` states from selectedCols and updates picker label.
- `openPicker(colPickerPanel: HTMLElement | null, colPickerBtn: HTMLButtonElement | null): void`
  - Shows the floating column picker panel, positioned below the trigger button.
- `closePicker(colPickerPanel: HTMLElement | null, colPickerBtn: HTMLButtonElement | null): void`
  - Hides the floating column picker panel.
- `repopulateColumnSelect(colPickerList: HTMLElement | null, allCols: string[]): void`
  - Rebuilds checkbox list and syncs hidden select from allCols; auto-selects first column if none selected.
- `bindDriftControls(cb: DriftControlCallbacks, opts: DriftControlOptions): void`
  - Binds all drift control event listeners: column picker, reference preset/time range, compute button, sort select, detail column select, plot type select, zoom reset, export buttons (PNG/CSV/JSON), keyboard shortcuts, and page-change listener.

---
[1]: ./driftPage.md#syncEmptyState