/**
 * errorUI — error state display helpers for bootstrap failures.
 * Lives in ui/* since it deals with DOM manipulation for error surfaces.
 */

import { setMetaText } from './metaBar.js';

export interface BootstrapErrorOptions {
    message: string;
    metaBarSelector?: string;
}

/**
 * Show an error message in the meta bar and append a Retry button
 * that reloads the page. Called when dataset bootstrap fails.
 */
export function showBootstrapError({ message, metaBarSelector = '.meta-bar' }: BootstrapErrorOptions): void {
    setMetaText('Error: ' + message);

    const existingRetry = document.getElementById('bootstrap-retry-btn');
    if (existingRetry) return;

    const metaEl = document.querySelector(metaBarSelector);
    if (!metaEl) return;

    const btn = document.createElement('button');
    btn.id = 'bootstrap-retry-btn';
    btn.className = 'btn btn-ghost btn-sm';
    btn.style.marginLeft = '8px';
    btn.textContent = 'Retry';
    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Retrying…';
        setMetaText('Reinitializing…');
        location.reload();
    });
    metaEl.appendChild(btn);
}