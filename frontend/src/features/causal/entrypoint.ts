import type { CausalDeps } from '../../causal/causalPage.js';

export interface CausalEntrypointDeps {
    getMetadata: () => import('../../types.js').DatasetMetadata | null;
    chipColor: (col: string, idx: number) => string;
    numericColumns: () => string[];
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

export function createCausalEntrypoint(deps: CausalEntrypointDeps) {
    return {
        init: async () => {
            const { initCausalPage } = await import('../../causal/causalPage.js');
            initCausalPage({
                getMetadata: deps.getMetadata,
                chipColor: deps.chipColor,
                numericColumns: deps.numericColumns,
                setLoading: deps.setLoading,
            });
        },
    };
}