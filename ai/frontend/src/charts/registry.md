# ai/frontend/src/charts/registry.md
> Chart type registry enabling plug-in of new chart types without modifying core app logic.

## Functions
- `registerChartType(name: string, adapter: ChartAdapter): void` — Registers a chart adapter by name; throws if the adapter is invalid.
- `getChartType(name: string): ChartAdapter | undefined` — Returns the registered adapter for a given name.

---
[1]: ../types.md#ChartAdapter
[2]: ../types.md#ChartInstance
