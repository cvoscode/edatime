# frontend/src/app/adaptiveGesture.ts
> Ctrl+click line drawing on the main chart to create adaptive line filters.

## Functions

### buildAdaptiveFilterFromPoints
- `buildAdaptiveFilterFromPoints(column: string, firstPoint: { x: number; y: number }, secondPoint: { x: number; y: number }): AdaptiveLineFilter | null`
  - Builds an adaptive line filter from two chart points; determines `keepAbove` by majority vote of points above/below the line.

### applyAdaptiveFiltersLocally
- `applyAdaptiveFiltersLocally(sourceKind?: string): void`
  - Triggers Y-range recalculation and re-renders chart after adaptive filter changes.

### initAdaptiveFilterGesture
- `initAdaptiveFilterGesture(deps: { buildColumnToggles: () => void; buildRangeControls: () => void; renderCurrentData: () => void; updateAnalysisYRange: (min: number, max: number, sourceKind: string) => void }): () => void`
  - Attaches Ctrl+click handler to main chart for two-point adaptive line filter creation; shows column picker when multiple series are selected. Returns cleanup unlistener.

---
[1]: ../store/index.md
[2]: ../services/timeseries/filtering.md
[3]: ../types.md
