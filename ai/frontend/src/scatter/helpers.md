# helpers.ts

Scatter plot helper functions: formatting, color math, canvas utilities, and histogram/KDE primitives.

## Constants

```typescript
MATRIX_POINT_LIMIT: 8_000
MATRIX_MAX_COLUMNS: 4
HISTOGRAM_BINS: 24
DEFAULT_SCATTER_SUGGESTION_THRESHOLD: 0.7
KDE_SAMPLES: 64
LOW_CARDINALITY_LIMIT: 8
DISTRIBUTION_GROUP_COLORS: string[]
```

## Interfaces

```typescript
interface CategoricalColorGroups {
    categories: string[];
    colorByLabel: Map<string, string>;
}

interface Histogram {
    min: number;
    max: number;
    counts: number[];
    edges: number[];
}

interface DistributionSeries {
    label: string;
    color: string;
    values: number[];
}

interface CanvasFrame {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
}
```

## Functions

```typescript
function showError(message: string | null): void
function setPanelStatus(id: string, message: string): void
function normalizeScatterSuggestionThreshold(value: unknown): number
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
