# ai/frontend/src/scatter/controls.md
> Scatter control wiring — all event listeners bound to scatter page controls. Does NOT import from scatterPage.ts to avoid circular deps.

## Interface: ScatterRenderCallbacks
```ts
interface ScatterRenderCallbacks {
    renderScatter: () => Promise<void>;
    refreshCorrelationsAndSuggestions: () => Promise<void>;
    refreshActiveScatterView: () => Promise<void>;
    setScatterView: (viewName: string, options?: { render?: boolean }) => Promise<void>;
    handleErr: (err: unknown) => void;
    rerenderScatterFromCache: (resetViewFlag?: boolean) => Promise<void>;
    renderScatterDebounced: () => void;
    syncScatterFilterBadge: () => void;
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
}
```

## Functions
- `bindScatterControls(cb: ScatterRenderCallbacks): void`
  - Binds all scatter control event listeners: X/Y column selects, bin size, colormap, normalization, render mode, diagonal mode (routes to `rerender()` in single-plot or `refreshActiveScatterView()` in matrix), color column/scale, linked brush, suggestion threshold, matrix mode toggle, export buttons (PNG/SVG/HTML/CSV/Parquet), view-change buttons, and page-change/filter event listeners. All select elements are typed as `HTMLElement` and use `getDropdownValue` for value reading.
  - The `edatime:page-change` handler for `scatter` now treats `initScatterPage` as the single authoritative source of `appState.scatter.metadata`: if metadata is missing on the scatter state, the handler bounces through `cb.initScatterPage(appState.metadata)` rather than writing to `appState.scatter.metadata` directly. This keeps the handler strictly an effect, not a side-channel metadata source.

---
[1]: ./scatterPage.md
[2]: ../types.md#DatasetMetadata