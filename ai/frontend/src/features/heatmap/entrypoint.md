# heatmap/entrypoint.ts
> Normalized entrypoint for correlation heatmap page — uses getter-based deps injection.

## Interface: HeatmapEntrypointDeps
```typescript
interface HeatmapEntrypointDeps {
    showPage: (pageName: string) => void;
}
```

## Function: createHeatmapEntrypoint
- `createHeatmapEntrypoint(deps: HeatmapEntrypointDeps): { init: () => void }`
  - `init()` — calls `initHeatmapPage(deps)` directly.

---
[1]: ../../pages/heatmapPage.md
