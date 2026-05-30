# frontend/src/pages/heatmapPage.ts
> Correlation matrix heatmap — refactored to use `createAnalysisPageRuntime`.

## Interface: HeatmapPageDeps
- `showPage(pageName: string): void`

## State
- `heatmapCellSize: number` (default: `36`)
- `matrixData: { columns: string[]; pearson: (number | null)[][]; spearman: (number | null)[][] } | null`
- `metric: 'pearson' | 'spearman' `
- `matrixLoadInFlight: Promise<void> | null`
- `heatmapRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`

## Functions
- `syncHeatmapEmptyState(message: string, visible: boolean, reason?: string): void`
  - Updates empty state via `heatmapRuntime?.updateEmptyState`.
- `correlationColor(value: number): string`
  - Maps correlation [-1, 1] to diverging blue-red RGB.
- `renderHeatmap(): void`
  - Renders correlation matrix grid with vertical color legend; cell clicks navigate to scatter.
- `export async initHeatmapPage(deps: HeatmapPageDeps): Promise<void>`
  - Uses `createAnalysisPageRuntime`; wires metric select, cell size input, and export buttons.

---
[1]: ./shared/analysisPageRuntime.md
[2]: ../utils/bindExportButtons.md
