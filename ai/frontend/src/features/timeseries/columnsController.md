# frontend/src/features/timeseries/columnsController.ts
> Column toggle chip UI and column range filter controls.

## Functions
- `initSeriesCollapse(): void`
  - Toggles series list collapse/expand state.
- `buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn?): void`
  - Builds chip list with `renderSeriesChipList`; attaches Ctrl+click adaptive-target context menu handler.
- `buildRangeControls(): void`
  - (See full signature in source)
- `initColumnFilterModal(renderCurrentData, updateAnalysisYRange): void`
  - (See full signature in source)

## Internal Helpers
- `buildMetaBar(metadata: { total_rows?: number } | null): void`
  - Renders row/column count stats into header meta bar.
- `sanitizeSelectedColumns(): void`
  - Removes invalid/datetime columns from `selectedCols`.
- `updateCollapseButton(btn: HTMLElement): void`
  - Updates collapse button SVG rotation and aria-label.
- `applyCollapse(): void`
  - Hides chips beyond threshold, shows collapse badge.

---
[1]: ../../ui/composites/SeriesChip.md
[2]: ../../ui/index.md#renderSeriesChipList
[3]: ../../store/index.md