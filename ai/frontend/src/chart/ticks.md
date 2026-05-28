# ticks.ts

Axis-tick generation and time formatting helpers shared across the main chart and export routines.

## Re-exports

```typescript
export { formatTwoDecimalsLocal, formatTimeTick, formatTimeTooltip };
```

## Functions

```typescript
export function niceLinearTicks(min: number, max: number, count?: number): number[];
export function niceTimeTicks(minMs: number, maxMs: number, count?: number): number[];
```
