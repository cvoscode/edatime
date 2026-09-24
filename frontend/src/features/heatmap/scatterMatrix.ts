import type { DatasetMetadata } from '../../types/api.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { scatterState } from '../../store/scatterState.js';
import type { MatrixCellData } from '../scatter/state.js';
import { buildScatterQueryContext } from '../scatter/state.js';
import {
    buildCategoricalColorGroups,
    buildGroupedDistributionSeries,
    drawDistributionCanvas,
    drawMiniDensityCanvas,
    drawMiniScatterCanvas,
    type DistributionSeries,
} from '../scatter/helpers.js';
import { prepareMiniDensityGrid, transposeMiniDensityGrid, type MiniDensityBounds, type MiniDensityGrid } from '../scatter/miniDensity.js';
import { buildMatrixFetchPairs, createMatrixRenderSession, fetchMatrixBatchData } from '../scatter/matrix.js';
import { getDropdownValue, setDropdownDisabled, setDropdownOptions } from '../../ui/primitives/Dropdown.js';
import { getPlotColorScale } from '../../utils/settings.js';
import { isTemporalDtype } from '../../utils/format.js';
import { getEffectiveColumns } from '../../cleaning/schema.js';
import { cleaningPlanStore, getCleaningPlanHash } from '../../cleaning/store.js';
import { readHeatmapDisplayModes, type HeatmapDisplayModes } from './displayModes.js';

interface HeatmapScatterLayerDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>;
}

export interface HeatmapRenderCell extends MatrixCellData {
    diagonalSeries: DistributionSeries[] | null;
    densityGrid: MiniDensityGrid | null;
    isConstantDiagonal: boolean;
    finitePointCount: number;
}

function tupleKey(x: string, y: string): string {
    return JSON.stringify([x, y]);
}

function backendCellKey(x: string, y: string): string {
    return x + '|' + y;
}

function analysisSignature(snapshot: ReturnType<HeatmapScatterLayerDeps['workspace']['getSnapshot']>): string {
    return JSON.stringify({ filters: snapshot.filters, viewport: snapshot.viewport });
}

function renderedColumns(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>('#heatmap-container .heatmap-header'))
        .map((header) => header.dataset.dragName || '')
        .filter(Boolean);
}

