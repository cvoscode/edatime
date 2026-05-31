# ai/frontend/src/scatter/matrix.md
> Scatter matrix view: pairwise grid with mini scatter canvases, diagonal distribution plots, and column reordering via drag-and-drop.

## Constants
- `MATRIX_FETCH_CONCURRENCY = 4` — max concurrent matrix cell fetches
- `MATRIX_POINT_LIMIT = 8000` — max points per matrix cell
- `MATRIX_MAX_COLUMNS = 4` — max columns in matrix

## State
- `draggingMatrixColumn: string | null` — currently dragged column for reordering

## Interfaces
- `MatrixCellData = { totalPoints: number; points: [number, number][]; colorValues: number[] | null; colorLabels: string[] | null }`

## Functions
- `collectOverviewColumns(): string[]` [deps: [currentControls][1]]
  - Collects columns for matrix overview from controls and suggestions.
- `buildOverviewColumns(): string[]`
  - Builds and caches the ordered column list for the matrix grid.
- `moveColumn(columns: string[], source: string, target: string): string[]`
  - Moves a column from source index to target index; returns new array.
- `bindReorderHandle(handle: HTMLElement, column: string, columns: string[], onColumnReorder: ((nextColumns: string[]) => void) | null): void`
  - Binds drag-and-drop handlers for column reordering in the matrix header.
- `fetchMatrixCellData(x: string, y: string, context: ReturnType<typeof buildScatterQueryContext>, colorColumn: string): Promise<MatrixCellData>` [deps: [fetchScatterPoints][2]]
  - Fetches and caches scatter points for a single matrix cell; evict old entries when cache exceeds 256.
- `selectMatrixPair(x: string, y: string, refreshCorrelations: () => Promise<void>, renderScatter: () => Promise<void>, setScatterView: (view: string, opts?: { render?: boolean }) => Promise<void>): Promise<void>` [deps: [getEl][3]]
  - Selects an X/Y pair in main scatter controls from a matrix cell click.
- `describeDistributionMode(mode: string): string`
  - Returns 'KDE', 'Box Plot', or 'Histogram' for a distribution mode string.
- `matrixPairPriority(pair: [string, string], controls: Pick<ScatterControls, 'x' | 'y'>, suggestionRank: Map<string, number>): number`
  - Computes sort priority for a matrix cell (current axes rank lower than suggestions).
- `buildMatrixFetchPairs(columns: string[], controls: Pick<ScatterControls, 'x' | 'y'>, suggestions?: Array<{ column?: string | null }>): [string, string][]`
  - Builds the list of X/Y pairs to fetch for the matrix grid.
- `renderMatrixGrid(columns: string[], opts?: object): Promise<void>` [deps: [fetchMatrixCellData][4], [createMiniCanvas][5], [drawMiniScatterCanvas][6], [drawMiniDensityCanvas][7], [drawDistributionCanvas][8]]
  - Renders the full scatter matrix grid with mini canvases and diagonal distributions.
- `renderScatterMatrixView(matrixColumns: string[], opts?: object): Promise<void>` [deps: [renderMatrixGrid][9]]
  - Entry point for the scatter matrix view; called from scatter page.

---
[1]: ./state.md#currentControls
[2]: ../../services/api/index.md#fetchScatterPoints
[3]: ./helpers.md#getEl
[4]: ./matrix.md#fetchMatrixCellData
[5]: ./helpers.md#createMiniCanvas
[6]: ./helpers.md#drawMiniScatterCanvas
[7]: ./helpers.md#drawMiniDensityCanvas
[8]: ./helpers.md#drawDistributionCanvas
[9]: ./matrix.md#renderMatrixGrid
    datasets: Map<string, MatrixCellData>,
    onCellClick: (x: string, y: string) => void,
    onColumnReorder?: ((nextColumns: string[]) => void) | null,
): void
function renderScatterOverview(onCellClick: (x: string, y: string) => void): Promise<void>
function renderScatterMatrixView(onCellClick: (x: string, y: string) => void): Promise<void>
function drawMiniFftCanvas(canvas: HTMLCanvasElement, frequencies: number[], values: number[], label: string): void
function renderMatrixFftPanel(): Promise<void>
```
