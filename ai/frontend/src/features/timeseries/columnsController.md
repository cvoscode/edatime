# frontend/src/features/timeseries/columnsController.ts
> Column toggle chip UI and column range filter controls. Uses `SeriesChip` from `ui/composites/SeriesChip.js` and `renderSeriesChipList` from `ui/index.js`.

## Functions
- `initSeriesCollapse(): void`
- `buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn?): void`
  - Now uses `renderSeriesChipList` for chip rendering and attaches Ctrl+click adaptive-target handler in capture phase.
- `buildRangeControls(): void`
- `initColumnFilterModal(renderCurrentData, updateAnalysisYRange): void`

---
[1]: ../../ui/composites/SeriesChip.md
[2]: ../../ui/index.md#renderSeriesChipList