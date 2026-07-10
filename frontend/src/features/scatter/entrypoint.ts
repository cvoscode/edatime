import type { DatasetMetadata } from '../../types.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface ScatterEntrypointDeps {
    getMetadata: () => DatasetMetadata;
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
}

export function createScatterEntrypoint(deps: ScatterEntrypointDeps) {
    return {
        init: async () => {
            const { initScatterPage } = await import('../../scatter/scatterPage.js');
            const metadata = deps.getMetadata();
            await initScatterPage(metadata, { workspace: deps.workspace });
        },
    };
}
