/**
 * causal/statusView — status toasts, progress overlay, and empty state helpers.
 * Does not own any chart state.
 *
 * The page previously had a dedicated status line and a separate progress bar.
 * Status text is now surfaced as toast notifications; the progress indicator is
 * rendered as an overlay (the same `causal-loading` element that also blocks
 * user interaction during compute).
 */

import { toast, type ToastKind } from '../utils/toast.js';

const PROGRESS_OVERLAY_ID = 'causal-loading';
const PROGRESS_LABEL_ID = 'causal-progress-label';
let dismissActiveStatusToast: (() => void) | null = null;

window.addEventListener('edatime:page-change', (event: Event) => {
    const page = (event as CustomEvent<{ page?: string }>).detail?.page;
    if (page === 'causal') return;
    dismissActiveStatusToast?.();
    dismissActiveStatusToast = null;
});

function progressOverlay(): HTMLElement | null {
    return document.getElementById(PROGRESS_OVERLAY_ID);
}

function progressLabel(): HTMLElement | null {
    return (
        document.getElementById(PROGRESS_LABEL_ID) ||
        progressOverlay()?.querySelector<HTMLElement>('.chart-loading-label') ||
        null
    );
}

/** Show the progress overlay and update its label. Percent is currently
 *  accepted for backward compatibility but not rendered — the spinner is
 *  indeterminate while compute is in flight. */
export function setProgress(percent: number, label?: string): void {
    const overlay = progressOverlay();
    const text = progressLabel();
    if (overlay) overlay.hidden = false;
    if (text) {
        const pct = Math.round(Math.min(100, Math.max(0, percent)));
        text.textContent = label ? `${label} (${pct}%)` : `Running… ${pct}%`;
    }
}

export function hideProgress(): void {
    const overlay = progressOverlay();
    if (overlay) overlay.hidden = true;
    const text = progressLabel();
    if (text) text.textContent = 'Running causal discovery…';
}

export function setStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    const kind: ToastKind = tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'info';
    // Success and info messages get the standard auto-dismiss; errors are
    // sticky so the user can read them.
    const opts = tone === 'error' ? { duration: 0 } : {};
    dismissActiveStatusToast?.();
    dismissActiveStatusToast = toast(message, kind, opts);
}

export function syncCausalEmptyState(columnsLength: number): void {
    const empty = document.getElementById('causal-empty-state') as HTMLElement | null;
    if (!empty) return;
    empty.hidden = columnsLength >= 2;
    empty.setAttribute('data-empty-reason', columnsLength >= 2 ? '' : 'no-columns-selected');
}
