# ai/frontend/src/utils/format.md

> Formatting utilities for analysis values: timestamps, numbers, datetime inputs, and dtype labels.

## Functions
- `formatAnalysisTime(tsMs: number): string`
  - Formats a Unix millisecond timestamp as a locale datetime string.
- `formatAnalysisNumber(value: unknown): string`
  - Formats a number to two decimal places (alias of `formatTwoDecimals`).
- `formatCount(value: unknown): string`
  - Formats a non-negative finite number as a locale-formatted integer.
- `isTemporalDtype(dtype: string): boolean`
  - Returns true if dtype indicates a datetime-like column.
- `normalizeDtypeLabel(dtype: string): string`
  - Normalizes a dtype string to `'datetime[ns]'` for temporal types.
- `formatProfileValue(value: unknown, dtype: string): string`
  - Formats a profile statistic value, using locale datetime for temporal dtypes.
- `formatToDatetimeLocal(ms: number): string`
  - Formats a Unix ms timestamp as an HTML `<input type="datetime-local">` string.
- `toFiniteNumberOrNull(value: unknown): number | null`
  - Returns the finite numeric value or null if not a finite number.