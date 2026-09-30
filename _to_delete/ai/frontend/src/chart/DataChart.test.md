# ai/frontend/src/chart/DataChart.test.md
> Tests for DataChart pure-logic methods: getXDomain, setYRange, getYRange, setChartText, setDrawMode, clearDrawings, requestOverlayRender, setXRange, cssPointToData, fitYToData, resetYRange, zoomY, destroy, supportsZoomControls.

## Tests
- **constructor stores containerId**: `chart.containerId === 'nonexistent-container'`
- **constructor stores onZoomCallback**: `chart.onZoomCallback === cb` when callback provided
- **constructor stores onYRangeCallback**: `chart.onYRangeCallback === cb` when callback provided
- **constructor stores onZoomOutCallback**: `chart.onZoomOutCallback === cb` when callback provided
- **getXDomain returns null before init**: `getXDomain()` returns `{xMin: null, xMax: null}` before chart init
- **setYRange stores _yMin/_yMax and _yAuto = false**: `setYRange(min, max)` updates internal state
- **getYRange returns stored bounds**: `getYRange()` returns `{yMin, yMax}` from last setYRange call
- **setChartText stores title/xLabel/yLabel**: `setChartText(title, xLabel, yLabel)` updates internal chart text
- **setDrawMode updates _drawMode, _drawColor, _drawWidth**: `setDrawMode(mode, color, width)` updates drawing state
- **clearDrawings empties _drawings array**: `clearDrawings()` sets `_drawings = []`
- **requestOverlayRender queues animation frame**: `requestOverlayRender()` schedules render via requestAnimationFrame
- **setXRange stores _xMin/_xMax**: `setXRange(min, max)` updates stored x bounds
- **cssPointToData converts DOM coords to data coords**: `cssPointToData(clientX, clientY)` maps CSS pixel position to data space
- **fitYToData computes nice y bounds from data**: `fitYToData(series)` derives `_yMin/_yMax` from min/max of series values
- **resetYRange sets _yAuto = true and clears bounds**: `resetYRange()` enables auto-scaling
- **zoomY scales y axis by factor around center**: `zoomY(factor)` scales `_yMin/_yMax` by factor from center
- **destroy disconnects resize observers and sets chartInstance to null**: `destroy()` cleans up observers and chart
- **supportsZoomControls returns boolean**: `supportsZoomControls()` returns `true` when zoom callbacks are wired