# registry.ts

Chart type registry — enables plugging in new chart types without modifying the core app logic.

## Functions

```typescript
function registerChartType(name: string, adapter: ChartAdapter): void
function getChartType(name: string): ChartAdapter | undefined
```
