# frontend/src/features/timeseries/actions.ts
> Canonical home for Timeseries action wiring — chart-range reset, filter clear, dataset-search inputs, and export button bindings. Reads dataset state from `datasetState` and chart range from `chartState`.

## Interface: TimeseriesActionDeps
- `rebuildColumnToggles: () => void`
- `renderColumnProfilesGrid: (force?: boolean) => void`
- `buildRangeControls: () => void`
- `renderCurrentData: () => void`
- `fetchAndRender: () => Promise<void>`
- `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
- `emitChartRangeChange: (sourceKind?: string) => void`
- `registerCleanup: (cleanup: () => void) => void`

## Interface: TimeseriesExportDeps
- `chartExportPng: () => void`
- `chartExportSvg: () => void`
- `exportFilteredCsv: () => void`
- `exportFilteredJson: () => void`
- `exportFilteredParquet: () => void`

## Functions
- `initDatasetSearchInputs(deps: Pick<TimeseriesActionDeps, 'rebuildColumnToggles' | 'renderColumnProfilesGrid'>): void`
  - Wires column and profile filter inputs with debounce.
- `initTimeseriesActions(deps: TimeseriesActionDeps): void`
  - Registers reset-range and clear-all-filters window listeners; exposes `window.__edatime.resetChartRangeToDataset` and `clearAllFilters`.
- `initTimeseriesExportButtons(deps: TimeseriesExportDeps): void`
  - Wires the top-level toolbar buttons (`#export-png-btn`, `#export-csv-btn`) and the export-options modal buttons (`#export-svg-btn`, `#export-data-csv-btn`, `#export-data-json-btn`, `#export-data-parquet-btn`). Each button is bound at most once via a `dataset.bound` flag to survive re-init.

---
[1]: ../../store/datasetState.md
[2]: ../../store/chartState.md
[3]: ../../store/chartState.md#setViewport
[4]: ../../store/uiState.md#setSeriesColors
[5]: ../../store/uiState.md#setAdaptiveFilterColumn
[6]: ../../utils/dom.md#debounce
