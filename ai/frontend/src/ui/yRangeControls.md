# ai/frontend/src/ui/yRangeControls.md
> Wires the timeseries-toolbar Y-range toggle to persisted chart-state and the live chart instance.

## Functions
- `initYRangeControls(): void`
  - Binds `#y-stack-from-zero`, mirrors `chartState.stackFromZero` into the checkbox, forwards the toggle to `chart.setStackFromZero`, and triggers a chart rerender via `resize()`.
