import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartState } from '../store/chartState.js';
import { datasetState } from '../store/datasetState.js';
import { uiState } from '../store/uiState.js';
import { applySession, captureSession, configureSessionWorkspace, initAutoSave, type SessionSnapshot } from './session.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';

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
        datasetRevision: 1,
        ...partial,
    };
}

describe('session restore safeguards', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.body.innerHTML = '<div class="sidebar"><button class="nav-item" data-page="upload" type="button">upload</button></div>';
        window.location.hash = '';
        chartState.currentStart = null;
        chartState.currentEnd = null;
        datasetState.datasetRevision = 0;
        datasetState.metadata = null;
    });

    afterEach(() => {
        vi.useRealTimers();
        configureSessionWorkspace(null);
    });

    it('clears stale filters when dataset revisions mismatch', () => {
        const snap = buildSnapshot({
            datasetRevision: 2,
            columnRanges: { value: { from: 1, to: 2 } },
            adaptiveLineFilters: [{ column: 'value', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }],
        });

        const workspace = createWorkspaceStore();
        workspace.setFilters({
            columnRanges: { value: { from: 1, to: 2 } },
            adaptiveLines: [{ id: 'old', column: 'value', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }],
        });
        const result = applySession(snap, { workspace, currentDatasetRevision: 7, announceAdjustments: false });

        expect(result.revisionMismatch).toBe(true);
        expect(result.droppedFilterCount).toBe(2);
        expect(workspace.getSnapshot().filters).toEqual({ columnRanges: {}, adaptiveLines: [] });
    });

    it('does not duplicate application settings in a session snapshot', () => {
        const snapshot = captureSession();

        expect(snapshot).not.toHaveProperty('theme');
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
        expect(chartState.currentStart).toBe(1_000);
        expect(chartState.currentEnd).toBe(2_000);
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

    it('drops saved selected columns that are not valid in the current metadata', () => {
        datasetState.metadata = {
            columns: [
                { name: 'ts', dtype: 'datetime[ms]' },
                { name: 'HUFL', dtype: 'f64' },
                { name: 'HULL', dtype: 'f64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            revision: 0,
        } as any;
        const workspace = createWorkspaceStore();
        workspace.setSelection(['HUFL', 'HULL']);

        const snap = buildSnapshot({
            selectedCols: ['temperature', 'humidity'],
            selectedColorColumn: 'temperature',
            datasetRevision: 0,
        });

        applySession(snap, { workspace, announceAdjustments: false });

        expect(workspace.getSnapshot().selection.columns).toEqual(['HUFL', 'HULL']);
        expect(workspace.getSnapshot().selection.colorColumn).toBeNull();
    });

    it('publishes restored analysis intent to the workspace before rendering resumes', () => {
        const workspace = createWorkspaceStore();
        const snapshot = buildSnapshot({
            selectedCols: ['value', 'other'],
            selectedColorColumn: 'bucket',
            columnRanges: { value: { from: 1, to: 2 } },
            adaptiveLineFilters: [{ column: 'value', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }],
            currentStart: 25,
            currentEnd: 75,
        });

        applySession(snapshot, { workspace, announceAdjustments: false });

        expect(workspace.getSnapshot()).toMatchObject({
            selection: { columns: ['value', 'other'], colorColumn: 'bucket' },
            filters: {
                columnRanges: { value: { from: 1, to: 2 } },
                adaptiveLines: [expect.objectContaining({ column: 'value' })],
            },
            viewport: { xMin: 25, xMax: 75, yMin: null, yMax: null },
        });
    });

    it('autosaves after canonical WorkspaceStore changes', async () => {
        vi.useFakeTimers();
        const workspace = createWorkspaceStore();
        configureSessionWorkspace(workspace);
        const dispose = initAutoSave();

        workspace.setFilters({ columnRanges: { value: { from: 1, to: 2 } }, adaptiveLines: [] });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(window.localStorage.getItem('edatime-session')).toContain('"columnRanges"');
        dispose();
    });
});
