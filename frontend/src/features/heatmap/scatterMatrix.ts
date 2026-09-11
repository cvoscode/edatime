import type { DatasetMetadata } from '../../types/api.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { scatterState } from '../../store/scatterState.js';
import type { MatrixCellData } from '../scatter/state.js';
import { buildScatterQueryContext } from '../scatter/state.js';
import {
    buildCategoricalColorGroups,
    buildGroupedDistributionSeries,
    drawDistributionCanvas,
    drawMiniScatterCanvas,
} from '../scatter/helpers.js';
import { buildMatrixFetchPairs, createMatrixRenderSession, fetchMatrixBatchData } from '../scatter/matrix.js';
import { getDropdownValue, setDropdownOptions } from '../../ui/primitives/Dropdown.js';
import { getPlotColorScale } from '../../utils/settings.js';
import { isTemporalDtype } from '../../utils/format.js';

interface HeatmapScatterLayerDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>;
}

function analysisSignature(snapshot: ReturnType<HeatmapScatterLayerDeps['workspace']['getSnapshot']>): string {
    return JSON.stringify({ filters: snapshot.filters, viewport: snapshot.viewport });
}

function renderedColumns(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>('#heatmap-container .heatmap-header'))
        .map((header) => header.dataset.dragName || '')
        .filter(Boolean);
}

/** Draw the unified correlation background, point cloud, and badge into each cell canvas. */
export function drawUnifiedHeatmapCanvases(datasets: Map<string, MatrixCellData>): void {
    document.querySelectorAll<HTMLElement>('#heatmap-container .heatmap-cell').forEach((cell) => {
        const canvas = cell.querySelector<HTMLCanvasElement>(':scope > .heatmap-cell-canvas');
        if (!canvas) return;
        const row = cell.dataset.rowName || '';
        const column = cell.dataset.colName || '';
        const background = cell.dataset.cellBackground || 'transparent';
        const color = cell.dataset.cellColor || '#ffffff';
        const data = datasets.get(`${column}|${row}`);

        if (row === column) {
            const values = (data?.points || [])
                .map((point) => Number(point?.[0]))
                .filter((value) => Number.isFinite(value));
            const groupedSeries = buildGroupedDistributionSeries(values, data?.colorLabels);
            drawDistributionCanvas(canvas, 'histogram', groupedSeries || [{ label: column, color, values }], {
                background,
                showEmptyLabel: false,
            });
            return;
        }

        const categoryGroups = buildCategoricalColorGroups(data?.colorLabels);
        drawMiniScatterCanvas(canvas, data?.points || [], {
            background,
            badge: { text: cell.dataset.correlationLabel || '—', color },
            color,
            colorValues: data?.colorValues,
            colorLabels: categoryGroups ? data?.colorLabels : null,
            colorScale: getPlotColorScale('pairPlot'),
            categoryColors: categoryGroups?.colorByLabel,
            pointAlpha: 0.52,
            pointRadius: 1.25,
            showEmptyLabel: false,
        });
    });
}

/** Add scatter thumbnails and diagonal histograms to the Correlation page's single grid. */
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
    let loadedDatasets = new Map<string, MatrixCellData>();

    const colorOptions = ['', ...new Set(
        (metadata.columns || [])
            .map((column) => String(column?.name || ''))
            .filter(Boolean),
    )];
    if (colorOptions.length === 1) {
        colorOptions.push(...metadata.numeric_columns.filter(Boolean));
    }
    const selectedColor = setDropdownOptions('heatmap-color-column', colorOptions.map((column) => ({
        value: column,
        label: column || 'None',
    })), {
        preferredValue: colorOptions.includes(scatterState.colorColumn) ? scatterState.colorColumn : '',
        searchable: colorOptions.length > 11,
        deferSearchUntilTyping: true,
    });
    scatterState.colorColumn = selectedColor;

    const setLoading = (loading: boolean) => {
        const overlay = document.getElementById('heatmap-loading');
        if (overlay) overlay.hidden = !loading;
        if (loading) {
            const label = document.getElementById('heatmap-loading-label');
            if (label) label.textContent = 'Loading scatter thumbnails…';
        }
    };

    const render = async () => {
        const columns = renderedColumns();
        if (columns.length === 0) return;
        const colorColumn = getDropdownValue('heatmap-color-column');
        const snapshot = deps.workspace.getSnapshot();
        const renderKey = JSON.stringify({ columns, colorColumn, analysis: analysisSignature(snapshot) });
        scatterState.colorColumn = colorColumn;
        drawUnifiedHeatmapCanvases(new Map());

        // Replacing the heatmap DOM can trigger ResizeObserver more than once.
        // Reuse an identical request instead of aborting it and then receiving
        // the same now-aborted promise from the shared matrix cache.
        if (renderKey === loadedKey) {
            drawUnifiedHeatmapCanvases(loadedDatasets);
            setLoading(false);
            return;
        }
        if (renderKey === inFlightKey) {
            setLoading(true);
            return;
        }

        const sequence = ++renderSequence;
        inFlightKey = renderKey;
        setLoading(true);
        const signal = session.begin();
        const pairs = buildMatrixFetchPairs(columns, { x: '', y: '' });
        const context = buildScatterQueryContext({ colorColumn, scopeToColumns: false }, snapshot);
        const colorMetadata = metadata.columns?.find((column) => column.name === colorColumn);
        if (colorMetadata && isTemporalDtype(colorMetadata.dtype)) context.timeColorMode = 'raw';
        try {
            const datasets = await fetchMatrixBatchData(pairs, context, colorColumn, signal);
            if (sequence !== renderSequence || signal.aborted) return;
            loadedKey = renderKey;
            loadedDatasets = datasets;
            drawUnifiedHeatmapCanvases(datasets);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error('Unified correlation scatter thumbnails are unavailable.', error);
        } finally {
            if (inFlightKey === renderKey) inFlightKey = '';
            if (sequence === renderSequence) setLoading(false);
        }
    };

    document.addEventListener('edatime:heatmap-grid-rendered', () => { void render(); }, { signal: lifetime.signal });
    document.getElementById('heatmap-color-column')?.addEventListener('change', () => { void render(); }, { signal: lifetime.signal });

    let previousSignature = analysisSignature(deps.workspace.getSnapshot());
    const unsubscribe = deps.workspace.subscribe((snapshot) => {
        const nextSignature = analysisSignature(snapshot);
        if (nextSignature === previousSignature) return;
        previousSignature = nextSignature;
        void render();
    });

    await render();
    return () => {
        renderSequence += 1;
        setLoading(false);
        lifetime.abort();
        unsubscribe();
        session.dispose();
    };
}
