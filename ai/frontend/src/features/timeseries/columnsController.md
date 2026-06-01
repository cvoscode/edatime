# ai/frontend/src/features/timeseries/columnsController.md
> Owns the top-level Timeseries chip composition flow by sanitizing selection state, rendering column chips, delegating range chips, and bridging the filter modal and collapse helpers.

## Functions
- `initSeriesCollapse(): void` [deps: [initSeriesCollapse][1]]
  - Re-export of the shared Timeseries series-collapse initializer.
- `buildColumnToggles(fetchAndRender: () => void, buildRangeControlsFn: () => void, renderCurrentDataFn: (() => void) | null = null): void` [deps: [composeChipListItems][2], [bindChipContextMenu][3], [renderSeriesChipList][4]]
  - Rebuilds the Timeseries column-chip list and wires toggle, color, context-menu, Ctrl+click, and collapse behavior.
- `buildRangeControls(): void` [deps: [buildRangeControls][5]]
  - Re-export of the selected-column range chip renderer.
- `initColumnFilterModal(renderCurrentData: () => void, updateAnalysisYRange: (min: number, max: number, source: string) => void): void` [deps: [initFilterModalController][6]]
  - Binds the shared Timeseries filter modal controller to the page callbacks.

---
[1]: ./seriesCollapse.md#initSeriesCollapse
[2]: ./chipComposition.md#composeChipListItems
[3]: ./chipContextMenu.md#bindChipContextMenu
[4]: ../../ui/seriesChipList.md#renderSeriesChipList
[5]: ./rangeControls.md#buildRangeControls
[6]: ./filterModalController.md#initFilterModalController
