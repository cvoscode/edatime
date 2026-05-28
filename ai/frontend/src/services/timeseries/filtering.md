# filtering.ts

Timeseries data filtering utilities for range and line-based filtering.

## Functions

```typescript
function computeBounds(
    values: ArrayLike<number>,
): { min: number; max: number } | null

function ensureRangeStateFromDataState(
    dataObj: DataObject,
    selectedCols: string[],
    columnRanges: Record<string, ColumnRange>,
): Record<string, ColumnRange>

function buildAdaptiveLineY(
    filter: AdaptiveLineFilter,
    tsMs: number,
): number | null

function passesAdaptiveLineFilters(
    tsMs: number,
    valuesByColumn: Record<string, number | undefined>,
    filters: AdaptiveLineFilter[],
): boolean

function buildAdaptiveLineFiltersForQueryState(
    filters: AdaptiveLineFilter[],
): AdaptiveLineFilter[]

function applyColumnRangesToData(
    dataObj: DataObject,
    selectedCols: string[],
    columnRanges: Record<string, ColumnRange>,
    adaptiveLineFilters: AdaptiveLineFilter[],
): FilteredDataObject
```

## Types

```typescript
interface AdaptiveLineFilter {
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

interface ColumnRange {
    from: number;
    to: number;
}

interface FilteredDataObject extends DataObject {
    series: Record<string, { x: Float64Array; y: Float64Array }>;
    colorByColumn: Record<string, (number | string | null)[]>;
}
```
