# frontend/src/store/uiState.ts
> Filter controls, adaptive-filter plumbing, series colors, profile-grid state, preview state.

> Source: `frontend/src/store/uiState.ts`. Last reconciled: 2026-07-16.
> Note: the earlier `selectedCols`, `columnRanges`, `adaptiveLineFilters`, and `selectedColorColumn` fields were moved out to dedicated sub-state modules; this file no longer owns them. New code should not reintroduce them here.

## Type Alias `ProfileFilterCategory`
- `'all' | 'numeric' | 'datetime'` — controls the column-profile grid filter category. `'all'` keeps the legacy behaviour; `'numeric'` / `'datetime'` restrict visible rows.

## Interface `UiState`
- `filterText: string` — column-name filter for the series chip list.
- `adaptiveFilterColumn: string | null` — series currently targeted by an adaptive line filter.
- `pendingAdaptivePoint: PendingAdaptivePoint | null` — partial adaptive-filter point awaiting the next chart click to complete the line.
- `seriesColors: Record<string, string>` — per-series custom chart colors.
- `profileFilterText: string` — column-profile grid name filter.
- `profileFilterCategory: ProfileFilterCategory` — column-profile grid category filter (see above).
- `previewSelectedColumns: string[]` — columns selected during upload preview.
- `previewTimeColumn: string | null` — time column selected during upload preview.
- `profileGridBound: boolean` — whether the profile grid is column-bound to the page footer.
- `profileGridHeaderBound: boolean` — whether the profile grid header is bound to the page footer.
- `profileGridSort: ProfileGridSort` — current sort `{ key, dir }`.
- `profileGridColWidths: number[]` — current column widths in pixels.

## State Object
- `uiState: UiState` — singleton state object.

## Setters (all emit store events through `events.ts`)
- `setAdaptiveFilterColumn(col: string | null): void`
- `setPendingAdaptivePoint(point: PendingAdaptivePoint | null): void`
- `setSeriesColors(colors: Record<string, string>): void`
- `setFilterText(text: string): void`
- `setProfileFilterText(text: string): void`
- `setProfileFilterCategory(category: ProfileFilterCategory): void` — silently coerces unknown values to `'all'`.
- `setPreviewSelectedColumns(cols: string[]): void`
- `setPreviewTimeColumn(col: string | null): void`
- `setProfileGridSort(sort: ProfileGridSort): void`
- `setProfileGridColWidths(widths: number[]): void`
- `setProfileGridBound(bound: boolean): void`
- `setProfileGridHeaderBound(bound: boolean): void`

<!-- internal deps -->
[events]: ./events.md