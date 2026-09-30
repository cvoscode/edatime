# ai/frontend/src/chart/dataChartExport.md
> Wraps a baked chart PNG in an SVG `<image>` and triggers a download via a caller-supplied sink. Kept as a thin, testable module so the SVG export path can be unit-tested without touching the DOM or the real download pipeline.

## Interface: DataChartSvgExportOptions
- `getCanvas: (includeDrawings: boolean) => Promise<HTMLCanvasElement>` — resolves to the chart canvas to bake. Pass `true` when drawings should be composited.
- `downloadBlob: (blob: Blob, filename: string) => void` — receives the generated SVG blob and filename.
- `filename: string` — target filename (e.g. `chart.svg`).

## Functions
- `exportDataChartSVG(options: DataChartSvgExportOptions): Promise<void>`
  - Bakes the chart canvas (with drawings) into a PNG data URL, embeds it in an SVG `<image>`, wraps the SVG in a `Blob` with type `image/svg+xml`, and hands the blob to `options.downloadBlob(blob, options.filename)`.
