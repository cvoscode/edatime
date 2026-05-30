# frontend/src/features/heatmap/entrypoint.ts
> Heatmap feature page entrypoint.

## Function: createHeatmapEntrypoint
- `createHeatmapEntrypoint(deps: { showPage: (page: string) => void }): { init: () => Promise<void> }`
  - Creates heatmap page entrypoint.
  - `init()` — registers page lifecycle, sets up heatmap chart and controls.