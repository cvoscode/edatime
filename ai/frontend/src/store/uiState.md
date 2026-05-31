# frontend/src/store/uiState.ts
> Filter controls, column selection, range state, series colors, profile grid.

## Interface `UiState`
- `filterText: string`
- `selectedCols: string[]`
- `adaptiveFilterColumn: string | null`
- `columnRanges: Record<string, ColumnRange>`
- `adaptiveLineFilters: AdaptiveLineFilter[]`
- `pendingAdaptivePoint: PendingAdaptivePoint | null`
- `seriesColors: Record<string, string>`
- `selectedColorColumn: string | null`
- `profileFilterText: string`
- `previewSelectedColumns: string[]`
- `previewTimeColumn: string | null`
- `profileGridBound: boolean`
- `profileGridHeaderBound: boolean`
- `profileGridSort: ProfileGridSort`
- `profileGridColWidths: number[]`

## Exports
- `uiState: UiState`
- `getSeriesColor(column: string, fallbackIndex?: number): string`
- `setSeriesColor(column: string, value: string): string | null`
- `setSelectedCols(cols: string[]): void`
- `setAdaptiveFilterColumn(col: string | null): void`
- `setColumnRange(col: string, range: ColumnRange): void`
- `clearColumnRange(col: string): void`
- `setColumnRanges(ranges: Record<string, ColumnRange>): void`
- `setAdaptiveLineFilters(filters: AdaptiveLineFilter[]): void`
- `appendAdaptiveLineFilter(filter: AdaptiveLineFilter): void`
- `removeAdaptiveLineFilter(index: number): void`
- `clearAdaptiveLineFilters(): void`
- `setPendingAdaptivePoint(point: PendingAdaptivePoint | null): void`
- `setSelectedColorColumn(col: string | null): void`
- `setSeriesColors(colors: Record<string, string>): void`
- `setFilterText(text: string): void`
- `setProfileFilterText(text: string): void`
- `setPreviewSelectedColumns(cols: string[]): void`
- `setPreviewTimeColumn(col: string | null): void`
- `setProfileGridSort(sort: ProfileGridSort): void`
- `setProfileGridColWidths(widths: number[]): void`
- `setProfileGridBound(bound: boolean): void`
- `setProfileGridHeaderBound(bound: boolean): void`

---
[1]: events.md