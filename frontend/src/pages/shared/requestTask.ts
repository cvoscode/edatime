/**
 * Shared helper for abortable request lifecycles.
 *
 * Encapsulates the common pattern:
 * - abort-before-new (cancel any in-flight request before starting a new one)
 * - pass AbortSignal to fetch
 * - ignore AbortError (treat as success — no error display)
 * - drive loading state externally
 *
 * Includes a run-token guard: a monotonically increasing token is associated
 * with each `run()` invocation, and only the most recent run() can clear
 * loading state or surface errors. An older, superseded run() whose fetch
 * was aborted by a newer run() must not wipe the newer run's loading state
 * or report a stale error to the user.
 */

export interface RequestTaskOptions {
    setLoading: (loading: boolean) => void;
    onError: (message: string) => void;
}

/**
 * Manages a single in-flight request at a time.
 * Calling `run()` while a previous request is still pending will abort it first.
 */
export function createRequestTask(options: RequestTaskOptions) {
    let controller: AbortController | null = null;
    let latestRunToken = 0;

    return {
        /**
         * Returns the AbortSignal for the current (or latest) request.
         * Returns a never-aborted signal if no request has been started yet.
         */
        getSignal(): AbortSignal {
            if (!controller) {
                // Return a signal that is never aborted when no request is pending.
                const alwaysPass = new AbortController();
                return alwaysPass.signal;
            }
            return controller.signal;
        },

        /**
         * Starts a new request, aborting any previous one first.
         *
         * @param fn - async function that receives the AbortSignal and performs the work.
         *   The function should throw AbortError (or any error whose `name === 'AbortError'`)
         *   when the signal is aborted, so that the helper can distinguish deliberate
         *   cancellation from genuine failures.
         *
         * A run-token guard ensures that an older, aborted run() cannot clear
         * loading state or surface an error for a newer request.
         */
        async run(fn: (signal: AbortSignal) => Promise<void>): Promise<void> {
            // Cancel any in-flight request before starting a new one.
            if (controller) controller.abort();

            controller = new AbortController();
            const signal = controller.signal;
            const runToken = ++latestRunToken;
            const isLatest = () => runToken === latestRunToken;

            options.setLoading(true);
            try {
                await fn(signal);
            } catch (err: unknown) {
                // Swallow AbortError — it only means "cancelled before the next run".
                if (err instanceof Error && err.name === 'AbortError') return;
                // Only surface errors from the latest run; older runs must not
                // mask the newer request's state.
                if (!isLatest()) return;
                const message = err instanceof Error ? err.message : String(err);
                options.onError(message);
            } finally {
                // Only the latest run is allowed to clear loading state.
                if (isLatest()) options.setLoading(false);
            }
        },

        /**
         * Aborts the current in-flight request, if any.
         */
        cancel(): void {
            if (controller) controller.abort();
        },
    };
}
