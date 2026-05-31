# features/timeseries/columnsController.md
> Builds and manages column toggle chips, color-by selector, adaptive-target controls, and per-column range filter controls for the timeseries page.

## Functions

- `initSeriesCollapse(): void`
  - Attaches a click handler to the collapse/expand series button.
- `buildMetaBar(metadata: { total_rows?: number } | null): void`
  - Renders row count and numeric series count into `#header-meta` and `#timeseries-meta-bar`.
- `sanitizeSelectedColumns(): void`
  - Removes time/datetime and non-existent columns from the current selection. [deps: [sanitizeSelectedColumns][1]]
- `ensureAdaptiveTargetStillValid(): void`
  - Falls back to first selected column if adaptive-filter target is no longer selected. [deps: [ensureAdaptiveTargetStillValid][1]]
- `buildColumnToggles(fetchAndRender: () => void, buildRangeControlsFn: () => void, renderCurrentDataFn: (() => void) | null): void`
  - Builds checkbox chips for all numeric columns, wires color pickers, color-by dropdown via `renderColorByControl` [deps: [renderColorByControl][2]], adaptive-target Ctrl+click, double-right-click filter modal, and collapse toggle.
- `buildRangeControls(): void`
  - Renders range chips for each selected column; each chip is clickable to open the column filter modal. [deps: [buildRangeControls][3]]

---
[1]: ./columnSelection.md
[2]: ./colorByControl.md
[3]: ./rangeControls.md