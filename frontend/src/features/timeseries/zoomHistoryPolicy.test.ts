import { describe, expect, it } from 'vitest';
import type { ViewSnapshot } from '../../types.js';
import {
    appendZoomRestoreState,
    resolveZoomOutDecision,
    type ZoomRestoreState,
} from './zoomHistoryPolicy.js';

function restoreState(index: number): ZoomRestoreState {
    return {
        view: { xMin: index, xMax: index + 1, yMin: null, yMax: null },
        data: { index },
        fetchedWindow: { start: index, end: index + 1 },
        fetchKey: String(index),
    };
}

describe('timeseries zoom history policy', () => {
    it('snapshots a restore state and retains only the five newest entries', () => {
        let history: ZoomRestoreState[] = [];
        for (let index = 0; index < 6; index++) history = appendZoomRestoreState(history, restoreState(index));

        expect(history.map((entry) => entry.view.xMin)).toEqual([1, 2, 3, 4, 5]);
        const state = restoreState(9);
        const appended = appendZoomRestoreState([], state);
        expect(appended[0]?.view).not.toBe(state.view);
        expect(appended[0]?.fetchedWindow).not.toBe(state.fetchedWindow);
    });

    it('restores the newest state until five consecutive zoom-outs reset the initial view', () => {
        const initialView: ViewSnapshot = { xMin: 0, xMax: 100, yMin: null, yMax: null };
        const history = [restoreState(10), restoreState(20)];

        expect(resolveZoomOutDecision({ history, consecutiveZoomOuts: 0, initialView })).toMatchObject({
            kind: 'restore',
            consecutiveZoomOuts: 1,
            restoreState: history[1],
            history: [history[0]],
        });
        expect(resolveZoomOutDecision({ history, consecutiveZoomOuts: 4, initialView })).toEqual({
            kind: 'reset',
            consecutiveZoomOuts: 0,
            history: [],
        });
    });

    it('keeps its counter when no restore state or initial view exists', () => {
        expect(resolveZoomOutDecision({ history: [], consecutiveZoomOuts: 2, initialView: null })).toEqual({
            kind: 'none',
            consecutiveZoomOuts: 3,
            history: [],
        });
    });
});
