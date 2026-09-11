import type { DatasetMetadata } from '../../../types/api.js';
import type { WorkspaceStore } from '../../../workspace/workspaceStore.js';

interface HeatmapPairPlotDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'subscribe'>;
}

/**
 * Mount the existing Pair plot surface inside the correlation workspace.
 *
 * Keeping this adapter at the heatmap boundary gives the combined page one
 * owner while preserving the battle-tested scatter renderer and controls.
 */
export async function initHeatmapPairPlot(
    metadata: DatasetMetadata,
    deps: HeatmapPairPlotDeps,
): Promise<{ dispose: () => void; selectPair: (x: string, y: string) => Promise<void> }> {
    const pageMain = document.querySelector<HTMLElement>('#page-heatmap > .main--padded');
    const pairPlot = document.getElementById('heatmap-pair-plot');
    const heatmap = document.getElementById('heatmap-container');
    if (pageMain && pairPlot && heatmap) {
        let workspace = pageMain.querySelector<HTMLElement>(':scope > .correlation-workspace');
        if (!workspace) {
            workspace = document.createElement('div');
            workspace.className = 'correlation-workspace';
            const matrixPane = document.createElement('section');
            matrixPane.className = 'correlation-workspace__matrix';
            matrixPane.setAttribute('aria-label', 'Correlation matrix');
            pageMain.prepend(workspace);
            workspace.append(matrixPane, pairPlot);
            for (const id of ['heatmap-container', 'heatmap-empty-state', 'heatmap-loading']) {
                const element = document.getElementById(id);
                if (element) matrixPane.append(element);
            }
        } else if (!workspace.contains(pairPlot)) {
            workspace.append(pairPlot);
        }
        pairPlot.hidden = false;
    }

    const { initScatterPage, selectScatterPair } = await import('../../scatter/index.js');
    const dispose = await initScatterPage(metadata, { workspace: deps.workspace });
    return { dispose, selectPair: selectScatterPair };
}
