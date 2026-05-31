/**
 * causal/statusView — status line and progress overlay helpers.
 * Does not own any chart state.
 */

export function setStatus(text: string): void {
    const statusEl = document.getElementById('causal-status') as HTMLElement | null;
    if (statusEl) statusEl.textContent = text;
}

export function setProgress(percent: number, label?: string): void {
    const overlay = document.getElementById('causal-progress-overlay') as HTMLElement | null;
    const fill = document.getElementById('causal-progress-fill') as HTMLElement | null;
    const text = document.getElementById('causal-progress-text') as HTMLElement | null;
    if (overlay) overlay.hidden = false;
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (text) text.textContent = label ?? `Running… ${percent}%`;
}

export function hideProgress(): void {
    const overlay = document.getElementById('causal-progress-overlay') as HTMLElement | null;
    if (overlay) overlay.hidden = true;
}

export function syncCausalEmptyState(columnsLength: number): void {
    const empty = document.getElementById('causal-empty-state') as HTMLElement | null;
    if (!empty) return;
    empty.hidden = columnsLength > 0;
    empty.setAttribute('data-empty-reason', columnsLength > 0 ? '' : 'no-columns-selected');
}
