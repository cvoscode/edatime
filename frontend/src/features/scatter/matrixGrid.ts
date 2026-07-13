import {
    buildCategoricalColorGroups,
    buildGroupedDistributionSeries,
    createMiniCanvas,
    drawDistributionCanvas,
    drawMiniDensityCanvas,
    drawMiniScatterCanvas,
    escapeHtml,
    fmt,
    getEl,
} from './helpers.js';
import {
    currentControls,
    type MatrixCellData,
    type ScatterControls,
} from './state.js';

interface MatrixGridInteractionState {
    draggingColumn: string | null;
    columns: string[];
    onColumnReorder: ((nextColumns: string[]) => void) | null;
}

const interactionStateByGrid = new WeakMap<HTMLElement, MatrixGridInteractionState>();

function getInteractionState(grid: HTMLElement): MatrixGridInteractionState {
    let state = interactionStateByGrid.get(grid);
    if (!state) {
        state = { draggingColumn: null, columns: [], onColumnReorder: null };
        interactionStateByGrid.set(grid, state);
    }
    return state;
}

function moveColumn(columns: string[], source: string, target: string): string[] {
    if (!source || !target || source === target) return columns.slice();
    const sourceIndex = columns.indexOf(source);
    const targetIndex = columns.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return columns.slice();
    const next = columns.slice();
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    return next;
}

function bindReorderHandle(
    handle: HTMLElement,
    state: MatrixGridInteractionState,
): void {
    handle.draggable = state.onColumnReorder !== null;

    const bound = (handle as unknown as { __reorderBound?: boolean }).__reorderBound;
    if (bound) return;
    (handle as unknown as { __reorderBound?: boolean }).__reorderBound = true;

    handle.addEventListener('dragstart', (event: DragEvent) => {
        const column = handle.dataset.column || '';
        state.draggingColumn = column;
        handle.classList.add('dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', column);
        }
    });

    handle.addEventListener('dragend', () => {
        state.draggingColumn = null;
        handle.classList.remove('dragging');
        document.querySelectorAll('.scatter-matrix-drop-target').forEach((element) => {
            element.classList.remove('scatter-matrix-drop-target');
        });
    });

    handle.addEventListener('dragover', (event: DragEvent) => {
        const column = handle.dataset.column || '';
        const source = state.draggingColumn || event.dataTransfer?.getData('text/plain') || '';
        if (!source || source === column) return;
        event.preventDefault();
        handle.classList.add('scatter-matrix-drop-target');
    });

    handle.addEventListener('dragleave', () => {
        handle.classList.remove('scatter-matrix-drop-target');
    });

    handle.addEventListener('drop', (event: DragEvent) => {
        const column = handle.dataset.column || '';
        const source = state.draggingColumn || event.dataTransfer?.getData('text/plain') || '';
        handle.classList.remove('scatter-matrix-drop-target');
        if (!source || source === column) return;
        event.preventDefault();
        state.onColumnReorder?.(moveColumn(state.columns, source, column));
    });
}

export function describeDistributionMode(mode: string): string {
    if (mode === 'kde') return 'KDE';
    if (mode === 'boxplot') return 'Box Plot';
    return 'Histogram';
}

