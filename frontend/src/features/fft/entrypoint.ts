import type { FftPageDeps } from '../../pages/fftPage.js';
import { initFftPage } from '../../pages/fftPage.js';

export interface FftEntrypointDeps {
    initFftPage: (deps: FftPageDeps) => Promise<void>;
    deps: FftPageDeps;
}

export function createFftEntrypoint(deps: FftEntrypointDeps) {
    return {
        init: () => deps.initFftPage(deps.deps),
    };
}