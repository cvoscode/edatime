# frontend/src/platform/analyticsColumns.ts
> Column-set helpers shared by the analytics surface. Eliminates the legacy `ANALYTICS_CHIP_COLORS` palette in favour of `getActiveSeriesPalette` from `utils/seriesColors.js`.

## Functions
- `getAnalyticsChipColor(column: string, fallbackIndex: number, overrides?: Record<string, string>): string`
  - Returns the per-column override, or the palette color at `fallbackIndex % palette.length`.
- `getNumericColumns(metadata: DatasetMetadata | null): string[]`
  - Returns `metadata.numeric_columns` excluding `ts` and the dataset's time column.
- `getDefaultTimeseriesColumns(metadata: DatasetMetadata | null): string[]`
  - Target-aware default selection: if a "likely target" column (e.g. `OT`, `target`, `y`) is present, returns up to two non-target numerics + the target (target last). Falls back to the first three numeric columns when no target is detected. [deps: [utils/seriesColors][1]]

---
[1]: ../utils/seriesColors.md