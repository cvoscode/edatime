import type { CausalDeps } from '../../causal/causalPage.js';
import { initCausalPage } from '../../causal/causalPage.js';

export interface CausalEntrypointDeps {
    initCausalPage: (deps: CausalDeps) => void;
    deps: CausalDeps;
}

export function createCausalEntrypoint(deps: CausalEntrypointDeps) {
    return {
        init: () => deps.initCausalPage(deps.deps),
    };
}