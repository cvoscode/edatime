import { initFftPage } from '../../pages/fftPage.js';

export interface FftEntrypointDeps {
    getRenderTimeseries: () => void;
}

export function createFftEntrypoint(deps: FftEntrypointDeps) {
    return {
        init: () => initFftPage({ renderTimeseries: deps.getRenderTimeseries }),
    };
}