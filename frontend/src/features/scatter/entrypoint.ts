import type { DatasetMetadata } from '../../types.js';

export interface ScatterEntrypointDeps {
    getMetadata: () => DatasetMetadata;
}

export function createScatterEntrypoint(deps: ScatterEntrypointDeps) {
    return {
        init: async () => {
            const { initScatterPage } = await import('../../scatter/scatterPage.js');
            const metadata = deps.getMetadata();
            await initScatterPage(metadata);
        },
    };
}
