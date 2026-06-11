# ai/frontend/src/legacy/state.md
> Archived snapshot of the original `frontend/src/state.ts` module. Kept for legacy import paths and as a reference for the centralized state surface it once defined. New code must NOT import from this file.

## Status
- **Archived.** The active shim is `frontend/src/store/appStateCompat.ts`, which re-exports `appState` from `store/index.ts`. This legacy file is preserved only so that any unconverted references continue to resolve and to document the historical API surface.

## Re-exports (historical)
- `chartState` — viewport, chart instance, zoom history [deps: [store/index.md][1]]
- `analyticsState` — rolling bands, anomaly overlays, spectral filter [deps: [store/index.md][1]]
- `uiState` — column selection, ranges, adaptive filters, colors [deps: [store/index.md][1]]
- `datasetState` — metadata, column profiles, numeric cols [deps: [store/index.md][1]]
- `scatterState` — scatter page state [deps: [store/index.md][1]]
- `appState` — backward-compatible composite [deps: [store/index.md][1]]
- `SERIES_COLORS`, `PROFILE_COLUMNS` — palette and profile grid definitions [deps: [utils/seriesColors.md][2]]

## Functions (historical)
- `normalizeSeriesColor(value: unknown): string | null`
- `getSeriesColor(column: string, fallbackIndex?: number): string`
- `setSeriesColor(column: string, value: string): string | null`
- `setMetaText(text: string): void`
- `buildMetaBar(metadata: { total_rows?: number } | null): void`
- `sanitizeSelectedColumns(): void`
- `ensureRangeStateFromData(dataObj: DataObject): void`
- `buildAdaptiveLineFiltersForQuery(): AdaptiveLineFilter[]`
- `applyColumnRanges(dataObj: DataObject): FilteredDataObject`
- `computeBounds`, `buildAdaptiveLineY`
- `formatAnalysisTime`, `formatCount`, `isTemporalDtype`, `normalizeDtypeLabel`, `formatProfileValue`, `formatToDatetimeLocal`, `toFiniteNumberOrNull`

## Migration map
- The `state.ts` test file was deleted and its cases were migrated to focused test files (e.g. `frontend/src/utils/format.test.ts` for format helpers). New tests should target the focused module, not this archive.
- The `uiState.seriesColors` data path now lives in `frontend/src/utils/seriesColors.ts` (importing directly from `store/uiState.ts`).

---
[1]: ../store/index.md
[2]: ../utils/seriesColors.md
