import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getScatterEmptyStateController,
    syncScatterEmptyState,
    syncScatterFilterBadge,
    getGpuUnavailable,
    setGpuUnavailable,
    getScatterRuntime,
} from './runtime.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const emptyStateUpdateMock = vi.fn();

vi.mock('../ui/emptyState.js', () => ({
    createEmptyStateController: vi.fn(() => ({ update: emptyStateUpdateMock })),
    isRangeOutsideDataset: vi.fn(() => false),
}));

vi.mock('../utils/platform.js', () => ({
    defaultGpuPowerPreference: vi.fn(() => null),
    requestGpuAdapter: vi.fn(async () => null),
}));

vi.mock('./rendering.js', () => ({
    exportScatterPNG: vi.fn(),
    exportScatterSVG: vi.fn(),
    exportScatterHTML: vi.fn(),
    exportScatterData: vi.fn(),
}));

vi.mock('../store/appStateCompat.js', () => ({
    appState: {
        scatter: {
            loading: false,
            chart: null,
            totalPoints: 0,
        },
        metadata: null,
        currentStart: 0,
        currentEnd: 1_000,
        columnRanges: {},
        adaptiveLineFilters: [],
    },
}));

vi.mock('./state.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./state.js')>();
    return {
        ...actual,
        isLinkedBrushEnabled: vi.fn(() => false),
        currentControls: vi.fn(() => ({
            x: 'HUFL',
            y: 'HULL',
            selectedColorColumn: '',
        })),
        getActiveScatterFilterColumns: vi.fn(() => []),
    };
});

// ---------------------------------------------------------------------------
// DOM fixture
// ---------------------------------------------------------------------------

function buildDom(): void {
    document.body.innerHTML = `
        <div id="scatter-empty-state" hidden>
            <h2 id="scatter-empty-title"></h2>
            <p id="scatter-empty-message"></p>
            <button id="scatter-reset-range-btn" hidden>Reset</button>
            <button id="scatter-clear-filters-btn" hidden>Clear filters</button>
        </div>
        <div id="scatter-status"></div>
        <select id="scatter-x-col"><option value="HUFL">HUFL</option></select>
        <select id="scatter-y-col"><option value="HULL">HULL</option></select>
        <span id="scatter-active-filter-badge"></span>
        <div id="scatter-chart"></div>
    `;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getScatterEmptyStateController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildDom();
        // Reset module-level GPU state so it doesn't leak between tests
        setGpuUnavailable(false);
    });

    it('creates and returns an empty state controller with correct config', async () => {
        const controller = getScatterEmptyStateController();
        expect(controller).toBeDefined();
        const { createEmptyStateController } = await import('../ui/emptyState.js');
        expect(createEmptyStateController).toHaveBeenCalledOnce();
        expect(createEmptyStateController).toHaveBeenCalledWith({
            rootId: 'scatter-empty-state',
            titleId: 'scatter-empty-title',
            messageId: 'scatter-empty-message',
            resetButtonId: 'scatter-reset-range-btn',
            clearButtonId: 'scatter-clear-filters-btn',
            resetEventName: 'edatime:request-chart-range-reset',
            clearEventName: 'edatime:clear-all-filters',
            eventSource: 'scatter-empty-state',
        });
    });

    it('returns the same controller on subsequent calls (singleton)', () => {
        const controller1 = getScatterEmptyStateController();
        const controller2 = getScatterEmptyStateController();
        expect(controller1).toBe(controller2);
    });
});

describe('syncScatterFilterBadge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildDom();
    });

    it('hides the badge when no filters are active', () => {
        syncScatterFilterBadge();
        const badge = document.getElementById('scatter-active-filter-badge')!;
        expect(badge.hidden).toBe(true);
        expect(badge.textContent).toBe('');
    });

    it('shows the badge with singular label when one filter is active', async () => {
        const { getActiveScatterFilterColumns } = await import('./state.js');
        (getActiveScatterFilterColumns as ReturnType<typeof vi.fn>).mockReturnValueOnce(['HUFL']);
        syncScatterFilterBadge();
        const badge = document.getElementById('scatter-active-filter-badge')!;
        expect(badge.hidden).toBe(false);
        expect(badge.textContent).toBe('1 filter active');
    });

    it('shows the badge with plural label when multiple filters are active', async () => {
        const { getActiveScatterFilterColumns } = await import('./state.js');
        (getActiveScatterFilterColumns as ReturnType<typeof vi.fn>).mockReturnValueOnce(['HUFL', 'HULL', 'OT']);
        syncScatterFilterBadge();
        const badge = document.getElementById('scatter-active-filter-badge')!;
        expect(badge.hidden).toBe(false);
        expect(badge.textContent).toBe('3 filters active');
        expect(badge.getAttribute('title')).toBe('Active scatter filters: HUFL, HULL, OT');
    });

    it('does nothing when badge element does not exist', () => {
        document.body.innerHTML = '<div id="scatter-x-col"></div>';
        expect(() => syncScatterFilterBadge()).not.toThrow();
    });
});

describe('syncScatterEmptyState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildDom();
        setGpuUnavailable(false);
    });

    it('shows no-columns-selected when axes are not chosen', () => {
        document.getElementById('scatter-x-col')!.innerHTML = '<option value="">--</option>';
        document.getElementById('scatter-y-col')!.innerHTML = '<option value="">--</option>';
        syncScatterEmptyState();
        expect(emptyStateUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                visible: true,
                reason: 'no-columns-selected',
                title: 'Choose scatter axes',
                message: expect.stringContaining('Choose X and Y numeric columns'),
            }),
        );
    });

    it('shows gpu-unavailable when WebGPU is unavailable and no chart exists', () => {
        setGpuUnavailable(true);
        syncScatterEmptyState();
        expect(emptyStateUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                visible: true,
                reason: 'gpu-unavailable',
                title: 'WebGPU unavailable',
            }),
        );
    });

    it('hides empty state when axes are selected and points exist', async () => {
        // Ensure GPU unavailable is reset so this test runs in a clean state
        setGpuUnavailable(false);
        const { appState } = await import('../store/appStateCompat.js');
        appState.scatter.totalPoints = 100;
        appState.scatter.loading = false;
        appState.scatter.chart = {} as any; // chart exists to satisfy the gpu-unavailable guard
        syncScatterEmptyState();
        // visible: false because hasAxes=true and totalPoints > 0 and chart exists
        expect(emptyStateUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                visible: false,
            }),
        );
    });
});

describe('getGpuUnavailable / setGpuUnavailable', () => {
    beforeEach(() => {
        setGpuUnavailable(false);
    });

    it('returns the value set by setGpuUnavailable', () => {
        setGpuUnavailable(true);
        expect(getGpuUnavailable()).toBe(true);
        setGpuUnavailable(false);
        expect(getGpuUnavailable()).toBe(false);
    });
});

describe('getScatterRuntime', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildDom();
    });

    it('returns null before initScatterPageRuntime is called', () => {
        expect(getScatterRuntime()).toBe(null);
    });
});