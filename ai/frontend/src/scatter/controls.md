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

## Module-Scoped State
- `nextBindIndex(): number` — returns a monotonically increasing bind index stored on `globalThis.__scatterBindIndex`.
- `latestBindIndex(): number` — returns the current global bind index.
- `zoomBadgeInterval: number | null` — singleton interval handle. Created lazily on the first `bindScatterControls` call so repeated bindings do not multiply timers.
- `refreshLatestZoomBadge: () => void` — captured reference to the latest `refreshBadge` closure. The interval always invokes the most recent closure so successive bindings stay in sync.

## Functions
- `bindScatterControls(cb: ScatterRenderCallbacks): void`
  - Binds all scatter control event listeners: X/Y column selects, bin size, normalization, render mode, diagonal mode (routes to `rerender()` in single-plot or `refreshActiveScatterView()` in matrix), color column/scale, linked brush, suggestion threshold, matrix mode toggle, export buttons (PNG/SVG/HTML/CSV/Parquet), view-change buttons, and page-change/filter event listeners.
  - **Density colormap removed:** the toolbar no longer hosts a per-page `#scatter-colormap` select — the density colormap is configured globally via `COLOR_SCALES` in [utils/settings.ts][3].
  - **Causal shortcut removed:** `#scatter-open-causal-btn` and its handler are gone; causal preselect now lives in [correlationsPanel.ts:openScatterPairInCausal][4].
  - **Zoom controls:** wires `#scatter-zoom-out-btn` and `#scatter-zoom-reset-btn` to pop the zoom history / reset to the full extent, with `#scatter-zoom-range-badge` reflecting the current zoom ratio. A 4Hz interval keeps the badge in sync with `applyView()` changes (since they mutate `appState.scatter.view` directly without a store event). The interval is installed exactly once across all `bindScatterControls` calls.
  - **Page-change handler:** uses a bind-index guard (`nextBindIndex`/`latestBindIndex`) on `globalThis` so only the latest `bindScatterControls` invocation processes events — previous test listeners are silenced. Sets `appState.scatter.lastQueryContextKey` after render. Treats `initScatterPage` as the single authoritative source of `appState.scatter.metadata`; if the scatter state has no metadata when the handler fires, it bounces through `cb.initScatterPage(appState.metadata)` instead of writing metadata directly. When the page is already initialized and the (view, query-context) pair matches the cached `lastQueryContextKey`, the handler returns early without invoking `setScatterView` or a re-render. The trailing `cb.refreshActiveScatterView()` from the previous version was dropped because the new fast-path makes it redundant for the unchanged case and the changed cases already cover the necessary render work.

---
[1]: ./scatterPage.md
[2]: ../types.md#DatasetMetadata
[3]: ../utils/settings.md
[4]: ./correlationsPanel.md#openScatterPairInCausal
