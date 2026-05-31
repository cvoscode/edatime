# ai/frontend/src/chart/colorScale.md
> Per-segment colorized series using user-selected colormap with interpolation and batching helpers.

## Functions
- `getInterpolatedColor(t: number, scaleName?: ColorScaleName): string` — Returns an interpolated RGB string for t in [0, 1] from the active colormap.
- `analyzeColorValues(values: unknown[]): ColorScaleInfo | null` — Determines whether values are numeric or categorical and computes min/max or category list.
- `colorForScaleValue(rawValue: unknown, scaleInfo: ColorScaleInfo, scaleName?: ColorScaleName): string | null` — Maps a raw value to a color using the scale info and active colormap.
- `categoryColorFor(label: string, categories: string[]): string` — Returns a deterministic series color for a categorical label.
- `buildColorizedSeries(colName: string, points: [number, number][], colorValues: unknown[], scaleInfo: ColorScaleInfo, visible: boolean, showMarkers: boolean): ColorizedResult` — Batches adjacent points with similar colors into longer segments.

## Interface: ColorScaleInfo
- `isNumeric: boolean`
- `min: number | null`
- `max: number | null`
- `categories: string[]`

## Interface: ColorizedResult
- `series: any[]`
- `annotations: any[]`

## Exported Constants
- `COLOR_SCALES` (aliased as `VIRIDIS`) — named colormap arrays

---
[1]: ../utils/settings.md#getSetting
[2]: ../utils/seriesColors.md#getSeriesColor
