# ai/frontend/src/formatUtils.md
> Shared date/number formatting utilities for the frontend.

## Constants
```typescript
export const EURO_DATE_ONLY: Intl.DateTimeFormat
export const EURO_DATE_TIME: Intl.DateTimeFormat
export const EURO_DATE_TIME_SECONDS: Intl.DateTimeFormat
```

## Functions
```typescript
export function formatTwoDecimals(value: unknown): string
export function formatTimestamp(ms: number, spanMs: number): string
export function formatTimeTooltip(ms: number, spanMs: number): string
```
  - `formatTwoDecimals` formats a number to 2 decimal places, returns '—' for non-finite.
  - `formatTimestamp` formats a timestamp picking resolution based on visible span.
  - `formatTimeTooltip` always shows date+time for wide spans (tooltip use).

## Functions

```typescript
export function formatTwoDecimals(value: unknown): string
export function formatTimestamp(ms: number, spanMs: number): string
export function formatTimeTooltip(ms: number, spanMs: number): string
```