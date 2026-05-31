# frontend/src/bootstrap/sessionBootstrap.ts
> Session restoration after chart ready and session persistence wiring.

## Interface: RestoreSessionDeps
```typescript
interface RestoreSessionDeps {
    metadataTimeRange: { min: number; max: number } | null;
    currentDatasetRevision: number;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
}
```

## Functions

### restoreSessionAfterChartReady
- `restoreSessionAfterChartReady(deps: RestoreSessionDeps): Promise<void>`
  - Auto-restores saved session from storage, applies it, rebuilds UI (column toggles, range controls), and re-renders chart data.

### startSessionPersistence
- `startSessionPersistence(): void`
  - Initializes auto-save and wires `window.__edatime.exportSession` / `importSession`.

---
[1]: ../utils/session.md
[2]: ../utils/router.md
