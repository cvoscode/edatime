# ai/frontend/src/scatter/matrix.md
> Scatter matrix view: pairwise grid with mini scatter / density canvases and diagonal distributions.

## Imports
- `fetchScatterPoints`, `fetchFft` from [../services/api/index.js](../services/api/index.md)
- `appState`, `currentControls`, `buildScatterQueryContext`, `buildOverviewContextKey`, `ensureOptions` from [./state.js](./state.md)
- `setDropdownValue` from [../ui/primitives/Dropdown.js](../ui/primitives/Dropdown.md)
- `drawDistributionCanvas`, `drawMiniDensityCanvas`, `drawMiniScatterCanvas`, `createMiniCanvas` from [./helpers.js](./helpers.md)
- `MATRIX_POINT_LIMIT`, `MATRIX_MAX_COLUMNS` from [./helpers.js](./helpers.md)

## Module-Scoped State
- `draggingMatrixColumn: string | null` — column currently being dragged for reorder.
- `matrixRenderController: AbortController | null` — abort controller for the latest matrix render; a newer render aborts in-flight cell fetches from a superseded one.

## Constants
- `MATRIX_FETCH_CONCURRENCY = 4`

## Functions
- `selectMatrixPair(x: string, y: string, refreshCorrelations: () => Promise<void>, renderScatter: () => Promise<void>, setScatterView: (view: string, opts?: { render?: boolean }) => Promise<void>): Promise<void>`
  - Applies the clicked matrix pair to the X/Y dropdowns, refreshes correlations, then switches to plot view and renders.
- `buildMatrixFetchPairs(columns: string[], controls: Pick<ScatterControls, 'x' | 'y'>, suggestions?: Array<{ x?: string | null; y?: string | null }>): [string, string][]`
  - Returns the full cartesian product of columns sorted by `matrixPairPriority` — current axis first, then diagonals, then off-axis pairs in suggestion order.
- `getMatrixRenderSignal(): AbortSignal` — returns the AbortSignal for the current matrix render, or a never-aborted signal if no render is in progress.
- `__resetMatrixRenderControllerForTests(): void` — test-only: aborts and clears the matrix render controller between test runs.
- `renderMatrixGrid(columns: string[], datasets: Map<string, MatrixCellData>, onCellClick: (x: string, y: string) => void, onColumnReorder?: ((nextColumns: string[]) => void) | null): void`
  - Renders the matrix grid using stable DOM node tracking by `dataset.key`. Reuses existing cell/header nodes and only mutates canvas/text content. Schedules canvas draws at the end of DOM construction.
- `buildOverviewColumns(): string[]`
  - Derives overview columns from current controls + suggestions + metadata, preserving `matrixColumnOrder` from appState.
- `bindReorderHandle(handle: HTMLElement, column: string, columns: string[], onColumnReorder?: ((nextColumns: string[]) => void) | null): void`
  - Binds drag handles for column reordering; uses `__reorderBound` flag for idempotency.
- `renderScatterOverview(onCellClick: (x: string, y: string) => void): Promise<void>`
  - Calls `beginMatrixRender()` to abort any in-flight cell fetches from a superseded render, then fetches up to `MATRIX_FETCH_CONCURRENCY` matrix cells in parallel with revision-aware abort semantics and incrementally re-renders the grid. Silences `AbortError` in cell fetch catch blocks so aborted renders don't log errors.
- `renderScatterMatrixView(onCellClick: (x: string, y: string) => void): Promise<void>`
  - Calls `renderScatterOverview` and then triggers the matrix FFT panel render in the next frame.
- `renderMatrixFftPanel(): Promise<void>`
  - Fetches FFT data for the current overview columns over the active linked time window and renders a mini FFT canvas per column. Each card is clickable and navigates to the FFT page while activating the matching trace chip.
