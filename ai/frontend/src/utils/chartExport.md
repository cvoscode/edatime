# ai/frontend/src/utils/chartExport.md

> Lightweight helpers for exporting analytics charts (FFT, spectrogram, heatmap) as PNG, SVG, or HTML.

## Functions
- `exportContainerCanvasPNG(containerId: string, filename: string): void`
  - Composites all `<canvas>` elements inside a container into a single PNG.
- `exportElementPNG(elementId: string, filename: string): Promise<void>`
  - Exports an HTML element as PNG via SVG foreignObject serialization.
- `exportElementSVG(elementId: string, filename: string): void`
  - Exports an HTML element as SVG using foreignObject (preserves DOM styling).
- `exportEChartsPNG(chartInstance: any, filename: string): void`
  - Exports an ECharts chart instance as PNG using its `getDataURL` API.

---
[1]: ./dom.md
[2]: ./toast.md