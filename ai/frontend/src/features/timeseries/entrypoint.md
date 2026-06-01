# ai/frontend/src/features/timeseries/entrypoint.md
> Exposes the single public Timeseries feature-wiring surface for column chips, range chips, modal wiring, dataset search, and Timeseries action handlers.

## Interface: TimeseriesFeatureDeps
- `fetchAndRender: () => Promise<void>`
- `renderCurrentData: () => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `renderColumnProfilesGrid?: (force?: boolean) => void`
- `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
- `emitChartRangeChange: (sourceKind?: string) => void`
- `registerCleanup: (cleanup: () => void) => void`

## Functions
- `createTimeseriesEntrypoint(deps: TimeseriesFeatureDeps): { init(): void; rebuildColumns(): void; buildRangeControls(): void }` [deps: [buildColumnToggles][1], [initDatasetSearchInputs][2], [initTimeseriesActions][2]]
  - Creates the Timeseries feature owner that initializes child modules and exposes explicit rebuild hooks for columns and range chips.

---
[1]: ./columnsController.md#buildColumnToggles
[2]: ./actions.md
