# ai/frontend/src/scatter/matrix.md
> Scatter-matrix view orchestration: batched matrix fetches, per-render abort control, reordered grids, and linked FFT mini-panels.

## Functions
- `getMatrixRenderSignal(): AbortSignal`
  - Returns the live matrix-render abort signal, or a stable idle signal when no render is active.
- `__resetMatrixRenderControllerForTests(): void`
  - Aborts and clears the module-scoped matrix render controller.
- `buildMatrixFetchPairs(columns: string[], controls: Pick<ScatterControls, 'x' | 'y'>, suggestions: Array<{ x?: string | null; y?: string | null }> = []): [string, string][]`
  - Builds the full pair list in priority order so the active pair and suggested columns render first.
- `selectMatrixPair(x: string, y: string, refreshCorrelations: () => Promise<void>, renderScatter: () => Promise<void>, setScatterView: (view: string, opts?: { render?: boolean }) => Promise<void>): Promise<void>`
  - Pushes the clicked pair into the plot controls, switches back to plot view, and rerenders.
- `renderScatterOverview(onCellClick: (x: string, y: string) => void): Promise<void>` [deps: [fetchScatterMatrix][1]]
  - Starts a new matrix render, reuses `matrixBatchCache` when possible, fetches `/api/scatter/matrix` once for the active pair set, and rerenders the grid from the returned per-cell datasets.
- `renderScatterMatrixView(onCellClick: (x: string, y: string) => void): Promise<void>`
  - Renders the scatter overview and then schedules the matrix FFT panel.
- `renderMatrixFftPanel(): Promise<void>` [deps: [fetchFft][1]]
  - Fetches FFT data for the current matrix overview columns over the linked time range and renders one mini FFT card per column.
- `renderMatrixGrid(columns: string[], datasets: Map<string, MatrixCellData>, onCellClick: (x: string, y: string) => void, onColumnReorder?: ((nextColumns: string[]) => void) | null): void` [deps: [matrixGrid][2]]
  - Re-export of the grid renderer used by the matrix page.

---
[1]: ../services/api/index.md
[2]: ./matrixGrid.md
