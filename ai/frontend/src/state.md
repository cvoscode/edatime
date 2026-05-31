# ai/frontend/src/state.md
> Centralized application state management with focused sub-states.

## Re-exports
- `chartState` — viewport, chart instance, zoom history [deps: [store/index.md][1]]
- `analyticsState` — rolling bands, anomaly overlays, spectral filter [deps: [store/index.md][1]]
- `uiState` — column selection, ranges, adaptive filters, colors [deps: [store/index.md][1]]
- `datasetState` — metadata, column profiles, numeric cols [deps: [store/index.md][1]]
- `scatterState` — scatter page state [deps: [store/index.md][1]]
- `appState` — backward-compatible composite [deps: [store/index.md][1]]
- `SERIES_COLORS` — default color palette [deps: [utils/seriesColors.md][2]]

## Functions
```typescript
export function normalizeSeriesColor(value: unknown): string | null
export function getSeriesColor(column: string, fallbackIndex?: number): string
export function setSeriesColor(column: string, value: string): string | null
export function setMetaText(text: string): void
export function buildMetaBar(metadata: { total_rows?: number } | null): void
export function sanitizeSelectedColumns(): void
export function ensureRangeStateFromData(dataObj: DataObject): void
export function buildAdaptiveLineFiltersForQuery(): AdaptiveLineFilter[]
export function applyColumnRanges(dataObj: DataObject): FilteredDataObject
export const computeBounds = computeBoundsImpl
export const buildAdaptiveLineY = buildAdaptiveLineYImpl
```

---
[1]: ./store/index.md
[2]: ./utils/seriesColors.md