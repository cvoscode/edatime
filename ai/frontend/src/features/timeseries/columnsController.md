# ai/frontend/src/features/timeseries/columnsController.md
> Timeseries column-chip orchestration and filter-modal bridge. The previous version of this module also rendered two persistent discovery affordances below the chip rail — a "X of Y active" text summary and an inline "Ctrl + click" adaptive-filter hint chip — which were clipped off the right edge of the panel at intermediate viewports and consumed a fixed ~50 px row at every width. Both have been removed; the chip rail's own tooltips and the Draw toolbar "?" help button (see `frontend/src/ui/drawControls.ts`) now carry the same discoverability information via title attributes.

## Functions
- `buildColumnToggles(fetchAndRender: () => void, buildRangeControlsFn: () => void, renderCurrentDataFn: (() => void) | null = null): void` [deps: [composeChipListItems][1], [renderSeriesChipList][2], [bindChipCtrlClick][3]]
  - Rebuilds the timeseries chip rail, annotates the rail container with the active/total count via `title` / `aria-label`, and wires toggle/color/context-menu behavior.
- `buildRangeControls(): void` [deps: [buildRangeControls][4]]
  - Re-export of the selected-column range-chip renderer.
- `initColumnFilterModal(renderCurrentData: () => void, updateAnalysisYRange: (min: number, max: number, source: string) => void): void` [deps: [initFilterModalController][5]]
  - Binds the shared filter modal controller to timeseries callbacks.

---
[1]: ./chipComposition.md#composeChipListItems
[2]: ../../ui/seriesChipList.md#renderSeriesChipList
[3]: ./chipComposition.md#bindChipCtrlClick
[4]: ./rangeControls.md#buildRangeControls
[5]: ./filterModalController.md#initFilterModalController
