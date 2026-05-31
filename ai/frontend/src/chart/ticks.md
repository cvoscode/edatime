# ai/frontend/src/chart/ticks.md
> Axis tick generation and time formatting helpers shared across the main chart and export routines.

## Functions
- `niceLinearTicks(min: number, max: number, count?: number): number[]` — Generates nicely spaced linear ticks between min and max.
- `niceTimeTicks(minMs: number, maxMs: number, count?: number): number[]` — Generates nicely spaced time ticks from a set of predefined durations (ms).

## Re-exports
- `formatTwoDecimals` from `../formatUtils.md#formatTwoDecimals`
- `formatTimestamp` (as `formatTimeTick`) from `../formatUtils.md#formatTimestamp`
- `formatTimeTooltip` from `../formatUtils.md#formatTimeTooltip`

---
[1]: ../formatUtils.md
