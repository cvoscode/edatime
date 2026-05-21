/**
 * useDebounce - debounces a value with a configurable delay.
 *
 * Returns a memoized debounced value that only updates after
 * the source value hasn't changed for `delay` ms.
 *
 * @example
 * const debouncedFilter = useDebounce(searchQuery, 300);
 * createEffect(() => {
 *   // Only runs when searchQuery hasn't changed for 300ms
 *   performSearch(debouncedFilter());
 * });
 *
 * @param value - source signal or plain value to debounce
 * @param delay - debounce delay in ms (default 150)
 */
import { createSignal, createEffect, type Accessor } from 'solid-js';

function isAccessor<T>(val: Accessor<T> | T): val is Accessor<T> {
    return typeof val === 'function' && val.length === 0;
}

export function useDebounce<T>(value: Accessor<T> | T, delay = 150): Accessor<T> {
    const [debounced, setDebounced] = createSignal<T>(
        isAccessor(value) ? value() : value as T
    );

    let timer: ReturnType<typeof setTimeout> | null = null;

    createEffect(() => {
        const current = isAccessor(value) ? value() : value as T;

        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            setDebounced(() => current);
        }, delay);
    });

    return debounced;
}
