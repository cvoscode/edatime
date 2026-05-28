# fallback.ts

2D Canvas fallback when WebGPU is unavailable. Mirrors the ChartAdapter interface expected by the chart registry.

## FallbackChart

```typescript
class FallbackChart implements ChartInstance
```

### Constructor

```typescript
constructor(containerId: string)
```

### Methods

```typescript
async init(): Promise<void>
setXRange(): void
setYRange(): void
supportsZoomControls(): boolean
onCrosshairMove(): void
onClick(): void
setChartText(): void
setDrawMode(): void
clearDrawings(): void
fitYToData(): void
getXDomain(): { min: number; max: number } | null
getYRange(): { min: number; max: number } | null
exportPNG(): void
exportSVG(): void
exportHTML(): void
updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void
destroy(): void
```
