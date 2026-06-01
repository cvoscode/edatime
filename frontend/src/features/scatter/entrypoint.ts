import type { DatasetMetadata } from '../../types.js';
import { initScatterPage } from '../../scatter/scatterPage.js';

export interface ScatterEntrypointDeps {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    getMetadata: () => DatasetMetadata;
}

export function createScatterEntrypoint(deps: ScatterEntrypointDeps) {
    return {
        init: async () => {
            const metadata = deps.getMetadata();
            await deps.initScatterPage(metadata);
        },
    };
}