export function buildCanonicalHeatmapPairs(columns: string[]): [string, string][] {
    const stableColumns = [...new Set(columns.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const rank = new Map(stableColumns.map((column, index) => [column, index]));
    return buildMatrixFetchPairs(stableColumns, { x: '', y: '' })
        .filter(([x, y]) => (rank.get(x) ?? -1) >= (rank.get(y) ?? -1));
}

function buildColumnBounds(
    pairs: [string, string][],
    datasets: Map<string, MatrixCellData>,
): Map<string, MiniDensityBounds> {
    const bounds = new Map<string, MiniDensityBounds>();
    const include = (column: string, value: number) => {
        const current = bounds.get(column) ?? { min: Infinity, max: -Infinity };
        current.min = Math.min(current.min, value);
        current.max = Math.max(current.max, value);
        bounds.set(column, current);
    };
    for (const [x, y] of pairs) {
        const data = datasets.get(backendCellKey(x, y));
        for (const point of data?.points ?? []) {
            const xv = Number(point?.[0]);
            const yv = Number(point?.[1]);
            if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
            include(x, xv);
            include(y, yv);
        }
    }
    return bounds;
}

export function buildHeatmapRenderData(
    columns: string[],
    pairs: [string, string][],
    datasets: Map<string, MatrixCellData>,
): Map<string, HeatmapRenderCell> {
    const pairData = new Map<string, MatrixCellData>();
    const densityGrids = new Map<string, MiniDensityGrid>();
    const columnBounds = buildColumnBounds(pairs, datasets);
    for (const [x, y] of pairs) {
        const data = datasets.get(backendCellKey(x, y));
        if (!data) continue;
        pairData.set(tupleKey(x, y), data);
        if (x !== y) {
            densityGrids.set(tupleKey(x, y), prepareMiniDensityGrid(
                data.points,
                columnBounds.get(x),
                columnBounds.get(y),
            ));
        }
    }

    const result = new Map<string, HeatmapRenderCell>();
    for (const row of columns) {
        for (const column of columns) {
            const direct = pairData.get(tupleKey(column, row));
            const reversed = direct ? undefined : pairData.get(tupleKey(row, column));
            const source = direct ?? reversed;
            if (!source) continue;

            if (column === row) {
                const values: number[] = [];
                const labels: unknown[] = [];
                source.points.forEach((point, index) => {
                    const value = Number(point?.[0]);
                    if (!Number.isFinite(value)) return;
                    values.push(value);
                    labels.push(source.colorLabels?.[index] ?? null);
                });
                const alignedLabels = source.colorLabels?.length === source.points.length ? labels : null;
                const groupedSeries = buildGroupedDistributionSeries(values, alignedLabels);
                result.set(tupleKey(column, row), {
                    ...source,
                    diagonalSeries: groupedSeries ?? [{ label: column, color: '#88aef2', values }],
                    densityGrid: null,
                    isConstantDiagonal: values.length > 0 && values.every((value) => value === values[0]),
                    finitePointCount: values.length,
                });
                continue;
            }

            const transpose = !direct;
            const sourceKey = transpose ? tupleKey(row, column) : tupleKey(column, row);
            const sourceGrid = densityGrids.get(sourceKey);
            if (!sourceGrid) continue;
            const points = transpose
                ? source.points.map(([x, y]) => [y, x] as [number, number])
                : source.points;
            const densityGrid = transpose ? transposeMiniDensityGrid(sourceGrid) : sourceGrid;
            result.set(tupleKey(column, row), {
                ...source,
                points,
                diagonalSeries: null,
                densityGrid,
                isConstantDiagonal: false,
                finitePointCount: densityGrid.finiteCount,
            });
        }
    }
    return result;
}

function densitySurfaceColor(): string {
    try {
        return getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#17212B';
    } catch {
        return '#17212B';
    }
}

function sampleDescription(data: HeatmapRenderCell): string {
    const returned = data.points.length;
    const total = Math.max(returned, Number(data.totalPoints) || 0);
    const sample = total > returned
        ? `${returned} sampled of ${total} eligible observations.`
        : `${returned} returned observations.`;
    const observation = data.diagonalSeries ? 'values' : 'pairs';
    return ` ${sample} ${data.finitePointCount} finite ${observation} plotted.`;
}

function updateCellPreviewDetails(
    cell: HTMLElement,
    row: string,
    column: string,
    data: HeatmapRenderCell | undefined,
    modes: HeatmapDisplayModes,
): void {
    const diagonal = row === column;
    const mode = diagonal ? modes.diagonal : modes.pairs;
    const isConstant = diagonal && data?.isConstantDiagonal;
    const plotLabel = isConstant
        ? 'Single-value marker for constant working-data levels.'
        : mode === 'kde'
            ? 'Kernel density curve of working-data levels.'
        : mode === 'histogram'
            ? 'Histogram of working-data levels.'
            : mode === 'density'
                ? 'Relative two-dimensional density of working-data levels, normalized within this pair.'
                : 'Scatter thumbnail of working-data levels.';
    const dataLabel = data ? sampleDescription(data) : ' No preview observations are available.';
    const axisLabel = diagonal
        ? ` Horizontal axis: ${column}; vertical axis: density or frequency.`
        : ` Horizontal axis: ${column}; vertical axis: ${row}. Axis units follow the source columns.`;
    const correlation = cell.getAttribute('data-correlation-tooltip') || '';
    const details = plotLabel + axisLabel + ' Current linked filters and time window apply.' + dataLabel;
    cell.setAttribute('aria-label', (correlation + ' ' + details).trim());
    cell.title = (correlation + ' ' + details).trim();
    if (data) {
        cell.dataset.previewSampleCount = String(data.points.length);
        cell.dataset.previewTotalCount = String(data.totalPoints);
    } else {
        delete cell.dataset.previewSampleCount;
        delete cell.dataset.previewTotalCount;
    }
}

function drawHeatmapCell(
    cell: HTMLElement,
    datasets: Map<string, HeatmapRenderCell>,
    modes: HeatmapDisplayModes,
): void {
    const canvas = cell.querySelector<HTMLCanvasElement>(':scope > .heatmap-cell-canvas');
    if (!canvas) return;
    const row = cell.dataset.rowName || '';
    const column = cell.dataset.colName || '';
    const color = cell.dataset.cellColor || '#ffffff';
    const data = datasets.get(tupleKey(column, row));
    const badge = { text: cell.dataset.correlationLabel || '—', color: '#15202B' };

    updateCellPreviewDetails(cell, row, column, data, modes);
    if (row === column) {
        drawDistributionCanvas(canvas, modes.diagonal, data?.diagonalSeries ?? [], {
            background: cell.classList.contains('heatmap-cell--density') ? densitySurfaceColor() : undefined,
            showEmptyLabel: true,
            badge,
        });
        return;
    }

    if (modes.pairs === 'density') {
        drawMiniDensityCanvas(canvas, data?.points ?? [], {
            background: densitySurfaceColor(),
            colorScale: getPlotColorScale('correlationMatrix'),
            grid: data?.densityGrid ?? undefined,
            badge,
            showDensityLabel: false,
        });
        return;
    }

    const categoryGroups = buildCategoricalColorGroups(data?.colorLabels);
    drawMiniScatterCanvas(canvas, data?.points ?? [], {
        background: cell.dataset.cellBackground || 'transparent',
        badge: { text: cell.dataset.correlationLabel || '—', color },
        color,
        colorValues: data?.colorValues,
        colorLabels: categoryGroups ? data?.colorLabels : null,
        colorScale: getPlotColorScale('pairPlot'),
        categoryColors: categoryGroups?.colorByLabel,
        pointAlpha: 0.52,
        pointRadius: 1.25,
        showEmptyLabel: true,
    });
}

export function drawUnifiedHeatmapCanvases(
    datasets: Map<string, HeatmapRenderCell>,
    modes: HeatmapDisplayModes = readHeatmapDisplayModes(),
): void {
    document.querySelectorAll<HTMLElement>('#heatmap-container .heatmap-cell')
        .forEach((cell) => drawHeatmapCell(cell, datasets, modes));
}

function drawHeatmapCanvasesInFrames(
    datasets: Map<string, HeatmapRenderCell>,
    modes: HeatmapDisplayModes,
    signal: AbortSignal,
): Promise<boolean> {
    const cells = Array.from(document.querySelectorAll<HTMLElement>('#heatmap-container .heatmap-cell'));
    if (cells.length === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
        let index = 0;
        let frame = 0;
        let settled = false;
        const finish = (complete: boolean) => {
            if (settled) return;
            settled = true;
            if (frame) cancelAnimationFrame(frame);
            signal.removeEventListener('abort', onAbort);
            resolve(complete);
        };
        const onAbort = () => finish(false);
        const draw = () => {
            frame = 0;
            if (signal.aborted) { finish(false); return; }
            const start = performance.now();
            do {
                drawHeatmapCell(cells[index]!, datasets, modes);
                index += 1;
            } while (index < cells.length && performance.now() - start < 8);
            if (index < cells.length) frame = requestAnimationFrame(draw);
            else finish(true);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        frame = requestAnimationFrame(draw);
    });
}

/** Add density or scatter previews and diagonal distributions to the Correlation matrix. */
export async function initHeatmapScatterLayer(
    metadata: DatasetMetadata,
    deps: HeatmapScatterLayerDeps,
): Promise<() => void> {
    const lifetime = new AbortController();
    const session = createMatrixRenderSession();
    scatterState.metadata = metadata;
    let renderSequence = 0;
    let inFlightKey = '';
    let loadedKey = '';
    let loadedDatasets = new Map<string, HeatmapRenderCell>();

    const workingColumns = getEffectiveColumns(metadata, cleaningPlanStore.getSnapshot());
    const colorOptions = ['', ...new Set(workingColumns.map((column) => column.name).filter(Boolean))];
    const selectedColor = setDropdownOptions('heatmap-color-column', colorOptions.map((column) => ({
        value: column,
        label: column || 'None',
    })), {
        preferredValue: colorOptions.includes(scatterState.colorColumn) ? scatterState.colorColumn : '',
        searchable: colorOptions.length > 11,
        deferSearchUntilTyping: true,
    });
    scatterState.colorColumn = selectedColor;
    setDropdownDisabled('heatmap-color-column', readHeatmapDisplayModes().pairs === 'density');

    const setLoading = (loading: boolean, label?: string) => {
        const overlay = document.getElementById('heatmap-loading');
        if (overlay) overlay.hidden = !loading;
        if (label) {
            const labelEl = document.getElementById('heatmap-loading-label');
            if (labelEl) labelEl.textContent = label;
        }
    };
    const setPreviewError = (message = '') => {
        const container = document.getElementById('heatmap-preview-error');
        const label = document.getElementById('heatmap-preview-error-message');
        if (label) label.textContent = message;
        if (container) container.hidden = !message;
    };

    const drawCurrentGrid = async (signal: AbortSignal): Promise<boolean> => {
        const currentModes = readHeatmapDisplayModes();
        const complete = await drawHeatmapCanvasesInFrames(loadedDatasets, currentModes, signal);
        if (complete) setPreviewError('');
        return complete;
    };

    const render = async (force = false) => {
        const columns = renderedColumns();
        if (columns.length === 0) return;
        const queryColumns = [...new Set(columns)].sort((a, b) => a.localeCompare(b));
        const currentModes = readHeatmapDisplayModes();
        setDropdownDisabled('heatmap-color-column', currentModes.pairs === 'density');
        const selectedColorColumn = getDropdownValue('heatmap-color-column');
        const colorColumn = currentModes.pairs === 'scatter' ? selectedColorColumn : '';
        const snapshot = deps.workspace.getSnapshot();
        const renderKey = JSON.stringify({
            columns: queryColumns,
            colorColumn,
            analysis: analysisSignature(snapshot),
            cleaningPlanHash: getCleaningPlanHash(),
        });
        scatterState.colorColumn = selectedColorColumn;
        setPreviewError('');

        if (!force && renderKey === loadedKey) {
            const signal = session.begin();
            await drawHeatmapCanvasesInFrames(loadedDatasets, readHeatmapDisplayModes(), signal);
            setLoading(false);
            return;
        }
        if (!force && renderKey === inFlightKey) {
            drawUnifiedHeatmapCanvases(new Map());
            setLoading(true, 'Loading matrix previews…');
            return;
        }

        drawUnifiedHeatmapCanvases(new Map());
        const sequence = ++renderSequence;
        inFlightKey = renderKey;
        setLoading(true, 'Loading matrix previews…');
        const signal = session.begin();
        const pairs = buildCanonicalHeatmapPairs(queryColumns);
        const context = buildScatterQueryContext({ colorColumn, scopeToColumns: false }, snapshot);
        const colorMetadata = workingColumns.find((column) => column.name === colorColumn);
        if (colorMetadata && isTemporalDtype(colorMetadata.dtype)) context.timeColorMode = 'raw';
        try {
            const fetched = await fetchMatrixBatchData(pairs, context, colorColumn, signal);
            if (sequence !== renderSequence || signal.aborted) return;
            loadedDatasets = buildHeatmapRenderData(queryColumns, pairs, fetched);
            loadedKey = renderKey;
            await drawCurrentGrid(signal);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error('Correlation matrix pair previews are unavailable.', error);
            setPreviewError('Pair previews could not load. Correlation values remain available.');
        } finally {
            if (sequence === renderSequence && inFlightKey === renderKey) inFlightKey = '';
            if (sequence === renderSequence) setLoading(false);
        }
    };

    const onRetry = () => {
        loadedKey = '';
        void render(true);
    };
    document.addEventListener('edatime:heatmap-grid-rendered', () => { void render(); }, { signal: lifetime.signal });
    document.getElementById('heatmap-color-column')?.addEventListener('change', () => { void render(); }, { signal: lifetime.signal });
    document.getElementById('heatmap-preview-retry')?.addEventListener('click', onRetry, { signal: lifetime.signal });

    let previousSignature = analysisSignature(deps.workspace.getSnapshot());
    let previousPlanHash = getCleaningPlanHash();
    const unsubscribe = deps.workspace.subscribe((snapshot) => {
        const nextSignature = analysisSignature(snapshot);
        if (nextSignature === previousSignature) return;
        previousSignature = nextSignature;
        void render();
    });
    const unsubscribePlan = cleaningPlanStore.subscribe(() => {
        const nextPlanHash = getCleaningPlanHash();
        if (nextPlanHash === previousPlanHash) return;
        previousPlanHash = nextPlanHash;
        void render();
    });

    await render();
    return () => {
        renderSequence += 1;
        setLoading(false);
        setPreviewError('');
        lifetime.abort();
        unsubscribe();
        unsubscribePlan();
        session.dispose();
    };
}
