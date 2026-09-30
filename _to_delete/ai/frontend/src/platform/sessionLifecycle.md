# frontend/src/platform/sessionLifecycle.ts
> Session restoration and persistence bootstrap. Wraps `autoRestoreSession` / `applySession` and ties them to a `WorkspaceStore`.

## Interfaces
- `RestoreSessionDeps`
  - `metadataTimeRange: { min: number; max: number } | null`
  - `currentDatasetRevision: number`
  - `buildColumnToggles: () => void`
  - `buildRangeControls: () => void`
  - `renderCurrentData: () => void`
  - `fetchAndRender: () => Promise<void>`
  - `workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setSelection' | 'setFilters' | 'setViewport' | 'subscribe'>`

## Functions
- `restoreSessionAfterChartReady(deps: RestoreSessionDeps): Promise<void>`
  - Calls `autoRestoreSession()`; if a saved session exists, applies it and rebuilds the chart UI. [deps: [utils/session][1], [utils/router][2], [workspace/workspaceStore][3]]
- `startSessionPersistence(workspace): () => void`
  - Configures session persistence against the supplied workspace and starts the auto-save loop. Returns the dispose handle. [deps: [utils/session][1], [workspace/workspaceStore][3]]

---
[1]: ../utils/session.md
[2]: ../utils/router.md
[3]: ../workspace/workspaceStore.md