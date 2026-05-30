# frontend/src/features/timeseries/entrypoint.ts
> Timeseries feature page entrypoint — wires column toggles, range controls, filter modal, search inputs, and timeseries actions.

## Interface: TimeseriesFeatureDeps
```typescript
interface TimeseriesFeatureDeps {
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    renderColumnProfilesGrid?: (force?: boolean) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}
```

## Function: createTimeseriesEntrypoint
- `createTimeseriesEntrypoint(deps: TimeseriesFeatureDeps): { init: () => void; rebuildColumns: () => void; buildRangeControls: () => void }`
  - Creates timeseries feature entrypoint, wiring all column-related controls.
  - `init()` — initializes filter modal, dataset search inputs, and timeseries actions.
  - `rebuildColumns` — rebuilds column toggles.
  - `buildRangeControls` — rebuilds range controls.

---
[1]: ../../ui/columns.md
[2]: ../../bootstrap/timeseriesBootstrap.md