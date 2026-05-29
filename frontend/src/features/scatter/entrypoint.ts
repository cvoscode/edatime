import type { DatasetMetadata } from '../../types.js';
import { initScatterPage } from '../../scatter/scatterPage.js';

export interface ScatterEntrypointDeps {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    getMetadata: () => DatasetMetadata;
}

export function createScatterEntrypoint(deps: ScatterEntrypointDeps) {
    return {
        init: () => {
            const metadata = deps.getMetadata();
            return deps.initScatterPage(metadata);
        },
    };
}