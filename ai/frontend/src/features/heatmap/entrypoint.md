# features/heatmap/entrypoint.ts
> Normalized entrypoint for correlation heatmap page — uses getter-based deps injection. Lazy-loads `initHeatmapPage` via dynamic import.

## Interface: HeatmapEntrypointDeps
```typescript
interface HeatmapEntrypointDeps {
    showPage: (pageName: string) => void;
}
```

## Function: createHeatmapEntrypoint
- `createHeatmapEntrypoint(deps: HeatmapEntrypointDeps): { init: () => Promise<void> }` [deps: [initHeatmapPage][1]]
  - `init()` — dynamically imports `'../../pages/heatmapPage.js'`, then `initHeatmapPage(deps)`.

---
[1]: ../../pages/heatmapPage.md
