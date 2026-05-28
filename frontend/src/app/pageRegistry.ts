const loaded = new Set<string>();
const pages = new Map<string, { requiresMetadata: boolean; init: () => Promise<void> }>();
let metadataReady = false;
let releaseMetadata: (() => void) | null = null;
const metadataPromise = new Promise<void>((resolve) => { releaseMetadata = resolve; });

export function register(name: string, page: { requiresMetadata: boolean; init: () => Promise<void> }) {
    pages.set(name, page);
}

export async function ensurePageModuleLoaded(name: string) {
    if (loaded.has(name)) return;
    const page = pages.get(name);
    if (!page) return;
    if (page.requiresMetadata && !metadataReady) await metadataPromise;
    await page.init();
    loaded.add(name);
}

export function markMetadataReady() {
    metadataReady = true;
    releaseMetadata?.();
}

export function isMetadataReady() {
    return metadataReady;
}

export function clearLoadedPageModules() {
    loaded.clear();
}

// Export createPageRegistry for test compatibility - creates isolated instance
export function createPageRegistry() {
    const instanceLoaded = new Set<string>();
    const instancePages = new Map<string, { requiresMetadata: boolean; init: () => Promise<void> }>();
    let instanceMetadataReady = false;
    let instanceReleaseMetadata: (() => void) | null = null;
    const instanceMetadataPromise = new Promise<void>((resolve) => { instanceReleaseMetadata = resolve; });
    return {
        register(name: string, page: { requiresMetadata: boolean; init: () => Promise<void> }) {
            instancePages.set(name, page);
        },
        async ensurePageModuleLoaded(name: string) {
            if (instanceLoaded.has(name)) return;
            const page = instancePages.get(name);
            if (!page) return;
            if (page.requiresMetadata && !instanceMetadataReady) await instanceMetadataPromise;
            await page.init();
            instanceLoaded.add(name);
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