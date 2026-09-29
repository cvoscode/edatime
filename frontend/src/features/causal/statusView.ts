/**
 * causal/statusView — status toasts, progress overlay, and empty state helpers.
 * Does not own any chart state.
 *
 * The page previously had a dedicated status line and a separate progress bar.
 * Status text is now surfaced as toast notifications; the progress indicator is
 * rendered as an overlay (the same `causal-loading` element that also blocks
 * user interaction during compute).
 */

import { toast, type ToastKind } from '../../utils/toast.js';
import { onNavigationChange } from '../../platform/navigationEvents.js';

const PROGRESS_OVERLAY_ID = 'causal-loading';
const PROGRESS_LABEL_ID = 'causal-progress-label';
let dismissActiveStatusToast: (() => void) | null = null;
let disposeStatusLifecycle: (() => void) | null = null;
let progressStartedAt = 0;
let progressTimer: number | undefined;
let progressStage = 'Running causal discovery';

/** Bind the Causal status lifecycle once for the active feature instance. */
export function initCausalStatusLifecycle(): void {
    if (disposeStatusLifecycle) return;
    const unsubscribeNavigation = onNavigationChange(({ page }) => {
        if (page === 'causal') return;
        dismissActiveStatusToast?.();
        dismissActiveStatusToast = null;
    });
    disposeStatusLifecycle = () => {
        unsubscribeNavigation();
        dismissActiveStatusToast?.();
        dismissActiveStatusToast = null;
        disposeStatusLifecycle = null;
    };
}

/** Release the page-change listener and any active status toast. */
export function disposeCausalStatusLifecycle(): void {
    disposeStatusLifecycle?.();
}

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

/** Show truthful stage text and elapsed time beside the indeterminate spinner. */
export function setProgress(stage = 'Running causal discovery'): void {
    const overlay = progressOverlay();
    if (!overlay) return;
    if (overlay.hidden || !progressStartedAt) progressStartedAt = performance.now();
    progressStage = stage;
    overlay.hidden = false;
    const update = () => {
        const text = progressLabel();
        if (!text) return;
        const elapsed = Math.max(0, Math.floor((performance.now() - progressStartedAt) / 1000));
        text.textContent = `${progressStage} · ${elapsed}s elapsed`;
    };
    update();
    if (progressTimer === undefined) progressTimer = window.setInterval(update, 1000);
}

export function hideProgress(): void {
    const overlay = progressOverlay();
    if (overlay) overlay.hidden = true;
    if (progressTimer !== undefined) window.clearInterval(progressTimer);
    progressTimer = undefined;
    const text = progressLabel();
    if (text) text.textContent = 'Running causal discovery…';
    progressStartedAt = 0;
    progressStage = 'Running causal discovery';
}

export function setStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    const kind: ToastKind = tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'info';
    // Success and info messages get the standard auto-dismiss; errors are
    // sticky so the user can read them.
    const opts = tone === 'error' ? { duration: 0 } : {};
    dismissActiveStatusToast?.();
    dismissActiveStatusToast = toast(message, kind, opts);
}

export function syncCausalEmptyState(columnsLength: number, hasGraph = false): void {
    const empty = document.getElementById('causal-empty-state') as HTMLElement | null;
    if (!empty) return;
    const title = empty.querySelector('strong');
    const detail = empty.querySelector('span');
    if (!hasGraph) {
        if (columnsLength >= 2) {
            if (title) title.textContent = 'Ready to discover lag relationships';
            if (detail) detail.textContent = 'Run discovery to estimate directional links, lags, and significance between the selected numeric series.';
        } else {
            if (title) title.textContent = 'Choose at least two numeric series';
            if (detail) detail.textContent = 'Select series above, then run discovery to build a directional lag graph.';
        }
    }
    empty.hidden = hasGraph;
    empty.setAttribute('data-empty-reason', hasGraph ? '' : columnsLength >= 2 ? 'ready' : 'no-columns-selected');
}

/** Replace a silent blank chart with an actionable, data-backed fallback. */
export function showCausalGraphRenderFailure(nodeCount: number, edgeCount: number): void {
    const empty = document.getElementById('causal-empty-state') as HTMLElement | null;
    if (!empty) return;
    const title = empty.querySelector('strong');
    const detail = empty.querySelector('span');
    if (title) title.textContent = 'Causal graph could not be displayed';
    if (detail) {
        detail.textContent = `Discovery returned ${nodeCount} nodes and ${edgeCount} links. Resize or revisit the page, then run discovery again.`;
    }
    empty.hidden = false;
    empty.dataset.emptyReason = 'render-failed';
}
