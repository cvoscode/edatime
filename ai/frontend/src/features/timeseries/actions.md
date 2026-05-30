# frontend/src/features/timeseries/actions.ts
> Canonical home for Timeseries action wiring — chart-range reset, filter clear, dataset-search inputs.

## Interface: TimeseriesActionDeps
- `rebuildColumnToggles: () => void`
- `renderColumnProfilesGrid: (force?: boolean) => void`
- `buildRangeControls: () => void`
- `renderCurrentData: () => void`
- `fetchAndRender: () => Promise<void>`
- `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
- `emitChartRangeChange: (sourceKind?: string) => void`
- `registerCleanup: (cleanup: () => void) => void`

## Functions
- `initDatasetSearchInputs(deps: Pick<TimeseriesActionDeps, 'rebuildColumnToggles' | 'renderColumnProfilesGrid'>): void`
  - Wires column and profile filter inputs with debounce.
- `initTimeseriesActions(deps: TimeseriesActionDeps): void`
  - Registers reset-range and clear-all-filters window listeners; exposes `window.__edatime.resetChartRangeToDataset` and `clearAllFilters`.

---
[1]: ../../store/appStateCompat.md
[2]: ../../store/index.md#setViewport
[3]: ../../store/index.md#setColumnRanges
[4]: ../../store/index.md#setAdaptiveLineFilters
[5]: ../../utils/dom.md#debounce