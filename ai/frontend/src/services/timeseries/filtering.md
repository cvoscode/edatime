# filtering.ts
> Timeseries data filtering utilities — range and adaptive line-based filtering.

## Functions
- `ensureRangeStateFromData(dataObj: DataObject): void` [deps: [appStateCompat][1], [uiState][2]]
  - Ensures column ranges are populated from data for selected columns.
- `computeBounds(values: ArrayLike<number>): { min: number; max: number } | null`
  - Computes min/max bounds for a set of numeric values.
- `ensureRangeStateFromDataState(dataObj: DataObject, selectedCols: string[], columnRanges: Record<string, ColumnRange>): Record<string, ColumnRange>`
  - Stateless version — returns updated ranges without mutation.
- `buildAdaptiveLineY(filter: AdaptiveLineFilter, tsMs: number): number | null`
  - Computes Y value on an adaptive filter line at a given timestamp.
- `passesAdaptiveLineFilters(tsMs: number, valuesByColumn: Record<string, number | undefined>, filters: AdaptiveLineFilter[]): boolean`
  - Tests whether a point passes all adaptive line filters.
- `buildAdaptiveLineFiltersForQueryState(filters: AdaptiveLineFilter[]): AdaptiveLineFilter[]`
  - Normalizes and validates adaptive line filters for query use.
- `applyColumnRangesToData(dataObj: DataObject, selectedCols: string[], columnRanges: Record<string, ColumnRange>, adaptiveLineFilters: AdaptiveLineFilter[]): FilteredDataObject`
  - Applies column ranges and adaptive line filters to produce a filtered data object.

## Types
- `AdaptiveLineFilter { column: string; x1: number; y1: number; x2: number; y2: number; keepAbove: boolean }`
- `ColumnRange { from: number; to: number }`
- `FilteredDataObject extends DataObject { series: Record<string, { x: Float64Array; y: Float64Array }>; colorByColumn: Record<string, (number | string | null)[]> }`

---
[1]: ../../store/appStateCompat.md
[2]: ../../store/uiState.md
