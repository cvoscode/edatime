/**
 * Service-owned dataset request-scope adapter.
 *
 * The dataset request scope is a monotonically increasing counter that
 * invalidates inflight requests whenever the underlying dataset changes
 * (e.g. after a partial upload). It lives in the API/service layer because
 * it must remain consistent with the in-flight request dedupe cache that
 * `http.ts` uses to coalesce concurrent fetches.
 *
 * Consumers outside the service layer (e.g. dataset bootstrap) capture
 * the scope before issuing a request, assert it is still active after
 * the response lands, and invalidate it whenever a dataset mutation
 * occurs.
 *
 * Public contract (kept stable):
 *   - captureDatasetRequestScope()
 *   - assertDatasetRequestScopeActive(scope)
 *   - invalidateDatasetRequestScope()
 *
 * The state is intentionally not exposed: callers should go through the
 * capture/assert/invalidate functions so the contract is preserved.
 */

let datasetRequestScope = 0;
const inflight = new Map<string, Promise<unknown>>();

function createStaleDatasetError(): Error {
    const error = new Error('Stale response ignored after dataset change');
    error.name = 'AbortError';
    return error;
}

export function captureDatasetRequestScope(): number {
    return datasetRequestScope;
}

export function assertDatasetRequestScopeActive(scope: number): void {
    if (scope !== datasetRequestScope) {
        throw createStaleDatasetError();
    }
}

export function invalidateDatasetRequestScope(): number {
    datasetRequestScope += 1;
    inflight.clear();
    return datasetRequestScope;
}

/**
 * Service-internal: dedupe a request using the shared inflight map.
 * Exposed only so the http layer can share the same scope state.
 */
export function dedupeInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing !== undefined) return existing as Promise<T>;
    const promise = factory().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}

/**
 * Test-only: reset the request scope and inflight cache.
 * Not part of the public contract.
 */
export function __resetDatasetRequestScopeForTests(): void {
    inflight.clear();
    datasetRequestScope = 0;
}
