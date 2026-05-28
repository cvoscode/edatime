# frontend/src/ui/toolbar.ts
> Thin orchestrator that delegates toolbar controls to focused sub-modules.

## Exports (from submodules)
- `analysisStatus`: `updateAnalysisZoom, updateAnalysisYRange, updateAnalysisCursor, updateAnalysisClick`
- `viewport`: `refreshZoomControlsState, getCurrentView, applyViewport, zoomOut, resetZoom, initChartPageFilterGesture`
- `exportControls`: `exportChartFilteredData`

## Functions
- `bindAnalysisChartEvents(): void`
  - Binds chart crosshair and click events to analysis status display.
- `initAnalysisControls(fetchAndRender): void`
  - Wires all sub-controls (toolbar modals, draw controls, chart text, analytics).
- `initPages(): void`
  - Initializes page navigation.
