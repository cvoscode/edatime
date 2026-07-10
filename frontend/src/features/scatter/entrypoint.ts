import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface ScatterEntrypointDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
}

export function createScatterEntrypoint(deps: ScatterEntrypointDeps) {
    return {
        init: async () => {
            const { initScatterPage } = await import('../../scatter/scatterPage.js');
            const metadata = deps.workspace.getSnapshot().dataset.metadata;
            if (!metadata) return;
            await initScatterPage(metadata, { workspace: deps.workspace });
        },
    };
}
