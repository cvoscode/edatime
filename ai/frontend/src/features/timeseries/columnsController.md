# features/timeseries/columnsController.md

> Builds and manages column toggle chips, color-by selector, and per-column range filter controls for the timeseries page.

## Functions

- `initSeriesCollapse(): void`
  - Attaches a click handler to the collapse/expand series button.
- `buildMetaBar(metadata: { total_rows?: number } | null): void`
  - Renders row count and numeric series count into `#header-meta` and `#timeseries-meta-bar`.
- `sanitizeSelectedColumns(): void`
  - Removes time/datetime and non-existent columns from the current selection.
- `buildColumnToggles(fetchAndRender: () => void, buildRangeControlsFn: () => void, renderCurrentDataFn: (() => void) | null): void`
  - Builds checkbox chips for all numeric columns, wires color pickers, color-by dropdown, adaptive-target Ctrl+click, double-right-click filter modal, and collapse toggle.
- `buildRangeControls(): void`
  - Renders range chips for each selected column; each chip is clickable to open the column filter modal.