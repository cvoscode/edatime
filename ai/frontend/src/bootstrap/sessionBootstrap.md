# ai/frontend/src/bootstrap/sessionBootstrap.md
> Session initialization on app start — handles auto-restore, auto-save, and import/export.

## Functions
- `restoreSessionAfterChartReady(deps: RestoreSessionDeps): Promise<void>`
  - Restore saved session state after chart is ready, applying column ranges, filters, and viewport.
- `startSessionPersistence(): void`
  - Initialize auto-save and expose exportSession/importSession on window.

## Interfaces
- `RestoreSessionDeps`
  - `metadataTimeRange: { min: number; max: number } | null`
  - `currentDatasetRevision: number`
  - `buildColumnToggles: () => void`
  - `buildRangeControls: () => void`
  - `renderCurrentData: () => void`
  - `fetchAndRender: () => Promise<void>`
