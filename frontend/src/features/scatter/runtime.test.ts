import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartState } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import { scatterState } from '../../store/scatterState.js';
import { configureScatterRuntime } from './runtime.js';
import {
    disposeScatterPageRuntime,
    getScatterEmptyStateController,
    syncScatterEmptyState,
    syncScatterFilterBadge,
    getGpuUnavailable,
    setGpuUnavailable,
    getScatterRuntime,
    initScatterPageRuntime,
} from './runtime.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const emptyStateUpdateMock = vi.fn();

vi.mock('../../ui/emptyState.js', () => ({
    createEmptyStateController: vi.fn(() => ({ update: emptyStateUpdateMock, dispose: vi.fn() })),
    isRangeOutsideDataset: vi.fn(() => false),
}));

vi.mock('../../utils/platform.js', () => ({
    defaultGpuPowerPreference: vi.fn(() => null),
    requestGpuAdapter: vi.fn(async () => null),
}));

vi.mock('./rendering.js', () => ({
    exportScatterPNG: vi.fn(),
    exportScatterSVG: vi.fn(),
    exportScatterHTML: vi.fn(),
    exportScatterData: vi.fn(),
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
        <div id="scatter-filter-banner" hidden>
            <span id="scatter-filter-banner-text"></span>
            <button id="scatter-filter-banner-clear" type="button">Clear all</button>
        </div>
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
        chartState.currentStart = 0;
        chartState.currentEnd = 1_000;
        datasetState.metadata = null;
        configureScatterRuntime(null);
        scatterState.loading = false;
        scatterState.chart = null;
        scatterState.totalPoints = 0;
        // Reset module-level GPU state so it doesn't leak between tests
        setGpuUnavailable(false);
    });

    it('creates and returns an empty state controller with correct config', async () => {
        const controller = getScatterEmptyStateController();
        expect(controller).toBeDefined();
        const { createEmptyStateController } = await import('../../ui/emptyState.js');
        expect(createEmptyStateController).toHaveBeenCalledOnce();
        expect(createEmptyStateController).toHaveBeenCalledWith({
            rootId: 'scatter-empty-state',
            titleId: 'scatter-empty-title',
            messageId: 'scatter-empty-message',
            resetButtonId: 'scatter-reset-range-btn',
            clearButtonId: 'scatter-clear-filters-btn',
            onReset: expect.any(Function),
            onClear: expect.any(Function),
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

    it('shows the inherited-filter banner even when points exist', async () => {
        const { getActiveScatterFilterColumns } = await import('./state.js');
        (getActiveScatterFilterColumns as ReturnType<typeof vi.fn>).mockReturnValue(['HUFL']);
        scatterState.totalPoints = 42;
        configureScatterRuntime({
            getSnapshot: () => ({
                filters: { columnRanges: {}, adaptiveLines: [{ column: 'OT' }] },
                viewport: { xMin: 0, xMax: 1_000, yMin: null, yMax: null },
            }),
        } as any);

        syncScatterEmptyState();

        const banner = document.getElementById('scatter-filter-banner') as HTMLElement;
        const text = document.getElementById('scatter-filter-banner-text') as HTMLElement;
        expect(banner.hidden).toBe(false);
        expect(text.textContent).toContain('Timeseries filters carry over');
        expect(text.textContent).toContain('zoom range');
        expect(text.textContent).toContain('1 column filter');
        expect(text.textContent).toContain('1 adaptive filter');
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
        scatterState.totalPoints = 100;
        scatterState.loading = false;
        scatterState.chart = {} as any; // chart exists to satisfy the gpu-unavailable guard
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
        disposeScatterPageRuntime();
    });

    afterEach(() => {
        disposeScatterPageRuntime();
    });

    it('returns null before initScatterPageRuntime is called', () => {
        expect(getScatterRuntime()).toBe(null);
    });

    it('mounts one page lifecycle and disposes it cleanly', () => {
        const addListener = vi.spyOn(window, 'addEventListener');
        const removeListener = vi.spyOn(window, 'removeEventListener');

        const first = initScatterPageRuntime();
        const second = initScatterPageRuntime();

        expect(second).toBe(first);
        expect(addListener).toHaveBeenCalledWith(
            'edatime:page-change',
            expect.any(Function),
            undefined,
        );

        disposeScatterPageRuntime();

        expect(getScatterRuntime()).toBe(null);
        expect(removeListener).toHaveBeenCalledWith(
            'edatime:page-change',
            expect.any(Function),
            undefined,
        );
    });
});
