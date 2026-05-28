import type { SpectrogramPageDeps } from '../../pages/spectrogramPage.js';
import { initSpectrogramPage } from '../../pages/spectrogramPage.js';

export interface SpectrogramEntrypointDeps {
    initSpectrogramPage: (deps: SpectrogramPageDeps) => Promise<void>;
    deps: SpectrogramPageDeps;
}

export function createSpectrogramEntrypoint(deps: SpectrogramEntrypointDeps) {
    return {
        init: () => deps.initSpectrogramPage(deps.deps),
    };
}