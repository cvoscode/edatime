export interface DriftEntrypointDeps {
    initDriftPage: (metadata: unknown) => void;
    getMetadata: () => unknown;
}

export function createDriftEntrypoint(deps: DriftEntrypointDeps) {
    return {
        init: async () => {
            const { initDriftPage } = await import('../../drift/driftPage.js');
            const metadata = deps.getMetadata();
            initDriftPage(metadata);
        },
    };
}