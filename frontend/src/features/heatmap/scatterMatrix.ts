import type { DatasetMetadata } from '../../types/api.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { scatterState } from '../../store/scatterState.js';
import { getDropdownValue, setDropdownValue } from '../../ui/primitives/Dropdown.js';
import { requestScatterPair } from '../scatter/pairIntent.js';
import { createMatrixRenderSession, renderScatterMatrixView } from '../scatter/matrix.js';

interface HeatmapScatterMatrixDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>;
    showPage: (page: string) => void;
}

function analysisSignature(snapshot: ReturnType<HeatmapScatterMatrixDeps['workspace']['getSnapshot']>): string {
    return JSON.stringify({ filters: snapshot.filters, viewport: snapshot.viewport });
}

/** Mount the scatter-matrix sub-view owned by the Correlation matrix page. */
export async function initHeatmapScatterMatrix(
    metadata: DatasetMetadata,
    deps: HeatmapScatterMatrixDeps,
): Promise<() => void> {
    const root = document.querySelector<HTMLElement>('.heatmap-scatter-matrix');
    if (!root) return () => {};
    const lifetime = new AbortController();
    const session = createMatrixRenderSession();
    scatterState.metadata = metadata;
    scatterState.matrixColumnOrder = [];

    const render = async () => {
        const loading = document.getElementById('scatter-matrix-loading');
        if (loading) loading.hidden = false;
        try {
            await renderScatterMatrixView((x, y) => {
                requestScatterPair(x, y);
                deps.showPage('scatter');
            }, deps.workspace.getSnapshot(), session);
        } finally {
            if (loading) loading.hidden = true;
        }
    };

    const matrixMode = document.getElementById('scatter-matrix-mode') as HTMLInputElement | null;
    root.querySelectorAll<HTMLButtonElement>('[data-matrix-mode]').forEach((button) => {
        button.addEventListener('click', () => {
            const mode = button.dataset.matrixMode === 'density' ? 'density' : 'scatter';
            if (matrixMode) matrixMode.value = mode;
            root.querySelectorAll<HTMLButtonElement>('[data-matrix-mode]').forEach((candidate) => {
                const active = candidate === button;
                candidate.classList.toggle('active', active);
                candidate.setAttribute('aria-pressed', String(active));
            });
            void render();
        }, { signal: lifetime.signal });
    });

    const size = document.getElementById('scatter-matrix-cell-size') as HTMLInputElement | null;
    const sizeValue = document.getElementById('scatter-matrix-cell-size-value');
    size?.addEventListener('input', () => {
        if (sizeValue) sizeValue.textContent = size.value;
        void render();
    }, { signal: lifetime.signal });

    const diagonal = document.getElementById('heatmap-scatter-diagonal-mode');
    diagonal?.addEventListener('change', () => {
        setDropdownValue('scatter-diagonal-mode', getDropdownValue('heatmap-scatter-diagonal-mode'), { emitChange: false });
        void render();
    }, { signal: lifetime.signal });

    document.getElementById('scatter-matrix-link-range')?.addEventListener('change', () => {
        void render();
    }, { signal: lifetime.signal });

    let previousSignature = analysisSignature(deps.workspace.getSnapshot());
    const unsubscribe = deps.workspace.subscribe((snapshot) => {
        const nextSignature = analysisSignature(snapshot);
        if (nextSignature === previousSignature) return;
        previousSignature = nextSignature;
        void render();
    });

    await render();
    return () => {
        lifetime.abort();
        unsubscribe();
        session.dispose();
    };
}
