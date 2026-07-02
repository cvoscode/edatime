# ai/frontend/src/features/timeseries/columnsController.md
> Timeseries column-chip orchestration, including the inline adaptive-filter hint and filter-modal bridge.

## Functions
- `isAdaptiveHintDismissed(): boolean`
  - Reads the adaptive-hint dismissal preference from `localStorage`.
- `setAdaptiveHintDismissed(dismissed: boolean): void`
  - Persists or clears the adaptive-hint dismissal preference.
- `refreshAdaptiveFilterHint(): void`
  - Re-renders the inline adaptive-filter hint inside `#column-toggles` when the surrounding UI changes out of band.
- `buildColumnToggles(fetchAndRender: () => void, buildRangeControlsFn: () => void, renderCurrentDataFn: (() => void) | null = null): void` [deps: [composeChipListItems][1], [renderSeriesChipList][2], [bindChipCtrlClick][3]]
  - Rebuilds the timeseries chip rail, syncs the adaptive hint, and wires toggle/color/context-menu behavior.
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
