# analyticsPageUtils.ts

Shared utilities for analytics pages.

## Constants

```typescript
ANALYTICS_CHIP_COLORS: string[]
```

## Functions

```typescript
function getNumericColumns(metadata: DatasetMetadata | null): string[]
```

```typescript
function getDefaultTimeseriesColumns(metadata: DatasetMetadata | null): string[]
```

```typescript
function getAnalyticsChipColor(column: string, fallbackIndex: number, overrides?: Record<string, string>): string
```
