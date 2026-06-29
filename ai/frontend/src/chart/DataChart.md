# ai/frontend/src/chart/DataChart.md
> ChartGPU WebGPU adapter with drawing overlay, mouse-selection zoom, and PNG/SVG/HTML export.

## Class: DataChart
- `containerId: string` — DOM element ID for chart container.
- `_drawMode: string`, `_drawColor = '#ff0055'`, `_drawWidth = 2` — Drawing state.
- `chartInstance: ChartInstanceAPI | null` — Underlying ChartGPU instance (WebGPU).
- `_lastSeriesList: SeriesConfig[] | null` — Last applied series list including colorized segments.
- `_xMin/_xMax/_yMin/_yMax: number | null` — Current view range bounds.
- `_lastDataYMin/_lastDataYMax: number | null` — Data-driven Y range (used by filters, exports).

### Constructor
- `constructor(containerId, onZoomCallback, onYRangeCallback?, onZoomOutCallback?)` [deps: [ViewSnapshot][1], [SeriesConfig][2]]

### Public Methods
- `destroy(): void` — Tears down observers, removes legend overlay, clears drawing state.
- `deepDispose(): void` — Full disposal including DOM removal of canvas overlays and selection box; safe for GPU device-lost scenarios.
- `setChartText(title, xLabel, yLabel): void` — Synchronizes title/axis label text overlays.
- `setDrawMode(mode, color?, width?): void` — Sets drawing mode ('arrow'/'box'/'none').
- `clearDrawings(): void`, `requestOverlayRender(): void` — Clears or re-renders drawings.
- `resize(): void` — Resizes chart instance and legend overlay; re-renders drawings.
- `setXRange(minMs, maxMs): void` — Sets X-axis time range (ms epoch).
- `async init(): Promise<void>` [deps: [createChart][3]] — Initializes ChartGPU WebGPU instance with theme/palette options, installs resize observer and drawing overlay.
- `supportsZoomControls(): boolean`, `getXDomain(): { min, max } | null`, `setYRange(min, max): void`, `getYRange(): { min, max } | null` — Zoom/Y-range query/set API.
- `cssPointToData(clientX, clientY): { x, y } | null` — Maps CSS coordinates to data space (time/value).
- `zoomY(_factor, _anchorNormalized?): void`, `resetYRange(): void` — Intentionally blank (WebGPU handles zoom internally).
- `fitYToData(): void` — Calls onYRangeCallback with `_lastDataYMin/_lastDataYMax`.
- `onCrosshairMove(callback): void`, `onClick(callback): void` [deps: [ChartGPUCrosshairMovePayload][2]] — Subscribes to ChartGPU events.
- `updateDataMulti(dataObj, columns): void` [deps: [analyzeColorValues][4], [buildColorizedSeries][4], [getSeriesColor][5], [formatTwoDecimals][6], [formatTimeTick][7], [formatTimeTooltip][7]] — Full data update pipeline: filters series, applies color-by column with numeric/categorical scale analysis, builds annotations for markers, sets ChartGPU options.
- `async exportPNG(): Promise<void>`, `async exportSVG(): Promise<void>`, `async exportHTML(): Promise<void>` [deps: [exportDataChartPNG][8], [exportDataChartSVG][8], [exportDataChartHTML][8]] — Export pipeline using `_getCombinedExportCanvas`.

