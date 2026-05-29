import type { DriftEntrypointDeps } from '../../drift/driftPage.js';

export function createDriftEntrypoint(deps: DriftEntrypointDeps) {
    return {
        init: async () => {
            const { initDriftPage } = await import('../../drift/driftPage.js');
            const metadata = deps.getMetadata();
            initDriftPage(metadata);
        },
    };
}