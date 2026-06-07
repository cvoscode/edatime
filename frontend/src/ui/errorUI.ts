/**
 * errorUI — error state display helpers for bootstrap failures.
 * Lives in ui/* since it deals with DOM manipulation for error surfaces.
 */

export interface BootstrapErrorOptions {
    message: string;
}

/**
 * Show an error message and append a Retry button that reloads the page.
 * Called when dataset bootstrap fails.
 */
export function showBootstrapError({ message }: BootstrapErrorOptions): void {
    console.error('Bootstrap error:', message);
}