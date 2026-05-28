import { initSpectrogramPage } from '../../pages/spectrogramPage.js';

export interface SpectrogramEntrypointDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

export function createSpectrogramEntrypoint(deps: SpectrogramEntrypointDeps) {
    return {
        init: () => initSpectrogramPage(deps),
    };
}