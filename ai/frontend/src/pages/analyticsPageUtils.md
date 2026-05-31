# ai/frontend/src/pages/analyticsPageUtils.md
> Shared analytics utilities: column selection, chip color assignment, and default series logic.

## Constants
- `ANALYTICS_CHIP_COLORS: string[]` — fallback 7-color palette for series chips

## Functions
- `getNumericColumns(metadata: DatasetMetadata | null): string[]`
  - Returns all numeric columns except the time column.
- `getDefaultTimeseriesColumns(metadata: DatasetMetadata | null): string[]`
  - Returns the first three numeric columns as defaults.
- `getAnalyticsChipColor(column: string, fallbackIndex: number, overrides?: Record<string, string>): string`
  - Resolves chip color from overrides or ANALYTICS_CHIP_COLORS palette by index.

---
[1]: ../../types.md#DatasetMetadata
