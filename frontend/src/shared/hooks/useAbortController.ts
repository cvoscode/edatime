/**
 * useAbortController — creates a reusable AbortController with restart capability.
 *
 * Returns a signal-based abort controller pair:
 * - signal: Accessor<AbortSignal> — current signal, updates on restart
 * - abort: () => void — abort the current request
 * - restart: () => AbortSignal — aborts previous and returns fresh signal
 *
 * @example
 * const { signal, abort, restart } = useAbortController();
 * const data = await fetch(url, { signal: signal() });
 * // On viewport change:
 * restart();
 * const newData = await fetch(url, { signal: signal() });
 */
import { createSignal, Accessor } from 'solid-js';

export interface AbortControllerResult {
    /** Current AbortSignal — may change after restart() */
    signal: Accessor<AbortSignal>;
    /** Abort the current request without restarting */
    abort: () => void;
    /**
     * Abort any previous request and return a fresh AbortSignal.
     * Safe to call multiple times — only the most recent signal is live.
     */
    restart: () => AbortSignal;
}

export function useAbortController(): AbortControllerResult {
    const [controller, setController] = createSignal<AbortController>(new AbortController());

    const abort = () => controller().abort();

    const restart = () => {
        controller().abort();
        const fresh = new AbortController();
        setController(fresh);
        return fresh.signal;
    };

    return {
        signal: () => controller().signal,
        abort,
        restart,
    };
}