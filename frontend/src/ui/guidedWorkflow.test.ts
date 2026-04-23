import { describe, expect, it } from 'vitest';
import { buildWorkflowSuggestion, computeWorkflowProgress, type WorkflowSnapshot } from './guidedWorkflow';

function snapshot(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
    return {
        currentPage: 'home',
        hasDataset: false,
        selectedSeriesCount: 0,
        visitedPages: [],
        scatterX: '',
        scatterY: '',
        causalLinkCount: 0,
        ...overrides,
    };
}

describe('computeWorkflowProgress', () => {
    it('starts with upload as the next step when no dataset is loaded', () => {
        const progress = computeWorkflowProgress(snapshot());
        expect(progress.completedStepIds).toEqual([]);
        expect(progress.nextStepId).toBe('upload');
        expect(progress.steps[0]?.status).toBe('current');
    });

    it('marks upload and timeseries complete once a dataset and series selection exist', () => {
        const progress = computeWorkflowProgress(snapshot({ hasDataset: true, selectedSeriesCount: 3 }));
        expect(progress.completedStepIds).toEqual(['upload', 'timeseries']);
        expect(progress.nextStepId).toBe('correlations');
    });

    it('treats heatmap or matrix visits as the correlations step', () => {
        const progress = computeWorkflowProgress(snapshot({
            hasDataset: true,
            selectedSeriesCount: 2,
            visitedPages: ['upload', 'timeseries', 'scattermatrix'],
        }));
        expect(progress.completedStepIds).toContain('correlations');
        expect(progress.nextStepId).toBe('scatter');
    });

    it('marks the full workflow complete when scatter axes and a causal graph exist', () => {
        const progress = computeWorkflowProgress(snapshot({
            currentPage: 'causal',
            hasDataset: true,
            selectedSeriesCount: 2,
            visitedPages: ['upload', 'timeseries', 'heatmap'],
            scatterX: 'HUFL',
            scatterY: 'OT',
            causalLinkCount: 4,
        }));
        expect(progress.completedStepIds).toEqual(['upload', 'timeseries', 'correlations', 'scatter', 'causal']);
        expect(progress.nextStepId).toBeNull();
    });
});

describe('buildWorkflowSuggestion', () => {
    it('guides home users to upload when no dataset exists', () => {
        const suggestion = buildWorkflowSuggestion(snapshot({ currentPage: 'home' }));
        expect(suggestion.actionPage).toBe('upload');
        expect(suggestion.title).toContain('Start');
    });

    it('tells timeseries users without selections to choose a small starting set', () => {
        const suggestion = buildWorkflowSuggestion(snapshot({ currentPage: 'timeseries', hasDataset: true }));
        expect(suggestion.actionPage).toBeNull();
        expect(suggestion.body).toContain('2 to 4');
    });

    it('describes matrix click-through as the scatter drill-down path', () => {
        const suggestion = buildWorkflowSuggestion(snapshot({
            currentPage: 'scattermatrix',
            hasDataset: true,
            selectedSeriesCount: 2,
        }));
        expect(suggestion.actionPage).toBe('scatter');
        expect(suggestion.body).toContain('Click');
    });
});