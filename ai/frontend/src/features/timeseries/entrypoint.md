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
- `chartExportPng?: () => void`
- `chartExportSvg?: () => void`
- `exportFilteredCsv?: () => void`
- `exportFilteredJson?: () => void`
- `exportFilteredParquet?: () => void`

## Functions
- `createTimeseriesEntrypoint(deps: TimeseriesFeatureDeps): { init(): void; rebuildColumns(): void; buildRangeControls(): void }` [deps: [buildColumnToggles][1], [initDatasetSearchInputs][2], [initTimeseriesActions][2], [initTimeseriesExportButtons][2]]
  - Creates the Timeseries feature owner that initializes child modules and exposes explicit rebuild hooks for columns and range chips. When **all five** export handlers are provided on the deps object, the entrypoint calls `initTimeseriesExportButtons` with them; otherwise export wiring is skipped so legacy callers don't crash.

---
[1]: ./columnsController.md#buildColumnToggles
[2]: ./actions.md
