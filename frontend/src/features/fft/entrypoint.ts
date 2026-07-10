import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface FftEntrypointDeps {
    getRenderTimeseries: () => void;
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
}

export function createFftEntrypoint(deps: FftEntrypointDeps) {
    return {
        init: async () => {
            const { initFftPage } = await import('../../pages/fftPage.js');
            initFftPage({ renderTimeseries: deps.getRenderTimeseries, workspace: deps.workspace });
        },
    };
}
