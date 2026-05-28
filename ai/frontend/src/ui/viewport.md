# frontend/src/ui/viewport.ts
> Zoom, view-history, and chart-gesture controls.

## Functions
- `refreshZoomControlsState(): void`
  - Updates zoom reset button disabled state.
- `updateZoomRangeBadge(): void`
  - Updates the zoom percentage badge display.
- `getCurrentView(): ViewSnapshot`
  - Gets current viewport as xMin/xMax/yMin/yMax.
- `applyViewport(view, fetchAndRender, sourceKind?): void`
  - Applies a viewport snapshot and triggers re-fetch.
- `zoomOut(fetchAndRender): void`
  - Zooms out one step in zoom history.
- `resetZoom(fetchAndRender): void`
  - Resets to initial view.
- `initChartPageFilterGesture(): void`
  - Initializes context menu filter gesture on chart.
- `initResetZoomListener(fetchAndRender): void`
  - Listens for reset-zoom events.
