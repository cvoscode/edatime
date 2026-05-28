import { initDriftPage } from '../../drift/driftPage.js';

export interface DriftEntrypointDeps {
    initDriftPage: (metadata: any) => Promise<void>;
    metadata: any;
}

export function createDriftEntrypoint(deps: DriftEntrypointDeps) {
    return {
        init: () => deps.initDriftPage(deps.metadata),
    };
}