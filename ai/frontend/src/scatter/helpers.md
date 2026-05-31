# ai/frontend/src/scatter/helpers.md
> Scatter-page shared utilities: palettes, formatting, color math, error display, and canvas primitives.

## Constants
- `MATRIX_POINT_LIMIT = 8000` — max points fetched per matrix cell
- `MATRIX_MAX_COLUMNS = 4` — max columns displayed in scatter matrix
- `HISTOGRAM_BINS = 24` — default histogram bin count
- `DEFAULT_SCATTER_SUGGESTION_THRESHOLD = 0.7` — minimum correlation for suggestions
- `LOW_CARDINALITY_LIMIT = 8` — max categories for categorical color grouping
- `DISTRIBUTION_GROUP_COLORS: string[]` — fallback palette for distribution groups

## Variables
- `fmt: Intl.NumberFormat` — number formatter for scatter UI

## Interfaces
```typescript
interface CategoricalColorGroups {
    categories: string[];
    colorByLabel: Map<string, string>;
}
interface Histogram { min: number; max: number; counts: number[]; edges: number[]; }
interface DistributionSeries { label: string; color: string; values: number[]; }
interface CanvasFrame { ctx: CanvasRenderingContext2D; width: number; height: number; }
```

## Functions
- `showError(message: string | null): void`
  - Displays or clears error message in the scatter error element.
- `setPanelStatus(id: string, message: string): void`
  - Sets the text content of a status panel element.
- `normalizeScatterSuggestionThreshold(value: unknown): number`
  - Normalizes suggestion threshold to a value between 0.3 and 0.95.
- `paletteForScale(scale: string): string[]`
  - Returns viridis/plasma/inferno gradient stops for a color scale name.
- `sampleGradient(stops: string[], t: number): string`
  - Samples a gradient at normalized position t and returns an interpolated hex color.
- `computeColorExtent(values: number[] | null): { min: number; max: number } | null`
  - Computes min/max of finite values in an array.
- `quantileSorted(sortedValues: number[], ratio: number): number | null`
  - Computes the quantile of a sorted array at a given ratio.
- `lowerBoundByX(points: [number, number][], x: number): number`
  - Binary search lower bound of x in sorted points array.
- `upperBoundByX(points: [number, number][], x: number): number`
  - Binary search upper bound of x in sorted points array.
- `normalizeCategoryLabel(label: unknown): string`
  - Normalizes a category label to string, 'Missing' for null/undefined.
- `normalizeColorValues(values: number[] | null): number[] | null`
  - Filters out non-finite (NaN, Infinity) values from a color array.
- `getCategoryColor(index: number): string`
  - Returns the palette color for a category index.
- `buildCategoricalColorGroups(labels?: unknown[] | null): CategoricalColorGroups | null`
  - Groups labels into categories with colors; returns null if too many unique labels.
- `getEl(id: string): HTMLElement | null` — DOM query helper
- `escapeHtml(str: string): string` — HTML entity escaper
- `downloadUrl(url: string, filename: string): void` — triggers file download
- `downloadBlob(blob: Blob, filename: string): void` — triggers blob download
- `createMiniCanvas(container: HTMLElement, width: number, height: number): HTMLCanvasElement`
  - Creates a mini canvas element in a container.
- `drawMiniScatterCanvas(canvas: HTMLCanvasElement, points: [number, number][], view: ScatterView, colorFn?: Function): void`
  - Draws mini scatter plot onto a mini canvas.
- `drawMiniDensityCanvas(canvas: HTMLCanvasElement, points: [number, number][], view: ScatterView, colormap: string): void`
  - Draws mini density plot onto a mini canvas.
- `drawDistributionCanvas(canvas: HTMLCanvasElement, values: number[], mode: string, color: string): void`
  - Draws histogram/kde/box distribution onto a mini canvas.
- `buildGroupedDistributionSeries(labels: unknown[], values: number[], colorColumn: string): DistributionSeries[]`
  - Builds grouped distribution series for matrix diagonal.

---
[1]: ./colorPalettes.md#DISTRIBUTION_GROUP_COLORS
function paletteForScale(scale: string): string[]
function normalizeHexColor(hex: string): string
function clampColorChannel(value: number): number
function toFiniteNumbers(values: unknown[]): number[]
function hexToRgb(hex: string): { r: number; g: number; b: number }
function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string
function sampleGradient(stops: string[], t: number): string
function computeColorExtent(values: number[] | null): { min: number; max: number } | null
function quantileSorted(sortedValues: number[], ratio: number): number | null
function lowerBoundByX(points: [number, number][], x: number): number
function upperBoundByX(points: [number, number][], x: number): number
function normalizeCategoryLabel(label: unknown): string
function normalizeColorValues(values: number[] | null): number[] | null
function getCategoryColor(index: number): string
function buildCategoricalColorGroups(labels?: unknown[] | null): CategoricalColorGroups | null
function getDevicePixelRatio(): number
function createMiniCanvas(className: string, heightPx: number): HTMLCanvasElement
function getCanvasFrame(canvas: HTMLCanvasElement, fallbackWidth?: number, fallbackHeight?: number): CanvasFrame | null
function isTemporalColumn(name: string, columnTypes: Map<string, string>): boolean
function formatValueForColumn(columnName: string, value: number, spanMs: number, columnTypes: Map<string, string>): string
function isDistributionCompatibleColumn(column: string, columnTypes: Map<string, string>): boolean
function buildHistogramFromValues(values: unknown[], binCount?: number): Histogram | null
function buildHistogramForDomain(values: number[], min: number, max: number, binCount?: number): Histogram | null
function estimateBandwidth(values: number[]): number
function buildKdeCurve(values: number[], min: number, max: number, sampleCount?: number): { x: number; y: number }[]
function computeBoxStats(values: number[]): { min: number; q1: number | null; median: number | null; q3: number | null; max: number } | null
function expandHistogramValues(histogram: { counts?: number[]; edges?: number[] }, maxSamples?: number): number[]
function computeDistributionStats(values: unknown[]): Record<string, number | null> | null
function paddedBounds(minV: number, maxV: number): { min: number; max: number }
function computeDomains(points: [number, number][]): { xMin: number; xMax: number; yMin: number; yMax: number }
function computeValueBounds(seriesList: DistributionSeries[]): { min: number; max: number } | null
function drawDistributionCanvas(canvas: HTMLCanvasElement, mode: string, seriesList: DistributionSeries[]): void
function drawMiniScatterCanvas(canvas: HTMLCanvasElement, points: [number, number][], options?: any): void
function drawMiniDensityCanvas(canvas: HTMLCanvasElement, points: [number, number][], options?: { colorScale?: string }): void
function buildGroupedDistributionSeries(values: number[], labels?: unknown[] | null): DistributionSeries[] | null
```
