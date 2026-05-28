import { initFftPage } from '../../pages/fftPage.js';

export interface FftEntrypointDeps {
    renderTimeseries: () => void;
}

export function createFftEntrypoint(deps: FftEntrypointDeps) {
    return {
        init: () => initFftPage(deps),
    };
}