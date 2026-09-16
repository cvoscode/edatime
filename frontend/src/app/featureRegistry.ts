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
    clearLoadedFeatures(except?: readonly string[]): void;
    dispose(): void;
}

export function createFeatureRegistry(): FeatureRegistry {
    const loadedFeatures = new Set<string>();
    const features = new Map<string, FeatureDefinition>();
    const pendingInitializations = new Map<string, Promise<void>>();
    const featureDisposers = new Map<string, () => void>();
    let metadataReady = false;
    const generations = new Map<string, number>();
    let disposed = false;
    let releaseMetadata: (() => void) | null = null;
    const metadataPromise = new Promise<void>((resolve) => { releaseMetadata = resolve; });

    const registry: FeatureRegistry = {
        register(name: string, feature: FeatureDefinition) {
            if (disposed) return;
            features.set(name, feature);
        },
        async ensureFeatureLoaded(name: string): Promise<void> {
            if (disposed) return;
            if (loadedFeatures.has(name)) return;
            const feature = features.get(name);
            if (!feature) return;
            const pending = pendingInitializations.get(name);
            if (pending) {
                await pending;
                // A plan/dataset can change while a lazy import is in flight.
                if (!disposed && !loadedFeatures.has(name)) await registry.ensureFeatureLoaded(name);
                return;
            }

            const initialization = (async () => {
                const sessionAtStart = generations.get(name) ?? 0;
                if (feature.requiresMetadata && !metadataReady) await metadataPromise;
                if (disposed || sessionAtStart !== (generations.get(name) ?? 0)) return;
                try {
                    const dispose = await feature.init();
                    if (disposed || sessionAtStart !== (generations.get(name) ?? 0)) {
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
            await initialization;
            // The original navigation also owns completion when startup or a
            // dataset reset invalidates its generation. There may be no second
            // navigation waiting on `pending` to retry the interrupted mount.
            if (!disposed && !loadedFeatures.has(name)) await registry.ensureFeatureLoaded(name);
        },
        markMetadataReady() {
            if (disposed) return;
            metadataReady = true;
            releaseMetadata?.();
        },
        isMetadataReady() {
            return metadataReady;
        },
        clearLoadedFeatures(except: readonly string[] = []) {
            if (disposed) return;
            for (const name of features.keys()) {
                if (except.includes(name)) continue;
                generations.set(name, (generations.get(name) ?? 0) + 1);
                featureDisposers.get(name)?.();
                featureDisposers.delete(name);
                loadedFeatures.delete(name);
            }
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const dispose of featureDisposers.values()) dispose();
            featureDisposers.clear();
            loadedFeatures.clear();
            features.clear();
            releaseMetadata?.();
        },
    };
    return registry;
}
