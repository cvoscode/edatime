export interface DriftEntrypointDeps {
    initDriftPage: (metadata: unknown) => void;
    getMetadata: () => unknown;
}

export function createDriftEntrypoint(deps: DriftEntrypointDeps) {
    let initialized = false;

    return {
        init() {
            if (initialized) return;
            initialized = true;
            // Async work (dynamic import) is handled internally so init() stays synchronous.
            void (async () => {
                const { initDriftPage } = await import('../../drift/driftPage.js');
                initDriftPage(deps.getMetadata());
            })();
        },
    };
}