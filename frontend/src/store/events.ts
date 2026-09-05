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
    'analytics:rollingDisplayMode': StoreChange<'raw' | 'smooth' | 'both'>;
    'analytics:rollingEnabled': StoreChange<boolean>;
    'analytics:rollingWindow': StoreChange<number>;
    'analytics:spectralFilterPreview': StoreChange<unknown>;
    'scatter:state': StoreChange<unknown>;
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
