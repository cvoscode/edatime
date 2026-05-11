import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appState } from '../state.js';
import { applySession, type SessionSnapshot } from './session.js';

vi.mock('./toast.js', () => ({
    toast: vi.fn(),
}));

function buildSnapshot(partial: Partial<SessionSnapshot> = {}): SessionSnapshot {
    return {
        version: 1,
        timestamp: Date.now(),
        page: 'upload',
        selectedCols: ['value'],
        seriesColors: {},
        columnRanges: {},
        adaptiveLineFilters: [],
        currentStart: 10,
        currentEnd: 90,
        selectedColorColumn: null,
        chartText: { title: '', xLabel: '', yLabel: '' },
        rollingEnabled: false,
        rollingWindow: 50,
        anomalyEnabled: false,
        anomalyMethod: 'zscore',
        anomalyThreshold: 3,
        scatterX: '',
        scatterY: '',
        scatterColorColumn: '',
        scatterRenderMode: 'density',
        theme: 'dark',
        datasetRevision: 1,
        ...partial,
    };
}

describe('session restore safeguards', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div class="sidebar"><button class="nav-item" data-page="upload" type="button">upload</button></div>';
        window.location.hash = '';
        appState.currentStart = null;
        appState.currentEnd = null;
        appState.columnRanges = {};
        appState.adaptiveLineFilters = [];
        appState.datasetRevision = 0;
        appState.metadata = null;
    });

    it('clears stale filters when dataset revisions mismatch', () => {
        const snap = buildSnapshot({
            datasetRevision: 2,
            columnRanges: { value: { from: 1, to: 2 } },
            adaptiveLineFilters: [{ column: 'value', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }],
        });

        const result = applySession(snap, { currentDatasetRevision: 7, announceAdjustments: false });

        expect(result.revisionMismatch).toBe(true);
        expect(result.droppedFilterCount).toBe(2);
        expect(appState.columnRanges).toEqual({});
        expect(appState.adaptiveLineFilters).toEqual([]);
    });

    it('resets out-of-dataset ranges to metadata bounds', () => {
        const snap = buildSnapshot({ currentStart: 0, currentEnd: 100 });

        const result = applySession(snap, {
            metadataTimeRange: { min: 1_000, max: 2_000 },
            currentDatasetRevision: 1,
            announceAdjustments: false,
        });

        expect(result.rangeAdjusted).toBe(true);
        expect(result.usedMetadataRange).toBe(true);
        expect(appState.currentStart).toBe(1_000);
        expect(appState.currentEnd).toBe(2_000);
    });

    it('prefers hash-based page when requested', () => {
        window.location.hash = '#page=scatter';
        const snap = buildSnapshot({ page: 'upload' });
        const btn = document.querySelector('.sidebar .nav-item[data-page="upload"]') as HTMLButtonElement;
        const clickSpy = vi.spyOn(btn, 'click');

        const result = applySession(snap, { preferHashPage: true, announceAdjustments: false });

        expect(result.navigatedToPage).toBe(false);
        expect(clickSpy).not.toHaveBeenCalled();
    });
});
