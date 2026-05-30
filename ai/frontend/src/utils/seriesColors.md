# seriesColors.ts
> Series color management with default palette.

## Constants
- `SERIES_COLORS: string[]`

Default series color palette.

## Functions
- `normalizeSeriesColor(value: unknown): string | null`
  - Normalizes a color to 6-digit lowercase hex, or null if invalid.
- `getSeriesColor(column: string, fallbackIndex = 0): string` [deps: [appStateCompat][1]]
  - Returns custom color if set, otherwise cycles through SERIES_COLORS.
- `setSeriesColor(column: string, value: string): string | null` [deps: [uiState][2]]
  - Persists a custom color for a series column.

---
[1]: ../../store/appStateCompat.md
[2]: ../../store/uiState.md