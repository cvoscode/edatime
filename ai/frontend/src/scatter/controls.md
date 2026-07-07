# ai/frontend/src/scatter/controls.md
> Binds the scatter page toolbar, export actions, and page-change/filter listeners without importing `scatterPage.ts`.

## Interface `ScatterRenderCallbacks`
- `initScatterPage: (metadata: DatasetMetadata) => Promise<void>`
- `renderScatter: () => Promise<void>`
- `refreshCorrelationsAndSuggestions: () => Promise<void>`
- `refreshActiveScatterView: () => Promise<void>`
- `setScatterView: (viewName: string, options?: { render?: boolean }) => Promise<void>`
- `handleErr: (err: unknown) => void`
- `rerenderScatterFromCache: (resetViewFlag?: boolean) => Promise<void>`
- `renderScatterDebounced: () => void`
- `syncScatterFilterBadge: () => void`

## Functions
- `bindScatterControls(cb: ScatterRenderCallbacks): void`
  - Wires X/Y selects, render-mode toggles, diagonal mode, color controls, linked brush, suggestion threshold, matrix mode buttons, exports, filter events, and scatter page-entry behavior.
  - The `edatime:page-change` listener now guards itself with a monotonic bind index and computes `buildOverviewContextKey({ ...buildScatterQueryContext(...), x, y, colorColumn })` so axis-only navigation invalidates the cache.
- `updateRangeFill(input: HTMLInputElement | null): void`
  - Writes the `--range-fill` CSS variable for slider-style inputs.

---
[1]: ./state.md#buildOverviewContextKey
[2]: ./state.md#buildScatterQueryContext
[3]: ../types.md#DatasetMetadata
