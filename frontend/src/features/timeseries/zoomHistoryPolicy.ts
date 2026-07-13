import type { ViewSnapshot } from '../../types/chart.js';

const MAX_ZOOM_RESTORE_STATES = 5;
const CONSECUTIVE_ZOOM_OUT_RESET_COUNT = 5;

export interface ZoomRestoreState {
    view: ViewSnapshot;
    data: unknown | null;
    fetchedWindow: { start: number; end: number } | null;
    fetchKey: string | null;
}

export function appendZoomRestoreState(
    history: readonly ZoomRestoreState[],
    state: ZoomRestoreState,
): ZoomRestoreState[] {
    return [
        ...history,
        {
            ...state,
            view: { ...state.view },
            fetchedWindow: state.fetchedWindow ? { ...state.fetchedWindow } : null,
        },
    ].slice(-MAX_ZOOM_RESTORE_STATES);
}

export type ZoomOutDecision =
    | { kind: 'reset'; consecutiveZoomOuts: 0; history: ZoomRestoreState[] }
    | { kind: 'restore'; consecutiveZoomOuts: number; history: ZoomRestoreState[]; restoreState: ZoomRestoreState }
    | { kind: 'none'; consecutiveZoomOuts: number; history: ZoomRestoreState[] };

export function resolveZoomOutDecision(input: {
    history: readonly ZoomRestoreState[];
    consecutiveZoomOuts: number;
    initialView: ViewSnapshot | null;
}): ZoomOutDecision {
    const consecutiveZoomOuts = input.consecutiveZoomOuts + 1;
    if (consecutiveZoomOuts >= CONSECUTIVE_ZOOM_OUT_RESET_COUNT && input.initialView) {
        return { kind: 'reset', consecutiveZoomOuts: 0, history: [] };
    }

    const restoreState = input.history.at(-1);
    if (!restoreState) return { kind: 'none', consecutiveZoomOuts, history: [...input.history] };
    return {
        kind: 'restore',
        consecutiveZoomOuts,
        history: input.history.slice(0, -1),
        restoreState,
    };
}
