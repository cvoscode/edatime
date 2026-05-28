# format.ts

Analysis formatting utilities for timestamps, numbers, and data type labels.

## Functions

```typescript
function formatAnalysisTime(tsMs: number): string
```

Format timestamp for analysis display.

```typescript
function formatAnalysisNumber(value: unknown): string
```

Format number to 2 decimal places (alias for formatTwoDecimals).

```typescript
function formatCount(value: unknown): string
```

Format count with locale-aware thousand separators.

```typescript
function isTemporalDtype(dtype: string): boolean
```

Check if dtype is temporal (datetime, date).

```typescript
function normalizeDtypeLabel(dtype: string): string
```

Normalize dtype label (datetime[ns] for temporal types).

```typescript
function formatProfileValue(value: unknown, dtype: string): string
```

Format a profile value based on its dtype.

```typescript
function formatToDatetimeLocal(ms: number): string
```

Format ms timestamp to datetime-local input value.

```typescript
function toFiniteNumberOrNull(value: unknown): number | null
```

Convert value to finite number or null.