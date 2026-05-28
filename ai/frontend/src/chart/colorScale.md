# colorScale.ts

Color-scale helpers for per-segment colorized series using user-selected colormap. Batches adjacent points with similar colors into longer segments to avoid creating thousands of individual ChartGPU series.

## Re-exports

```typescript
export { COLOR_SCALES as VIRIDIS } from '../utils/settings.js';
```

## Interface: ColorScaleInfo

```typescript
export interface ColorScaleInfo {
  isNumeric: boolean;
  min: number | null;
  max: number | null;
  categories: string[];
}
```

## Interface: ColorizedResult

```typescript
export interface ColorizedResult {
  series: any[];
  annotations: any[];
}
```

## Functions

```typescript
export function getInterpolatedColor(t: number, scaleName?: ColorScaleName): string;
export function analyzeColorValues(values: unknown[]): ColorScaleInfo | null;
export function colorForScaleValue(
  rawValue: unknown,
  scaleInfo: ColorScaleInfo,
  scaleName?: ColorScaleName,
): string | null;
export function categoryColorFor(label: string, categories: string[]): string;
export function buildColorizedSeries(
  colName: string,
  points: [number, number][],
  colorValues: unknown[],
  scaleInfo: ColorScaleInfo,
  visible: boolean,
  showMarkers: boolean,
): ColorizedResult;
export function baseSeriesName(name: string): string;
```
