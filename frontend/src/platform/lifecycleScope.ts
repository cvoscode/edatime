/**
 * Owns disposable browser resources for one application or feature lifetime.
 *
 * Controllers register listeners, timers, requests, and imperative renderers
 * here instead of keeping independent cleanup arrays. Disposal is idempotent,
 * aborts in-flight work first, and still runs every cleanup if one fails.
 */

export interface LifecycleScope {
    readonly signal: AbortSignal;
    readonly disposed: boolean;
    add(cleanup: () => void): () => void;
    listen(
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
    ): () => void;
    timeout(callback: () => void, delayMs: number): () => void;
    dispose(): void;
}

export function createLifecycleScope(): LifecycleScope {
    const controller = new AbortController();
    const cleanups = new Set<() => void>();
    let disposed = false;

    function add(cleanup: () => void): () => void {
        if (disposed) {
            cleanup();
            return () => {};
        }
        cleanups.add(cleanup);
        return () => cleanups.delete(cleanup);
    }

    function listen(
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
    ): () => void {
        target.addEventListener(type, listener, options);
        return add(() => target.removeEventListener(type, listener, options));
    }

    function timeout(callback: () => void, delayMs: number): () => void {
        const timer = window.setTimeout(() => {
            cleanups.delete(cancel);
            if (!disposed) callback();
        }, delayMs);
        const cancel = () => window.clearTimeout(timer);
        return add(cancel);
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        controller.abort();

        const errors: unknown[] = [];
        for (const cleanup of Array.from(cleanups).reverse()) {
            try {
                cleanup();
            } catch (error) {
                errors.push(error);
            }
        }
        cleanups.clear();
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, 'Lifecycle scope disposal failed');
    }

    return {
        get signal() { return controller.signal; },
        get disposed() { return disposed; },
        add,
        listen,
        timeout,
        dispose,
    };
}