export function renderMatrixGrid(
    columns: string[],
    datasets: Map<string, MatrixCellData>,
    onCellClick: (x: string, y: string) => void,
    onColumnReorder: ((nextColumns: string[]) => void) | null = null,
): void {
    const container = getEl('scatter-matrix');
    if (!container) return;

    if (!Array.isArray(columns) || columns.length < 2) {
        container.innerHTML = '<div class="scatter-placeholder">Choose scatter axes first. The matrix will then add related numeric columns, and you can drag the row or column headers to reorder the grid.</div>';
        return;
    }

    const controls = currentControls();
    const diagonalMode = controls.diagonalMode;
    const matrixMode = controls.matrixMode;
    const cellSize = controls.matrixCellSize;

    let grid = container.querySelector<HTMLElement>('.scatter-matrix-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'scatter-matrix-grid';
        container.appendChild(grid);
    }
    const interactionState = getInteractionState(grid);
    interactionState.columns = columns.slice();
    interactionState.onColumnReorder = onColumnReorder;
    grid.style.gridTemplateColumns = `60px repeat(${columns.length}, ${cellSize}px)`;

    let corner = grid.querySelector<HTMLElement>(':scope > .scatter-matrix-corner');
    if (!corner) {
        corner = document.createElement('div');
        corner.className = 'scatter-matrix-corner';
        corner.innerHTML = '<span class="scatter-matrix-corner-axis">Y</span><span class="scatter-matrix-corner-sep">/</span><span class="scatter-matrix-corner-axis">X</span>';
        grid.appendChild(corner);
    }

    const headerNodes = new Map<string, HTMLElement>();
    grid.querySelectorAll<HTMLElement>(':scope > .scatter-matrix-header').forEach((node) => {
        const column = node.dataset.column;
        if (column) headerNodes.set(column, node);
    });
    headerNodes.forEach((node, column) => {
        if (!columns.includes(column)) {
            node.remove();
            headerNodes.delete(column);
        }
    });

    let insertAfter: Node = corner;
    for (const column of columns) {
        let header = headerNodes.get(column);
        if (!header) {
            header = document.createElement('div');
            header.className = 'scatter-matrix-header';
            header.textContent = column;
            header.dataset.column = column;
            bindReorderHandle(header, interactionState);
            if (insertAfter.nextSibling) grid.insertBefore(header, insertAfter.nextSibling);
            else grid.appendChild(header);
            headerNodes.set(column, header);
        } else {
            header.textContent = column;
            header.dataset.column = column;
            bindReorderHandle(header, interactionState);
            const desired = insertAfter.nextSibling;
            if (desired !== header) {
                if (desired) grid.insertBefore(header, desired);
                else grid.appendChild(header);
            }
        }
        insertAfter = header;
    }

    const cellNodesByKey = new Map<string, HTMLElement>();
    grid.querySelectorAll<HTMLElement>(
        ':scope > .scatter-matrix-row-header, :scope > .scatter-matrix-cell, :scope > .scatter-matrix-diagonal',
    ).forEach((node) => {
        const key = node.dataset.key;
        if (key) cellNodesByKey.set(key, node);
    });
    cellNodesByKey.forEach((node, key) => {
        const parts = key.split('|');
        const rowKey = parts[1] ?? parts[0];
        const colKey = parts[0].startsWith('row|') ? parts[0].slice(4) : parts[0];
        if (!columns.includes(colKey) || !columns.includes(rowKey)) {
            node.remove();
            cellNodesByKey.delete(key);
        }
    });

    const drawJobs: (() => void)[] = [];
    for (const rowColumn of columns) {
        const rowKey = `row|${rowColumn}`;
        let rowHeader = cellNodesByKey.get(rowKey);
        if (!rowHeader) {
            rowHeader = document.createElement('div');
            rowHeader.className = 'scatter-matrix-row-header';
            rowHeader.dataset.key = rowKey;
            grid.appendChild(rowHeader);
            cellNodesByKey.set(rowKey, rowHeader);
        }
        rowHeader.textContent = rowColumn;
        rowHeader.dataset.column = rowColumn;
        bindReorderHandle(rowHeader, interactionState);
        if (insertAfter.nextSibling !== rowHeader) {
            if (insertAfter.nextSibling) grid.insertBefore(rowHeader, insertAfter.nextSibling);
            else grid.appendChild(rowHeader);
        }
        insertAfter = rowHeader;

        for (const column of columns) {
            const data = datasets.get(`${column}|${rowColumn}`) || { totalPoints: 0, points: [], colorValues: null, colorLabels: null };
            const key = rowColumn === column ? `diag|${column}` : `${column}|${rowColumn}`;
            let node = cellNodesByKey.get(key) as HTMLElement | undefined;

            if (rowColumn === column) {
                if (!node) {
                    node = document.createElement('div');
                    node.className = 'scatter-matrix-diagonal';
                    node.dataset.key = key;
                    grid.appendChild(node);
                    cellNodesByKey.set(key, node);
                }
                if (node.style.width !== `${cellSize}px`) node.style.width = `${cellSize}px`;
                if (node.style.height !== `${cellSize}px`) node.style.height = `${cellSize}px`;
                let canvas = node.querySelector<HTMLCanvasElement>('canvas');
                if (!canvas) {
                    canvas = createMiniCanvas('scatter-matrix-diagonal-canvas', cellSize - 32);
                    canvas.style.width = '100%';
                    node.appendChild(canvas);
                    const meta = document.createElement('div');
                    meta.className = 'scatter-diagonal-meta';
                    node.appendChild(meta);
                }
                const values = data.points.map((point: any) => Number(point?.[0])).filter((value: number) => Number.isFinite(value));
                const groupedSeries = controls.selectedColorColumn
                    ? buildGroupedDistributionSeries(values, data.colorLabels)
                    : null;
                const desiredMeta = groupedSeries
                    ? `${describeDistributionMode(diagonalMode)} grouped by ${controls.selectedColorColumn}`
                    : describeDistributionMode(diagonalMode);
                const meta = node.querySelector<HTMLElement>('.scatter-diagonal-meta');
                if (meta && meta.textContent !== desiredMeta) meta.textContent = desiredMeta;
                drawJobs.push(() => {
                    drawDistributionCanvas(
                        canvas as HTMLCanvasElement,
                        diagonalMode,
                        groupedSeries || [{ label: column, color: '#00c896', values }],
                    );
                });
            } else {
                if (!node) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'scatter-matrix-cell';
                    button.dataset.key = key;
                    grid.appendChild(button);
                    cellNodesByKey.set(key, button);
                    button.addEventListener('click', () => onCellClick(column, rowColumn));
                    node = button;
                }
                if (node.style.width !== `${cellSize}px`) node.style.width = `${cellSize}px`;
                if (node.style.height !== `${cellSize}px`) node.style.height = `${cellSize}px`;
                node.classList.toggle('active', controls.x === column && controls.y === rowColumn);
                let canvas = node.querySelector<HTMLCanvasElement>('canvas');
                if (!canvas) {
                    canvas = createMiniCanvas('scatter-matrix-cell-canvas', cellSize - 32);
                    canvas.style.width = '100%';
                    node.appendChild(canvas);
                    const meta = document.createElement('div');
                    meta.className = 'scatter-matrix-meta';
                    node.appendChild(meta);
                }
                const categoryGroups = buildCategoricalColorGroups(data.colorLabels);
                drawJobs.push(() => {
                    if (matrixMode === 'density') {
                        drawMiniDensityCanvas(canvas as HTMLCanvasElement, data.points, { colorScale: controls.colorScale });
                    } else {
                        drawMiniScatterCanvas(canvas as HTMLCanvasElement, data.points, {
                            color: '#4a9eff',
                            colorValues: data.colorValues,
                            colorLabels: categoryGroups ? data.colorLabels : null,
                            colorScale: controls.colorScale,
                            categoryColors: categoryGroups?.colorByLabel,
                        });
                    }
                });
                const meta = node.querySelector<HTMLElement>('.scatter-matrix-meta');
                const totalPoints = Number(data.totalPoints || data.points.length || 0);
                const metaText = `${escapeHtml(column)} → ${escapeHtml(rowColumn)}<span>${escapeHtml(fmt.format(totalPoints))} pts</span>`;
                if (meta && meta.innerHTML !== metaText) meta.innerHTML = metaText;
            }

            if (insertAfter.nextSibling !== node) {
                if (insertAfter.nextSibling) grid.insertBefore(node, insertAfter.nextSibling);
                else grid.appendChild(node);
            }
            insertAfter = node;
        }
    }

    for (const draw of drawJobs) draw();
}
