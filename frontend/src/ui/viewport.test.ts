/**
 * Tests for the zoom range badge.
 *
 * Regression: the badge used to stay at the "—" placeholder on initial page
 * load because `setInitialView()` was called after `refreshZoomControlsState()`
 * and the badge was never re-rendered. The bootstrap now calls
 * `refreshZoomControlsState()` again right after capturing the initial view,
 * and the badge should therefore display "Viewing 100%" on a fresh load.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    chartStateMock,
    runtimeStateMock,
    storeHandlers,
    setViewportMock,
    setInitialViewMock,
    setFetchDebounceIdMock,
    setPendingRestoreYMock,
    setPendingYModeMock,
    setZoomHistoryMock,
} = vi.hoisted(() => {
    const handlers: Record<string, Set<(payload: any) => void>> = {};
    return {
        chartStateMock: {
            chart: null as any,
            currentStart: 0 as number | null,
            currentEnd: 100 as number | null,
            initialView: null as any,
            zoomHistory: [] as any[],
            chartText: null as any,
        },
        runtimeStateMock: {
            fetchDebounceId: 0 as any,
        },
        storeHandlers: handlers,
        setViewportMock: vi.fn((start: number | null, end: number | null) => {
            chartStateMock.currentStart = start;
            chartStateMock.currentEnd = end;
            for (const h of handlers['chart:viewport'] ?? []) h({ next: { start, end } });
        }),
        setInitialViewMock: vi.fn((view: any) => {
            chartStateMock.initialView = view;
            for (const h of handlers['chart:initialView'] ?? []) h({ next: view });
        }),
        setFetchDebounceIdMock: vi.fn(),
        setPendingRestoreYMock: vi.fn(),
        setPendingYModeMock: vi.fn(),
        setZoomHistoryMock: vi.fn(),
    };
});

vi.mock('../store/index.js', () => ({
    chartState: chartStateMock,
    runtimeState: runtimeStateMock,
    setFetchDebounceId: setFetchDebounceIdMock,
    setPendingRestoreY: setPendingRestoreYMock,
    setPendingYMode: setPendingYModeMock,
    setViewport: setViewportMock,
    setZoomHistory: setZoomHistoryMock,
    store: {
        subscribe: (event: string, handler: (payload: any) => void) => {
            if (!storeHandlers[event]) storeHandlers[event] = new Set();
            storeHandlers[event].add(handler);
            return () => { storeHandlers[event]?.delete(handler); };
        },
    },
}));

vi.mock('./analysisStatus.js', () => ({
    updateAnalysisZoom: vi.fn(),
    updateAnalysisYRange: vi.fn(),
}));

vi.mock('../debug.js', () => ({
    dbg: vi.fn(),
    dbgGroup: vi.fn((_label: string, fn: () => void) => fn()),
}));

import { updateZoomRangeBadge, refreshZoomControlsState } from './viewport.js';

// Allow the store subscription to be reset between tests by re-importing
// the module under test with a fresh state. vi.resetModules + dynamic import
// would be ideal, but the simpler approach here is to clear the captured
// subscription sets and have refreshZoomControlsState re-install them.
function clearStoreHandlers(): void {
    for (const key of Object.keys(storeHandlers)) {
        storeHandlers[key].clear();
    }
}

function makeBadge(): HTMLSpanElement {
    const span = document.createElement('span');
    span.id = 'zoom-range-badge';
    span.textContent = '—';
    document.body.appendChild(span);
    return span;
}

describe('updateZoomRangeBadge', () => {
    let badge: HTMLSpanElement;

    beforeEach(() => {
        vi.clearAllMocks();
        chartStateMock.currentStart = 0;
        chartStateMock.currentEnd = 100;
        chartStateMock.initialView = null;
        chartStateMock.zoomHistory = [];
        runtimeStateMock.fetchDebounceId = 0;
        badge = makeBadge();
    });

    afterEach(() => {
        badge.remove();
    });

    it('renders the placeholder when initial view has not been captured', () => {
        chartStateMock.currentStart = 0;
        chartStateMock.currentEnd = 100;
        chartStateMock.initialView = null;

        updateZoomRangeBadge();

        expect(badge.textContent).toBe('—');
    });

    it('renders "Viewing 100%" right after the initial view is captured', () => {
        // Simulate: badge was updated to "—" while initialView was still null,
        // then setInitialView() populated the snapshot, then refreshZoomControlsState()
        // was called by the bootstrap. The badge should now show 100%.
        chartStateMock.currentStart = 0;
        chartStateMock.currentEnd = 100;
        chartStateMock.initialView = { xMin: 0, xMax: 100, yMin: null, yMax: null };

        refreshZoomControlsState();

        expect(badge.textContent).toBe('Viewing 100%');
    });

    it('auto-updates when the chart viewport changes (zoom-in interaction)', () => {
        // Regression: a chart zoom-in (e.g. mouse wheel / selection zoom)
        // mutates chartState.currentStart/currentEnd via setViewport(). The
        // badge must update on its own without anyone calling
        // refreshZoomControlsState() — this is the path that the
        // timeseries page onZoomRangeChange uses.
        chartStateMock.currentStart = 0;
        chartStateMock.currentEnd = 100;
        chartStateMock.initialView = { xMin: 0, xMax: 100, yMin: null, yMax: null };

        // Bootstrap calls refreshZoomControlsState once to wire the
        // subscription and render the initial 100%.
        refreshZoomControlsState();
        expect(badge.textContent).toBe('Viewing 100%');

        // Now the user drags a zoom box on the chart. The chart forwards
        // a new view, the page controller calls setViewport(), and the
        // store event listener re-renders the badge.
        setViewportMock(25, 75);

        expect(badge.textContent).toBe('Viewing 50%');
    });

    it('auto-updates when the initial view changes', () => {
        // E.g. a dataset reload sets a new initialView. The badge should
        // re-render even if the viewport is unchanged.
        chartStateMock.currentStart = 0;
        chartStateMock.currentEnd = 100;
        chartStateMock.initialView = { xMin: 0, xMax: 100, yMin: null, yMax: null };

        refreshZoomControlsState();
        expect(badge.textContent).toBe('Viewing 100%');

        // Simulate dataset reload with a smaller range.
        chartStateMock.currentStart = 50;
        chartStateMock.currentEnd = 100;
        setInitialViewMock({ xMin: 50, xMax: 100, yMin: null, yMax: null });

        expect(badge.textContent).toBe('Viewing 100%');
    });
});
