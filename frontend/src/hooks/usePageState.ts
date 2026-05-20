/**
 * usePageState — reusable UI state wrapper for page components.
 *
 * Replaces the common pattern:
 *   const [isLoading, setIsLoading] = createSignal(false);
 *   const [error, setError] = createSignal<string | null>(null);
 *   // plus various modal/view mode signals...
 *
 * with a single unified store that supports loading/error tracking and
 * convenient async wrappers.
 */
import { createStore } from 'solid-js/store';
import type { SetStoreFunction } from 'solid-js/store';

// Private tracking fields merged into the user state.
interface PrivateFields {
    _loading: boolean;
    _error: string | null;
}

/**
 * Creates a page state store with loading/error tracking and async helpers.
 * @param initial - Initial state values (excluding private `_loading` / `_error` fields)
 */
export function usePageState<T extends object>(initial: T) {
    type State = T & PrivateFields;

    const [state, setState]: [State, SetStoreFunction<State>] = createStore<State>({
        ...initial,
        _loading: false,
        _error: null,
    } as State);

    const withLoading = async <R>(fn: () => Promise<R>): Promise<R | undefined> => {
        setState((s) => ({ ...s, _loading: true }));
        try {
            return await fn();
        } finally {
            setState((s) => ({ ...s, _loading: false }));
        }
    };

    const withError = async <R>(
        fn: () => Promise<R>,
        onError?: (e: unknown) => void
    ): Promise<R | undefined> => {
        try {
            return await fn();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setState((s) => ({ ...s, _error: msg }));
            onError?.(e);
            return undefined;
        }
    };

    const withLoadingAndError = async <R>(fn: () => Promise<R>): Promise<R | undefined> => {
        return withLoading(() => withError(fn));
    };

    const reset = () => {
        setState({
            ...initial,
            _loading: false,
            _error: null,
        } as State);
    };

    const serialize = (): T => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _loading: _l, _error: _e, ...pub } = state;
        return pub as T;
    };

    const deserialize = (data: Partial<T>) => {
        setState((s) => ({ ...s, ...data } as State));
    };

    return {
        get state() {
            return state as Readonly<T>;
        },
        setState: (patch: Partial<T>) => setState((s) => ({ ...s, ...patch } as State)),
        reset,
        withLoading,
        withError,
        withLoadingAndError,
        serialize,
        deserialize,
    };
}

export type PageState<T extends object> = ReturnType<typeof usePageState<T>>;