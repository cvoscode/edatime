# matrix.ts

Scatter matrix implementation: pairwise grid with mini scatter canvases and diagonal distributions.

## Constants

```typescript
MATRIX_FETCH_CONCURRENCY: 4
MATRIX_POINT_LIMIT: 8_000
MATRIX_MAX_COLUMNS: 4
```

## Functions

```typescript
function collectOverviewColumns(): string[]
function buildOverviewColumns(): string[]
function moveColumn(columns: string[], source: string, target: string): string[]
function bindReorderHandle(
    handle: HTMLElement,
    column: string,
    columns: string[],
    onColumnReorder: ((nextColumns: string[]) => void) | null,
): void
function fetchMatrixCellData(
    x: string,
    y: string,
    context: ReturnType<typeof buildScatterQueryContext>,
    colorColumn: string,
): Promise<MatrixCellData>
function selectMatrixPair(
    x: string,
    y: string,
    refreshCorrelations: () => Promise<void>,
    renderScatter: () => Promise<void>,
    setScatterView: (view: string, opts?: { render?: boolean }) => Promise<void>,
): Promise<void>
function describeDistributionMode(mode: string): string
function matrixPairPriority(
    pair: [string, string],
    controls: Pick<ScatterControls, 'x' | 'y'>,
    suggestionRank: Map<string, number>,
): number
function buildMatrixFetchPairs(
    columns: string[],
    controls: Pick<ScatterControls, 'x' | 'y'>,
    suggestions?: Array<{ column?: string | null }>,
): [string, string][]
function renderMatrixGrid(
    columns: string[],
    datasets: Map<string, MatrixCellData>,
    onCellClick: (x: string, y: string) => void,
    onColumnReorder?: ((nextColumns: string[]) => void) | null,
): void
function renderScatterOverview(onCellClick: (x: string, y: string) => void): Promise<void>
function renderScatterMatrixView(onCellClick: (x: string, y: string) => void): Promise<void>
function drawMiniFftCanvas(canvas: HTMLCanvasElement, frequencies: number[], values: number[], label: string): void
function renderMatrixFftPanel(): Promise<void>
```
