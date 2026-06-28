# ai/frontend/src/features/timeseries/columnsController.md
> Owns the top-level Timeseries chip composition flow by sanitizing selection state, rendering column chips, delegating range chips, and bridging the filter modal and collapse helpers.

## Functions
- `buildColumnToggles(fetchAndRender: () => void, buildRangeControlsFn: () => void, renderCurrentDataFn: (() => void) | null = null): void` [deps: [composeChipListItems][1], [bindChipContextMenu][2], [renderSeriesChipList][3]]
  - Rebuilds the Timeseries column-chip list and wires toggle, color, context-menu, and Ctrl+click behavior.
- `buildRangeControls(): void` [deps: [buildRangeControls][4]]
  - Re-export of the selected-column range chip renderer.
- `initColumnFilterModal(renderCurrentData: () => void, updateAnalysisYRange: (min: number, max: number, source: string) => void): void` [deps: [initFilterModalController][5]]
  - Binds the shared Timeseries filter modal controller to the page callbacks.

---
[1]: ./chipComposition.md#composeChipListItems
[2]: ./chipContextMenu.md#bindChipContextMenu
[3]: ../../ui/seriesChipList.md#renderSeriesChipList
[4]: ./rangeControls.md#buildRangeControls
[5]: ./filterModalController.md#initFilterModalController
