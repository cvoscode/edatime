# frontend/src/utils/datetimeInput.ts
> Shared formatter for `datetime-local` inputs that need stable UTC string rendering.

## Functions
- `formatUtcDatetimeInputValue(ms: number): string`
  - Formats epoch milliseconds as `YYYY-MM-DDTHH:MM` in UTC.
