# ai/frontend/src/pages/heatmapPage.md
> Correlation heatmap page displaying Pearson/Spearman matrices with click-to-scatter navigation.

## Interface
- `HeatmapPageDeps { showPage: (pageName: string) => void }`

## State
- `heatmapCellSize: number` — pixel size of each matrix cell (default 36)
- `matrixData: { columns: string[]; pearson: (number | null)[][]; spearman: (number | null)[][] } | null`
- `metric: string` — current metric ('pearson' | 'spearman')
- `matrixLoadInFlight: Promise<void> | null`
- `heatmapRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`

## Functions
- `syncHeatmapEmptyState(message: string, visible: boolean, reason?: string): void` [deps: [createAnalysisPageRuntime][1]]
  - Updates empty state via heatmapRuntime.
- `correlationColor(value: number): string`
  - Maps correlation value [-1, 1] to diverging blue-red RGB string.
- `renderHeatmap(): void`
  - Renders the heatmap grid HTML with vertical color legend; cell clicks navigate to scatter.
- `initHeatmapPage(deps: HeatmapPageDeps): Promise<void>` [deps: [createAnalysisPageRuntime][1], [fetchCorrelationMatrix][2], [exportElementPNG][3], [exportElementSVG][4], [exportElementHTML][5], [exportMatrixCSV][6]]
  - Initializes heatmap page, metric/size controls, and export bindings.

---
[1]: ./shared/analysisPageRuntime.md#createAnalysisPageRuntime
[2]: ../../services/api/index.md#fetchCorrelationMatrix
[3]: ../../utils/chartExport.md#exportElementPNG
[4]: ../../utils/chartExport.md#exportElementSVG
[5]: ../../utils/chartExport.md#exportElementHTML
[6]: ../../utils/chartExport.md#exportMatrixCSV
