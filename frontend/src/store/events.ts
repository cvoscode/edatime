export interface StoreChange<T> {
    next: T;
    previous: T;
}

export type StoreEventMap = {
    'analytics:anomalyEnabled': StoreChange<boolean>;
    'analytics:anomalyGlobalEnabled': StoreChange<boolean>;
    'analytics:anomalyMethod': StoreChange<string>;
    'analytics:anomalyRegions': StoreChange<unknown>;
    'analytics:anomalySummaryStats': StoreChange<unknown>;
    'analytics:anomalyThreshold': StoreChange<number>;
    'analytics:rollingBands': StoreChange<unknown>;
    'analytics:rollingEnabled': StoreChange<boolean>;
    'analytics:rollingWindow': StoreChange<number>;
    'analytics:spectralFilterPreview': StoreChange<unknown>;
    'chart:chart': StoreChange<unknown>;
    'chart:chartText': StoreChange<unknown>;
    'chart:stackFromZero': StoreChange<boolean>;
    'chart:currentEnd': StoreChange<number | null>;
    'chart:currentStart': StoreChange<number | null>;
    'chart:initialView': StoreChange<unknown>;
    'chart:viewport': StoreChange<{ start: number | null; end: number | null }>;
    'chart:zoomHistory': StoreChange<unknown>;
    'dataset:columnProfiles': StoreChange<unknown>;
    'dataset:datasetRevision': StoreChange<number>;
    'dataset:metadata': StoreChange<unknown>;
    'dataset:numericCols': StoreChange<string[]>;
    'runtime:analysisBound': StoreChange<boolean>;
    'runtime:fetchDebounceId': StoreChange<ReturnType<typeof setTimeout> | null>;
    'runtime:fetchedWindow': StoreChange<unknown>;
    'runtime:lastFetchedData': StoreChange<unknown>;
    'runtime:pendingRestoreY': StoreChange<{ min: number; max: number } | null>;
    'runtime:pendingYMode': StoreChange<unknown>;
    'runtime:refetchOnZoom': StoreChange<boolean>;
    'scatter:state': StoreChange<unknown>;
    'ui:adaptiveFilterColumn': StoreChange<string | null>;
    'ui:adaptiveLineFilters': StoreChange<unknown>;
    'ui:columnRanges': StoreChange<unknown>;
    'ui:filterText': StoreChange<string>;
    'ui:pendingAdaptivePoint': StoreChange<unknown>;
    'ui:previewSelectedColumns': StoreChange<string[]>;
    'ui:previewTimeColumn': StoreChange<string | null>;
    'ui:profileFilterText': StoreChange<string>;
    'ui:profileFilterCategory': StoreChange<string>;
    'ui:profileGridBound': StoreChange<boolean>;
    'ui:profileGridColWidths': StoreChange<number[]>;
    'ui:profileGridHeaderBound': StoreChange<boolean>;
    'ui:profileGridSort': StoreChange<unknown>;
    'ui:selectedColorColumn': StoreChange<string | null>;
    'ui:selectedCols': StoreChange<string[]>;
    'ui:seriesColors': StoreChange<Record<string, string>>;
};

type StoreHandler<K extends keyof StoreEventMap> = (payload: StoreEventMap[K]) => void;

const subscribers = new Map<keyof StoreEventMap, Set<(payload: unknown) => void>>();

export function emitStoreEvent<K extends keyof StoreEventMap>(
    eventName: K,
    payload: StoreEventMap[K],
): void {
    const handlers = subscribers.get(eventName);
    if (!handlers) return;
    for (const handler of Array.from(handlers)) {
        handler(payload);
    }
}

export function subscribe<K extends keyof StoreEventMap>(
    eventName: K,
    handler: StoreHandler<K>,
): () => void {
    const handlers = subscribers.get(eventName) ?? new Set<(payload: unknown) => void>();
    handlers.add(handler as (payload: unknown) => void);
    subscribers.set(eventName, handlers);
    return () => unsubscribe(eventName, handler);
}

export function unsubscribe<K extends keyof StoreEventMap>(
    eventName: K,
    handler: StoreHandler<K>,
): void {
    subscribers.get(eventName)?.delete(handler as (payload: unknown) => void);
}

export function clearSubscribers(): void {
    subscribers.clear();
}
