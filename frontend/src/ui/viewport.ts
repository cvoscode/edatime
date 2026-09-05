/** Workspace viewport controls and the primary chart's zoom badge. */
import { primaryChart } from '../charts/primaryChart.js';
import { updateAnalysisZoom, updateAnalysisYRange } from './analysisStatus.js';
import { formatZoomRangeBadge } from './zoomRangeBadge.js';
import type { ViewSnapshot } from '../types/chart.js';
import type { WorkspaceStore } from '../contracts/workspace.js';

type ViewportReader = Pick<WorkspaceStore, 'getSnapshot'>;

export function initZoomRangeBadge(workspace: ViewportReader & Pick<WorkspaceStore, 'subscribe'>): () => void {
    const refresh = () => refreshZoomControlsState(workspace);
    const unsubscribeWorkspace = workspace.subscribe(refresh);
    const unsubscribeChart = primaryChart.subscribe(refresh);
    refresh();
    return () => { unsubscribeWorkspace(); unsubscribeChart(); };
}

export function refreshZoomControlsState(workspace: ViewportReader): void {
    const reset = document.getElementById('zoom-reset-btn') as HTMLButtonElement | null;
    if (reset) reset.disabled = !primaryChart.current?.supportsZoomControls?.();
    updateZoomRangeBadge(workspace);
}

export function updateZoomRangeBadge(workspace: ViewportReader): void {
    const badge = document.getElementById('zoom-range-badge');
    if (!badge) return;
    const snapshot = workspace.getSnapshot();
    const range = snapshot.dataset.metadata?.time_range;
    const initial = range ? { xMin: range.min, xMax: range.max, yMin: null, yMax: null } : null;
    badge.textContent = formatZoomRangeBadge(initial, snapshot.viewport?.xMin ?? null, snapshot.viewport?.xMax ?? null);
}

export function getCurrentView(workspace: ViewportReader): ViewSnapshot {
    const viewport = workspace.getSnapshot().viewport;
    const y = primaryChart.current?.getYRange?.();
    return {
        xMin: viewport?.xMin ?? null, xMax: viewport?.xMax ?? null,
        yMin: y?.min ?? viewport?.yMin ?? null, yMax: y?.max ?? viewport?.yMax ?? null,
    };
}

export function applyViewport(
    view: ViewSnapshot,
    fetchAndRender: () => void,
    sourceKind = 'api',
    workspace: Pick<WorkspaceStore, 'setViewport'>,
): void {
    if (view.xMin == null || view.xMax == null) return;
    const start = Number(view.xMin);
    const end = Number(view.xMax);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    workspace.setViewport({ ...view, xMin: start, xMax: end });
    primaryChart.current?.setXRange?.(start, end);
    updateAnalysisZoom(start, end, sourceKind);
    if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax! > view.yMin!) {
        primaryChart.current?.setYRange?.(view.yMin!, view.yMax!);
        updateAnalysisYRange(view.yMin!, view.yMax!, 'restore');
    } else {
        primaryChart.current?.resetYRange?.();
    }
    queueMicrotask(fetchAndRender);
}

/** Standalone toolbar fallback; the Timeseries feature supplies history-aware actions. */
export function resetZoom(fetchAndRender: () => void, workspace: ViewportReader & Pick<WorkspaceStore, 'setViewport'>): void {
    const range = workspace.getSnapshot().dataset.metadata?.time_range;
    if (!range) return;
    applyViewport({ xMin: range.min, xMax: range.max, yMin: null, yMax: null }, fetchAndRender, 'reset', workspace);
}
