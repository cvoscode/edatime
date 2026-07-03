# ai/frontend/src/scatter/colorbarCardinality.test.md
> Regression tests for the categorical color cardinality badge under the scatter colorbar (audit issue 2.2).

## Test: `colorbarCardinality`
- Backend collapses high-cardinality categorical color columns into a top-N bucket + `"Other (N)"`. `appState.scatter.colorCardinality` carries `{ used, bucketed }`.
- `updateColorbarUI` reads this and shows/hides `#scatter-colorbar-cardinality`.
- Tests: DOM setup with colorbar elements; `updateColorbarUI` with bucketed cardinality shows text and un-hides element; with no bucketing hides element; density mode hides cardinality; active view not plot hides colorbar.
