/** Human-readable message from anything that can be thrown; '' when there is none. */
export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (error === null || error === undefined) return '';
    if (typeof error === 'object') {
        return String((error as { message?: unknown }).message ?? '');
    }
    return String(error);
}

/** True for the DOMException/Error that `fetch` and friends raise when aborted. */
export function isAbortError(error: unknown): boolean {
    return (error instanceof Error || (typeof error === 'object' && error !== null))
        && (error as { name?: unknown }).name === 'AbortError';
}
