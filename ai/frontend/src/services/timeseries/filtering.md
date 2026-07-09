# services/timeseries/filtering.md

> Computes column range bounds, applies numeric range and adaptive line filters to time-series data, and syncs filter state with the split dataset/UI stores.

## Functions

- `ensureRangeStateFromData(dataObj: DataObject): void`
  - Ensures column ranges are populated for any selected column that lacks a range.
- `computeBounds(values: ArrayLike<number>): { min: number; max: number } | null`
  - Computes min/max bounds over a numeric array, skipping non-finite values.
- `ensureRangeStateFromDataState(dataObj: DataObject, selectedCols: string[], columnRanges: Record<string, ColumnRange>): Record<string, ColumnRange>`
  - Pure variant of `ensureRangeStateFromData` that accepts explicit state instead of reading from `uiState`.
- `buildAdaptiveLineY(filter: AdaptiveLineFilter, tsMs: number): number | null`
  - Evaluates the Y value of an adaptive line filter at a given timestamp using linear interpolation.
- `passesAdaptiveLineFilters(tsMs: number, valuesByColumn: Record<string, number | undefined>, filters: AdaptiveLineFilter[]): boolean`
  - Returns true when a point passes all adaptive line keepAbove/keepBelow constraints.
- `buildAdaptiveLineFiltersForQueryState(filters: AdaptiveLineFilter[]): ScatterLineFilterSpec[]`
  - Serialises and validates adaptive line filters for API queries, stripping non-finite values and dropping compatibility `id` fields.
- `clipDataToViewport(dataObj: DataObject, startMs: number, endMs: number): DataObject`
  - Returns a data object limited to timestamps inside the visible viewport, preserving aligned `ts`, `values`, and optional color arrays.
- `applyColumnRangesToData(dataObj: DataObject, selectedCols: string[], columnRanges: Record<string, ColumnRange>, adaptiveLineFilters: AdaptiveLineFilter[]): FilteredDataObject`
  - Applies numeric column ranges and adaptive line filters to produce a filtered data object.
- `buildAdaptiveLineFiltersForQuery(): ScatterLineFilterSpec[]`
  - Reads `uiState.adaptiveLineFilters` and returns canonical filter payloads for API use.
- `applyColumnRanges(dataObj: DataObject): FilteredDataObject`
  - Applies column ranges and adaptive filters from `uiState` to a data object.
- `sanitizeSelectedColumns(): void`
  - Removes time/datetime columns and non-existent columns from `datasetState` / `uiState`.

---
[1]: ../../types.md
[2]: ../../store/datasetState.md
[3]: ../../store/uiState.md
