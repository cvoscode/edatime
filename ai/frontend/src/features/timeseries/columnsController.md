# ai/frontend/src/features/timeseries/columnsController.ts
> Column toggle chip UI and column range filter controls for the timeseries page.

## Functions

```typescript
export function initSeriesCollapse(): void
export function buildColumnToggles(
    fetchAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn?: (() => void) | null,
): void
export function buildRangeControls(): void
export function initColumnFilterModal(
    renderCurrentData: () => void,
    updateAnalysisYRange: (min: number, max: number, source: string) => void,
): void
```