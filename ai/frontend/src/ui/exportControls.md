# ai/frontend/src/ui/exportControls.md
> Toolbar modal wiring, zoom controls, and chart data export (CSV/JSON/Parquet). Transport-layer calls (CSV/JSON/Parquet export) moved to `features/export/entrypoint.ts`.

## Interfaces
- `ToolbarPanel`: `{ openBtn: string; modalId: string; closeBtn: string; doneBtn: string | null; isDrawer?: boolean }`

## Functions

### exportChartFilteredData
- `exportChartFilteredData(format: 'csv' | 'json' = 'csv'): boolean`
  - Delegates to `exportFeature.exportFilteredCsv()` or `exportFeature.exportFilteredJson()`. Returns whether export was attempted.

### exportChartFilteredParquet
- `exportChartFilteredParquet(): Promise<boolean>`
  - Delegates to `exportFeature.exportFilteredParquet()`.

### initToolbarModals
- `initToolbarModals(): void`
  - Binds toolbar panel open/close buttons and Escape key handlers for labels/export/analytics drawer.
  - Wires `#zoom-out-btn` and `#zoom-reset-btn` click events to dispatch `edatime:zoom-out` / `edatime:reset-zoom` respectively. The actual zoom logic + real `fetchAndRender` lives in `initZoomOutListener` / `initResetZoomListener` (see `viewport.md`). The previous version of this module called `zoomOut(() => {})` / `resetZoom(() => {})` directly with an empty callback, which left the chart store updated but the chart canvas visually stuck at the zoomed-in range after a single box zoom + click (−).

### openToolbarModal / closeToolbarModal
- `openToolbarModal(modalId: string): void`
- `closeToolbarModal(modalId: string): void`

---
[1]: ../features/export/entrypoint.md#createExportFeature