# ai/frontend/src/features/timeseries/filterModalController.md
> Owns the Timeseries column-range filter modal lifecycle. Delegates the modal event shell to `ColumnFilterModal.bind`; keeps Timeseries-specific state (slider/text sync, bounds discovery, apply/clear side effects, Y range fitting).

## Interface: FilterModalControllerDeps
- `renderCurrentData: () => void`
- `updateAnalysisYRange: (min: number, max: number, source: string) => void`

## Function: initFilterModalController
```typescript
function initFilterModalController(deps: FilterModalControllerDeps): void
```
Binds the server-rendered modal DOM to `ColumnFilterModal` events, owns `getFullBoundsForCol`, `refreshInputsForCol`, `populateColumns`, input/slider sync, apply/clear handlers, and `window.__edatime.openFilterForCol`.

---
[1]: ../../ui/composites/ColumnFilterModal.md#ColumnFilterModal
[2]: ./rangeControls.md#buildRangeControls
[3]: ../../services/timeseries/filtering.md#computeBounds
