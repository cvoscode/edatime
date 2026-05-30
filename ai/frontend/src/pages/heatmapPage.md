# frontend/src/pages/heatmapPage.md

> Renders a correlation matrix heatmap with vertical color legend.

## Interface: HeatmapPageDeps

- `showPage(pageName: string): void`
  - Navigates to a page (used for scatter plot drill-down).

## State

- `loaded: boolean` — prevents double initialization.
- `heatmapCellSize: number` — cell dimensions in pixels (default 36).
- `matrixData: { columns: string[]; pearson: (number | null)[][]; spearman: (number | null)[][] } | null`
- `metric: 'pearson' | 'spearman'`
- `matrixLoadInFlight: Promise<void> | null`
- `heatmapEmptyStateController: ReturnType<typeof createEmptyStateController>` — empty state management.

## Functions

- `getHeatmapEmptyStateController(): ReturnType<typeof createEmptyStateController>`
  - Lazy-initializes the empty state controller.

- `syncHeatmapEmptyState(message: string, visible: boolean, reason?: string): void`
  - Updates empty state visibility and message.

- `correlationColor(value: number): string`
  - Maps correlation coefficient [-1, 1] to RGB color string using diverging blue-red palette.

- `renderHeatmap(): void`
  - Renders the correlation matrix grid with vertical color legend in a flex layout.
  - Cell click navigates to scatter page for off-diagonal cells.

- `export async initHeatmapPage(deps: HeatmapPageDeps): Promise<void>`
  - Initializes heatmap page with pageLifecycle wiring, bindExportButtons, loads matrix data, renders heatmap, and registers export handlers.

## Exported
- `initHeatmapPage`
- `matrixData` (let)
- `metric` (let)
- `heatmapCellSize` (let)
- `heatmapEmptyStateController` (let)