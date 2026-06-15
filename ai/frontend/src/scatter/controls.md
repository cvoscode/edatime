# ai/frontend/src/scatter/controls.md
> Scatter control wiring — all event listeners bound to scatter page controls. Does NOT import from scatterPage.ts to avoid circular deps.

## Interface: ScatterRenderCallbacks
```ts
interface ScatterRenderCallbacks {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    renderScatter: () => Promise<void>;
    refreshCorrelationsAndSuggestions: () => Promise<void>;
    refreshActiveScatterView: () => Promise<void>;
    setScatterView: (viewName: string, options?: { render?: boolean }) => Promise<void>;
    handleErr: (err: unknown) => void;
    rerenderScatterFromCache: (resetViewFlag?: boolean) => Promise<void>;
    renderScatterDebounced: () => void;
    syncScatterFilterBadge: () => void;
}
```

## Functions
- `bindScatterControls(cb: ScatterRenderCallbacks): void`
  - Binds all scatter control event listeners: X/Y column selects, bin size, colormap, normalization, render mode, diagonal mode (routes to `rerender()` in single-plot or `refreshActiveScatterView()` in matrix), color column/scale, linked brush, suggestion threshold, matrix mode toggle, export buttons (PNG/SVG/HTML/CSV/Parquet), view-change buttons, and page-change/filter event listeners.
  - **Zoom controls:** wires `#scatter-zoom-out-btn` and `#scatter-zoom-reset-btn` to pop the zoom history / reset to the full extent, with `#scatter-zoom-range-badge` reflecting the current zoom ratio. A 4Hz interval keeps the badge in sync with `applyView()` changes (since they mutate `appState.scatter.view` directly without a store event).
  - **Causal shortcut:** `#scatter-open-causal-btn` dispatches `edatime:causal-preselect` with the current X/Y columns and clicks the causal sidebar item.
  - **Page-change handler:** treats `initScatterPage` as the single authoritative source of `appState.scatter.metadata`; if the scatter state has no metadata when the handler fires, it bounces through `cb.initScatterPage(appState.metadata)` instead of writing metadata directly. This keeps the handler strictly an effect, not a side-channel metadata source.

---
[1]: ./scatterPage.md
[2]: ../types.md#DatasetMetadata
