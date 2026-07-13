export interface FeatureDefinition {
    requiresMetadata: boolean;
    init: () => Promise<void | (() => void)>;
}

/**
 * Per-application registry for lazy feature modules.
 *
 * The registry intentionally has no module-level state: app composition owns
 * its lifetime and passes the instance to dataset/bootstrap boundaries. That
 * makes feature readiness deterministic in tests and prevents state leaking
 * between independently mounted application roots.
 */
export interface FeatureRegistry {
    register(name: string, feature: FeatureDefinition): void;
    ensureFeatureLoaded(name: string): Promise<void>;
    markMetadataReady(): void;
    isMetadataReady(): boolean;
    clearLoadedFeatures(): void;
    dispose(): void;
}

export function createFeatureRegistry(): FeatureRegistry {
    const loadedFeatures = new Set<string>();
    const features = new Map<string, FeatureDefinition>();
    const pendingInitializations = new Map<string, Promise<void>>();
    const featureDisposers = new Map<string, () => void>();
    let metadataReady = false;
    let datasetSession = 0;
    let disposed = false;
    let releaseMetadata: (() => void) | null = null;
    const metadataPromise = new Promise<void>((resolve) => { releaseMetadata = resolve; });

    return {
        register(name: string, feature: FeatureDefinition) {
            if (disposed) return;
            features.set(name, feature);
        },
        async ensureFeatureLoaded(name: string) {
            if (disposed) return;
            if (loadedFeatures.has(name)) return;
            const feature = features.get(name);
            if (!feature) return;
            const pending = pendingInitializations.get(name);
            if (pending) return pending;

            const initialization = (async () => {
                const sessionAtStart = datasetSession;
                if (feature.requiresMetadata && !metadataReady) await metadataPromise;
                if (sessionAtStart !== datasetSession) return;
                try {
                    const dispose = await feature.init();
                    if (sessionAtStart !== datasetSession) {
                        dispose?.();
                        return;
                    }
                    if (dispose) featureDisposers.set(name, dispose);
                } catch (error) {
                    // A failed feature remains retryable on the next navigation.
                    console.error(`[EdaTime] Failed to initialize feature "${name}":`, error);
                    throw error;
                }
                loadedFeatures.add(name);
            })().finally(() => {
                pendingInitializations.delete(name);
            });
            pendingInitializations.set(name, initialization);
            return initialization;
        },
        markMetadataReady() {
            if (disposed) return;
            metadataReady = true;
            releaseMetadata?.();
        },
        isMetadataReady() {
            return metadataReady;
        },
        clearLoadedFeatures() {
            if (disposed) return;
            datasetSession += 1;
            for (const dispose of featureDisposers.values()) dispose();
            featureDisposers.clear();
            loadedFeatures.clear();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            datasetSession += 1;
            for (const dispose of featureDisposers.values()) dispose();
            featureDisposers.clear();
            loadedFeatures.clear();
            features.clear();
            releaseMetadata?.();
        },
    };
}
