# features/timeseries/rangeControls.md
> State-to-items composer for range filter chips. Derives `RangeControlItem[]` from Timeseries state and delegates DOM construction to the canonical `RangeControls` surface.

## Function: buildRangeControls
```typescript
function buildRangeControls(): void
```
Reads `appState.adaptiveFilterColumn`, `appState.selectedCols`, `appState.columnRanges`, and `appState.adaptiveLineFilters` to build a `RangeControlItem[]` then appends `RangeControls({ items })` into `#column-range-controls`. Timeseries-specific side effects (clear adaptive filters, open filter modal, dispatch events) are owned here.

---
[1]: ../../ui/composites/RangeControls.md#RangeControls
[2]: ../../utils/format.md#formatAnalysisNumber
[3]: ../../store/index.md
