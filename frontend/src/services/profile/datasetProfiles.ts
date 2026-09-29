import type { DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';

export type DatasetProfileKind = 'exact' | 'sampled';
export interface DatasetProfileSource {
    id: string;
    revision: number;
    datasetFingerprint: string | null;
}

export function datasetProfileKind(response: DatasetProfileResponse): DatasetProfileKind | null {
    if (response.algorithmVersion === 'exact-v1') return 'exact';
    if (['sample-v1', 'sample-v2'].includes(response.algorithmVersion)) return 'sampled';
    return null;
}

export function matchesProfileSource(source: DatasetProfileSource, response: DatasetProfileResponse): boolean {
    return response.sourceVersion?.id === source.id
        && response.sourceVersion.revision === source.revision
        && (source.datasetFingerprint === null || response.sourceVersion.datasetFingerprint === source.datasetFingerprint);
}

/** Source profiles are shared across pages; incoming file previews never enter this cache. */
export function createDatasetProfileStore() {
    const sources = new Map<string, Partial<Record<DatasetProfileKind, DatasetProfileResponse>>>();
    const listeners = new Set<(response: DatasetProfileResponse) => void>();
    const key = (source: DatasetProfileSource) => JSON.stringify([source.id, source.revision, source.datasetFingerprint]);

    return {
        get(source: DatasetProfileSource, kind: DatasetProfileKind): DatasetProfileResponse | undefined {
            return sources.get(key(source))?.[kind];
        },
        publish(response: DatasetProfileResponse): void {
            const kind = datasetProfileKind(response);
            if (!kind || !response.sourceVersion?.id) return;
            const sourceKey = key(response.sourceVersion);
            const profiles = sources.get(sourceKey) ?? {};
            // A late poll must not replace a completed immutable-source report with pending state.
            if ((profiles[kind]?.status === 'ready' && profiles[kind]?.algorithmVersion === response.algorithmVersion) || profiles[kind] === response) return;
            if (profiles[kind]?.algorithmVersion === 'sample-v2' && response.algorithmVersion === 'sample-v1') return;
            profiles[kind] = response;
            sources.delete(sourceKey);
            sources.set(sourceKey, profiles);
            // Retain recent versions for dataset switching without unbounded profile memory.
            if (sources.size > 8) sources.delete(sources.keys().next().value!);
            for (const listener of listeners) listener(response);
        },
        subscribe(listener: (response: DatasetProfileResponse) => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

export const datasetProfiles = createDatasetProfileStore();
