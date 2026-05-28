# chart/index.ts

Chart service exports for rendering and exporting data visualizations.

## Exports

```typescript
class DataChart

function getChartType(name: string): ChartType | null
function registerChartType(name: string, type: ChartType): void

class FallbackChart

// Export functions
function exportContainerCanvasHTML(): string
function exportContainerCanvasPNG(container: HTMLElement, options?: ExportOptions): Promise<Blob>
function exportContainerCanvasSVG(container: HTMLElement, options?: ExportOptions): Promise<Blob>
function exportEChartsHTML(chart: EChartsType): string
function exportEChartsPNG(chart: EChartsType, options?: ExportOptions): Promise<Blob>
function exportEChartsSVG(chart: EChartsType): string
function exportElementHTML(element: HTMLElement): string
function exportElementPNG(element: HTMLElement, options?: ExportOptions): Promise<Blob>
function exportElementSVG(element: HTMLElement): string
function exportMatrixCSV(matrix: number[][], columns: string[]): string
function exportTraceCSV(trace: TraceData): string
```
