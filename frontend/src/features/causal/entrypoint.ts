import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface CausalEntrypointDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
    chipColor: (col: string, idx: number) => string;
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

export function createCausalEntrypoint(deps: CausalEntrypointDeps) {
    return {
        init: async () => {
            const { initCausalPage } = await import('../../causal/causalPage.js');
            initCausalPage({
                workspace: deps.workspace,
                chipColor: deps.chipColor,
                setLoading: deps.setLoading,
            });
        },
    };
}
