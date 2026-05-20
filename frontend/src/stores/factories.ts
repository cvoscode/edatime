/**
 * Typed store factory — creates a consistent store interface for SimpleStore pattern.
 * Used to standardize store behavior across the application.
 */

export interface TypedStore<T extends object> {
    state: T;
    setState: (patch: Partial<T>) => void;
    reset: () => void;
    serialize: () => T;
    deserialize: (data: Partial<T>) => void;
}

/**
 * Creates a typed store with a consistent interface.
 * @param initial - Initial state value
 * @returns Store with state access, setState (shallow merge), reset, serialize, deserialize
 */
export function createTypedStore<T extends object>(initial: T): TypedStore<T> {
    // We use a module-level variable to hold the default for reset
    const defaultState = initial;
    // Use a getter pattern to avoid stale closures for the state
    let currentState: T = { ...initial };

    // For SolidJS store integration, we return a proxy-like object
    // This factory is designed for non-SolidJS stores or for stores that need
    // the fullTypedStore interface. For SolidJS stores, use the factory pattern
    // directly within the store module.
    return {
        get state() { return currentState; },

        setState(patch: Partial<T>) {
            currentState = { ...currentState, ...patch };
        },

        reset() {
            currentState = { ...defaultState };
        },

        serialize(): T {
            return { ...currentState };
        },

        deserialize(data: Partial<T>) {
            currentState = { ...currentState, ...data };
        },
    };
}