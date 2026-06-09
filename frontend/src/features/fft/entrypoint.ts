export interface FftEntrypointDeps {
    getRenderTimeseries: () => void;
}

export function createFftEntrypoint(deps: FftEntrypointDeps) {
    return {
        init: async () => {
            const { initFftPage } = await import('../../pages/fftPage.js');
            initFftPage({ renderTimeseries: deps.getRenderTimeseries });
        },
    };
}
