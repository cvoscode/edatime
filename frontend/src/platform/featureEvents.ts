/**
 * Typed, in-process events for narrowly scoped feature coordination.
 *
 * Feature events are intentionally distinct from DOM events: they are not a
 * public browser contract and must be explicitly declared here.
 */
export interface FeatureEventMap {
    'analytics:change': undefined;
    'causal:preselect': { columns: string[] };
    'workflow:refresh': undefined;
}

type FeatureEventName = keyof FeatureEventMap;
type FeatureEventHandler<EventName extends FeatureEventName> = (payload: FeatureEventMap[EventName]) => void;

const handlers = new Map<FeatureEventName, Set<(payload: unknown) => void>>();

export function emitFeatureEvent<EventName extends FeatureEventName>(
    eventName: EventName,
    payload: FeatureEventMap[EventName],
): void {
    for (const handler of handlers.get(eventName) ?? []) handler(payload);
}

export function onFeatureEvent<EventName extends FeatureEventName>(
    eventName: EventName,
    handler: FeatureEventHandler<EventName>,
): () => void {
    let eventHandlers = handlers.get(eventName);
    if (!eventHandlers) {
        eventHandlers = new Set();
        handlers.set(eventName, eventHandlers);
    }

    const untypedHandler = handler as (payload: unknown) => void;
    eventHandlers.add(untypedHandler);
    return () => {
        eventHandlers?.delete(untypedHandler);
        if (eventHandlers?.size === 0) handlers.delete(eventName);
    };
}

export function clearFeatureEventHandlers(): void {
    handlers.clear();
}
