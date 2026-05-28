# ai/frontend/src/formatUtils.ts
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