/**
 * Viewport sync hook — debounced viewport synchronization.
 * Consolidates the viewport debounce timer pattern used in chart pages.
 */
import { createEffect, onCleanup } from 'solid-js';
import { chartStore } from '../stores/chartStore';

/**
 * Options for useViewportSync()
 */
export interface ViewportSyncOptions {
    /** Debounce delay in ms. Default: 150 */
    debounceMs?: number;
    /** Callback fired after debounce. Receives (viewport) */
    onDebouncedSync?: (viewport: { xMin: number; xMax: number; yMin?: number; yMax?: number }) => void;
    /** Callback fired immediately on viewport change (before debounce) */
    onImmediateSync?: (viewport: { xMin: number; xMax: number; yMin?: number; yMax?: number }) => void;
    /** Additional condition to check before syncing. Default: always true */
    shouldSync?: () => boolean;
}

/**
 * Synchronizes chart viewport changes with debouncing.
 * Automatically cleans up timer on unmount.
 * 
 * Usage:
 *   const { stopSync, restartSync } = useViewportSync({
 *     onDebouncedSync: (vp) => fetchAndRender(vp),
 *   });
 */
export function useViewportSync(options: ViewportSyncOptions = {}) {
    const {
        debounceMs = 150,
        onDebouncedSync,
        onImmediateSync,
        shouldSync = () => true,
    } = options;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const stopSync = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const restartSync = () => {
        stopSync();
        const viewport = chartStore.state.viewport;
        if (shouldSync() && viewport) {
            timer = setTimeout(() => {
                onDebouncedSync?.(viewport);
            }, debounceMs);
        }
    };

    const triggerImmediateSync = () => {
        const viewport = chartStore.state.viewport;
        if (shouldSync() && viewport) {
            onImmediateSync?.(viewport);
        }
    };

    // Watch for viewport changes and trigger debounced sync
    createEffect(() => {
        const viewport = chartStore.state.viewport;
        if (!viewport || !shouldSync()) return;

        stopSync();
        timer = setTimeout(() => {
            onDebouncedSync?.(viewport);
        }, debounceMs);
    });

    // Cleanup on unmount
    onCleanup(() => {
        stopSync();
    });

    return { stopSync, restartSync, triggerImmediateSync };
}

/**
 * Creates a timer-based debouncer.
 * Useful for deferring expensive operations.
 * 
 * @param fn - Function to debounce
 * @param delayMs - Delay in ms
 * @returns { debounce, cancel, flush }
 */
export function useDebouncer<T extends (...args: any[]) => void>(
    fn: T,
    delayMs = 150
) {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const debounce = (...args: Parameters<T>) => {
        cancel();
        timer = setTimeout(() => {
            fn(...args);
            timer = null;
        }, delayMs);
    };

    const flush = () => {
        if (timer) {
            clearTimeout(timer);
            fn();
            timer = null;
        }
    };

    return { debounce, cancel, flush };
}