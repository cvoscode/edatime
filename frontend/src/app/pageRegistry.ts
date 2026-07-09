export interface PageDefinition {
    requiresMetadata: boolean;
    init: () => Promise<void>;
}

/**
 * Per-application registry for lazy page features.
 *
 * The registry intentionally has no module-level state: app composition owns
 * its lifetime and passes the instance to dataset/bootstrap boundaries. That
 * makes page readiness deterministic in tests and prevents state leaking
 * between independently mounted application roots.
 */
export interface PageRegistry {
    register(name: string, page: PageDefinition): void;
    ensurePageModuleLoaded(name: string): Promise<void>;
    markMetadataReady(): void;
    isMetadataReady(): boolean;
    clearLoadedPageModules(): void;
}

export function createPageRegistry(): PageRegistry {
    const instanceLoaded = new Set<string>();
    const instancePages = new Map<string, PageDefinition>();
    const pendingInitializations = new Map<string, Promise<void>>();
    let instanceMetadataReady = false;
    let instanceReleaseMetadata: (() => void) | null = null;
    const instanceMetadataPromise = new Promise<void>((resolve) => { instanceReleaseMetadata = resolve; });

    return {
        register(name: string, page: PageDefinition) {
            instancePages.set(name, page);
        },
        async ensurePageModuleLoaded(name: string) {
            if (instanceLoaded.has(name)) return;
            const page = instancePages.get(name);
            if (!page) return;
            const pending = pendingInitializations.get(name);
            if (pending) return pending;

            const initialization = (async () => {
                if (page.requiresMetadata && !instanceMetadataReady) await instanceMetadataPromise;
                try {
                    await page.init();
                } catch (error) {
                    // A failed page remains retryable on the next navigation.
                    console.error(`[EdaTime] Failed to initialize page "${name}":`, error);
                    throw error;
                }
                instanceLoaded.add(name);
            })().finally(() => {
                pendingInitializations.delete(name);
            });
            pendingInitializations.set(name, initialization);
            return initialization;
        },
        markMetadataReady() {
            instanceMetadataReady = true;
            instanceReleaseMetadata?.();
        },
        isMetadataReady() {
            return instanceMetadataReady;
        },
        clearLoadedPageModules() {
            instanceLoaded.clear();
        },
    };
}
