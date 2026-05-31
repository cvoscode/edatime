# ai/frontend/src/utils/seriesColors.md

> Per-series color management: default palette cycling and custom color persistence.

## Constants
- `SERIES_COLORS: string[]` — the default 6-color palette: `#00d4ff`, `#6c63ff`, `#00c896`, `#f5a623`, `#ff4a6e`, `#c77dff`.

## Functions
- `normalizeSeriesColor(value: unknown): string | null`
  - Normalizes a color to a 6-digit lowercase hex string, or returns null if invalid.
- `getSeriesColor(column: string, fallbackIndex = 0): string`
  - Returns the custom color for a series if set, otherwise cycles through `SERIES_COLORS`.
- `setSeriesColor(column: string, value: string): string | null`
  - Persists a custom color for a series column, returning the normalized hex or null if invalid.