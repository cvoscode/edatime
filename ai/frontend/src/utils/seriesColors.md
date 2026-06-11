# ai/frontend/src/utils/seriesColors.md

> Per-series color management: default palette cycling and custom color persistence. Reads and writes `uiState.seriesColors` directly (not the `appStateCompat` composite) to keep the data path on the canonical sub-state.

## Dependencies
- `uiState` and `setSeriesColors` from `../store/uiState.js` [deps: [uiState][1], [setSeriesColors][1]]

## Constants
- `SERIES_COLORS: string[]` — the default 6-color palette: `#00d4ff`, `#6c63ff`, `#00c896`, `#f5a623`, `#ff4a6e`, `#c77dff`.

## Functions
- `normalizeSeriesColor(value: unknown): string | null`
  - Normalizes a color to a 6-digit lowercase hex string, or returns null if invalid.
- `getSeriesColor(column: string, fallbackIndex = 0): string` [deps: [uiState][1]]
  - Returns the custom color for a series from `uiState.seriesColors` if set, otherwise cycles through `SERIES_COLORS`.
- `setSeriesColor(column: string, value: string): string | null` [deps: [setSeriesColors][1]]
  - Persists a custom color for a series column into `uiState.seriesColors` via `setSeriesColors`, returning the normalized hex or null if invalid.

---
[1]: ../store/uiState.md