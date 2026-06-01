export interface DriftEntrypointDeps {
    initDriftPage: (metadata: unknown) => void;
    getMetadata: () => unknown;
}

export function createDriftEntrypoint(deps: DriftEntrypointDeps) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            initialized = true;
            const { initDriftPage } = await import('../../drift/driftPage.js');
            initDriftPage(deps.getMetadata());
        },
    };
}