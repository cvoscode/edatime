import type { DatasetMetadata } from '../../types.js';
import { initScatterPage } from '../../scatter/scatterPage.js';

export interface ScatterEntrypointDeps {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    metadata: DatasetMetadata;
}

export function createScatterEntrypoint(deps: ScatterEntrypointDeps) {
    return {
        init: () => deps.initScatterPage(deps.metadata),
    };
}