# chartgpu.d.md

> Ambient type declarations for the vendored ChartGPU WebGPU-accelerated charting library.

## Interfaces

### `ChartGPUOptions`
- `powerPreference?: 'low-power' | 'high-performance'`
- `grid?: { left?: number; right?: number; top?: number; bottom?: number }`
- `xAxis?: { type?: 'time' | 'value' | 'category'; min?: number; max?: number; tickFormatter?: (value: number) => string }`
- `yAxis?: { type?: 'value' | 'category'; tickFormatter?: (value: number) => string }`
- `tooltip?: { show?: boolean; trigger?: 'axis' | 'item'; formatter?: (params: unknown) => string }`
- `legend?: { show?: boolean; position?: string }`
- `series?: ChartSeriesConfig[]`
- `annotations?: ChartAnnotation[]`

### `ChartSeriesConfig`
- `type: string`
- `name: string`
- `color?: string`
- `visible?: boolean`
- `showInLegend?: boolean`
- `data: [number, number][]`

### `ChartAnnotation`
- `type: string`
- `x?: number`
- `y?: number`
- `layer?: string`
- `marker?: { symbol?: string; size?: number; style?: { color?: string } }`

### `ChartGPUInstance`
- `readonly options: Readonly<ChartGPUOptions>`
- `readonly disposed: boolean`
- `setOption(options: ChartGPUOptions): void`
- `resize(): void`
- `dispose(): void`
- `on(event: string, callback: (payload: unknown) => void): void`
- `getZoomRange?(): { start: number; end: number }`
- `setZoomRange?(start: number, end: number, source?: string): void`

## Functions

- `createChart(container: HTMLElement, options: ChartGPUOptions): Promise<ChartGPUInstance>`
  - Instantiates a ChartGPU chart in the given container element.