### Private Methods
- `_applyYRange(min, max, sourceKind, setAuto): void` — Internal Y-range setter with auto flag.
- `_buildYAxisOption(): { type: 'value'; min?; max?; tickFormatter }` — Builds yAxis option with 5% headroom padding.
- `_getChartColorPalette(): string[]`, `_buildChartGpuTheme()` — Theme/palette builders from settings.
- `_getVisibilityByBaseNameFromChart(): Map<string, boolean>` — Extracts series visibility by base name from ChartGPU options.
- `_syncLegendOverlay()`, `_ensureLegendOverlay()`, `_addLegendWindowListener()`, `_removeLegendWindowListeners()`, `_syncLegendCtrlHint()`, `_toggleLegendTrace()` — Legend overlay lifecycle with Ctrl+drag pan support and window listener tracking to prevent leaks.
- `_getLegendEntries(): { name, color, visible }[]` — Groups series by base name for legend display.
- `_getDefaultLegendPosition()`, `_applyLegendPosition()`, `_clampLegendPosition()` — Legend positioning logic.
- `_startLegendDrag()`, `_moveLegendDrag()`, `_finishLegendDrag()` — Pointer-based drag handlers for legend repositioning.
- `_initTextOverlays()`, `_syncTextOverlays()` — Title/axis label overlay creation and sync.
- `_initDrawingOverlay(): void` — Creates canvas overlay with pointer event listeners for drawing (arrow/box).
- `_drawArrow(ctx, sx, sy, ex, ey): void` — Renders arrow to CanvasRenderingContext2D.
- `_renderDrawings(): void`, `_renderDrawingsToCtx(ctx, scale): void` — Drawing render pipelines.
- `_renderRollingBandsToCtx(ctx, scale): void` [deps: [getChartPalette][9]] — Renders rolling ±1σ/±2σ bands to overlay canvas.
- `_renderAnomalyRegionsToCtx(ctx, scale): void` [deps: [getChartPalette][9]] — Renders anomaly region highlights.
- `_renderAdaptiveFilterLinesToCtx(ctx, scale): void` [deps: [buildAdaptiveLineY][10], [getChartPalette][9]] — Renders adaptive filter preview lines and pending points.
- `_renderAnnotationsToCtx(ctx, scale): void` — Renders time annotations (notes/bookmarks) on overlay canvas via `window.__edatimeAnnotations`.
- `_initMouseSelectionZoom(): void`, `_initCtrlPan(): void` [deps: [initBoxZoom][11], [initCtrlPan][11]] — Wire up mouse selection zoom and Ctrl+drag pan.
- `_getExportViewport()`, `_getExportDomains()` — Export canvas viewport/domain configuration.
- `async _getCombinedExportCanvas(includeDrawings): Promise<HTMLCanvasElement | null>` — Renders chart + drawings to a single export canvas.
- `_renderExportChartToCanvas(canvas, viewport, domains, includeDrawings): void` — Full export rendering: series lines, axes with nice ticks (linear/time), title/axis labels, legend box, optional drawings.

### Constants
- `CHART_GRID = { left: 120, right: 30, top: 16, bottom: 36 }` — Grid padding in pixels.

[deps: [ViewSnapshot][1], [ChartGPUOptions/ChartGPUCrosshairMovePayload/SeriesConfig/AnnotationConfig][2], [createChart][3], [analyzeColorValues/buildColorizedSeries/categoryColorFor/colorForScaleValue/baseSeriesName][4], [getSeriesColor][5], [formatTwoDecimals][6], [niceLinearTicks/niceTimeTicks/formatTimeTick/formatTimeTooltip][7], [exportDataChartPNG/exportDataChartSVG/exportDataChartHTML][8], [getChartPalette/getResolvedTheme/onThemeChange/CHART_PALETTES/getSetting][9], [buildAdaptiveLineY][10], [initBoxZoom/initCtrlPan/createCanvasOverlay/ensureRelativePosition/GridLayout][11]]

---
[1]: ../types.md#ViewSnapshot
[2]: ../../libs/chartgpu/dist/index.d.ts
[3]: ../../libs/chartgpu/dist/index.js#createChart
[4]: colorScale.ts
[5]: ../utils/seriesColors.ts#getSeriesColor
[6]: ../formatUtils.ts#formatTwoDecimals
[7]: ticks.ts
[8]: dataChartExport.ts
[9]: ../utils/theme.ts
[10]: ../services/timeseries/filtering.ts#buildAdaptiveLineY
[11]: chartInteractions.ts