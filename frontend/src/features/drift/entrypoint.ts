import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface DriftEntrypointDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
}

export function createDriftEntrypoint(deps: DriftEntrypointDeps) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            initialized = true;
            const { initDriftPage } = await import('../../drift/driftPage.js');
            initDriftPage(deps.workspace.getSnapshot().dataset.metadata);
        },
    };
}
