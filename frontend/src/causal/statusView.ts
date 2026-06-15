/**
 * causal/statusView — progress overlay, status text, and empty state helpers.
 * Does not own any chart state.
 */

export function setProgress(percent: number, label?: string): void {
    const overlay = (document.getElementById('causal-progress-overlay') || document.getElementById('causal-progress')) as HTMLElement | null;
    const fill = document.getElementById('causal-progress-fill') as HTMLElement | null;
    const text = (document.getElementById('causal-progress-text') || document.getElementById('causal-progress-label')) as HTMLElement | null;
    if (overlay) overlay.hidden = false;
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (text) text.textContent = label ?? `Running… ${percent}%`;
}

export function hideProgress(): void {
    const overlay = (document.getElementById('causal-progress-overlay') || document.getElementById('causal-progress')) as HTMLElement | null;
    if (overlay) overlay.hidden = true;
}

export function setStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    const status = document.getElementById('causal-status') as HTMLElement | null;
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
}

export function syncCausalEmptyState(columnsLength: number): void {
    const empty = document.getElementById('causal-empty-state') as HTMLElement | null;
    if (!empty) return;
    empty.hidden = columnsLength > 0;
    empty.setAttribute('data-empty-reason', columnsLength > 0 ? '' : 'no-columns-selected');
}
