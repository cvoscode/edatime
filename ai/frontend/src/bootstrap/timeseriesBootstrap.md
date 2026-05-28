# ai/frontend/src/bootstrap/timeseriesBootstrap.md
> Timeseries page initialization — wires search inputs, chart range reset, and filter clearing.

## Functions
- `initDatasetSearchInputs(deps: Pick<TimeseriesBootstrapDeps, 'rebuildColumnToggles' | 'renderColumnProfilesGrid'>): void`
  - Initialize column filter and profile filter search inputs with debounced handlers.
- `initTimeseriesActions(deps: TimeseriesBootstrapDeps): void`
  - Wire chart range reset and clear-all-filters handlers; expose resetChartRangeToDataset and clearAllFilters on window.

## Interfaces
- `TimeseriesBootstrapDeps`
  - `rebuildColumnToggles: () => void`
  - `renderColumnProfilesGrid: (force?: boolean) => void`
  - `buildRangeControls: () => void`
  - `renderCurrentData: () => void`
  - `fetchAndRender: () => Promise<void>`
  - `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
  - `emitChartRangeChange: (sourceKind?: string) => void`
  - `registerCleanup: (cleanup: () => void) => void`
