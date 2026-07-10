import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface SpectrogramEntrypointDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
}

export function createSpectrogramEntrypoint(deps: SpectrogramEntrypointDeps) {
    return {
        init: async () => {
            const { initSpectrogramPage } = await import('../../pages/spectrogramPage.js');
            initSpectrogramPage(deps);
        },
    };
}
