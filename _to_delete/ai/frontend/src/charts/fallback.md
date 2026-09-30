# ai/frontend/src/charts/fallback.md
> 2D Canvas fallback chart when WebGPU is unavailable; mirrors the ChartAdapter interface.

## Class: FallbackChart implements ChartInstance
- `constructor(containerId: string)` — Creates the fallback chart bound to a DOM container.
- `async init(): void` — Initialises the canvas element and ResizeObserver.
- `updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void` — Renders series data onto the 2D canvas with auto-scaling axes.

## Stub Methods (no-op)
- `setXRange(): void`
- `setYRange(): void`
- `supportsZoomControls(): boolean` — returns `false`
- `onCrosshairMove(): void`
- `onClick(): void`
- `setChartText(): void`
- `setDrawMode(): void`
- `clearDrawings(): void`
- `fitYToData(): void`
- `getXDomain(): { min: number; max: number } | null` — returns `null`
- `getYRange(): { min: number; max: number } | null` — returns `null`
- `exportPNG(): void`
- `exportSVG(): void`
- `exportHTML(): void`

---
[1]: ../utils/seriesColors.md#SERIES_COLORS
[2]: ../types.md#ChartInstance
