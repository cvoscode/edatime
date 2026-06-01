# ai/frontend/src/features/timeseries/filterModalController.md
> Owns the Timeseries column-range filter modal lifecycle, including bounds discovery, input synchronization, apply/clear actions, and modal open/close behavior.

## Interface: FilterModalControllerDeps
- `renderCurrentData: () => void`
- `updateAnalysisYRange: (min: number, max: number, source: string) => void`

## Functions
- `initFilterModalController(deps: FilterModalControllerDeps): void` [deps: [buildRangeControls][1], [computeBounds][2]]
  - Binds the filter modal once, syncs numeric and slider inputs to the active column bounds, and applies or clears per-column ranges.

---
[1]: ./rangeControls.md#buildRangeControls
[2]: ../../services/timeseries/filtering.md#computeBounds
