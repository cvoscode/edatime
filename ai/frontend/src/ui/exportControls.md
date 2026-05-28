# frontend/src/ui/exportControls.ts
> Chart data export (CSV/JSON/Parquet) and toolbar modals.

## Interfaces
- `FilteredRow`: `{ ts_ms: number; ts_iso: string; series: string; value: number }`
- `ToolbarPanel`: `{ openBtn, modalId, closeBtn, doneBtn?, isDrawer? }`

## Functions
- `buildFilteredSeriesRows(): FilteredRow[]`
  - Builds filtered series rows from current app state.
- `exportChartFilteredData(format?: 'csv' | 'json'): boolean`
  - Exports filtered data as CSV or JSON.
- `exportChartFilteredParquet(): Promise<boolean>`
  - Exports filtered data as Parquet via API.
- `initToolbarModals(): void`
  - Initializes toolbar modal open/close event handlers.
