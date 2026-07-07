import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
            visitedPages: ['upload', 'timeseries', 'correlations'],
        }));
        expect(progress.completedStepIds).toContain('correlations');
        expect(progress.nextStepId).toBe('scatter');
    });

    it('marks the full workflow complete when scatter axes and a causal graph exist', () => {
        const progress = computeWorkflowProgress(snapshot({
            currentPage: 'causal',
            hasDataset: true,
            selectedSeriesCount: 2,
            visitedPages: ['upload', 'timeseries', 'correlations'],
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

    it('hides the workflow prompt on side-analysis pages once the core path is underway', () => {
        const suggestion = buildWorkflowSuggestion(snapshot({
            currentPage: 'fft',
            hasDataset: true,
            selectedSeriesCount: 2,
            visitedPages: ['upload', 'timeseries', 'correlations'],
            scatterX: 'HUFL',
            scatterY: 'OT',
        }));
        expect(suggestion.actionPage).toBeNull();
        expect(suggestion.actionLabel).toBeNull();
        expect(suggestion.body).toBe('');
    });

    it('hides the workflow prompt on drift as well', () => {
        const suggestion = buildWorkflowSuggestion(snapshot({
            currentPage: 'drift',
            hasDataset: true,
            selectedSeriesCount: 2,
            visitedPages: ['upload', 'timeseries', 'correlations'],
            scatterX: 'HUFL',
            scatterY: 'OT',
        }));
        expect(suggestion.actionPage).toBeNull();
        expect(suggestion.actionLabel).toBeNull();
        expect(suggestion.body).toBe('');
    });
});

describe('initGuidedWorkflow', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        window.localStorage.clear();
        document.body.innerHTML = `
            <nav class="sidebar">
                <button class="nav-item active" data-page="home" type="button">Home</button>
                <button class="nav-item" data-page="timeseries" type="button">Timeseries</button>
            </nav>
            <button id="workflow-toggle-btn" type="button"></button>
            <section id="workflow-panel"></section>
        `;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('delays workflow panel updates on page-change so stale copy does not flash through', async () => {
        const { initGuidedWorkflow } = await import('./guidedWorkflow.js');

        initGuidedWorkflow();
        expect(document.getElementById('workflow-panel')?.textContent).toContain('Open Upload');

        const home = document.querySelector('.sidebar .nav-item[data-page="home"]') as HTMLButtonElement;
        const timeseries = document.querySelector('.sidebar .nav-item[data-page="timeseries"]') as HTMLButtonElement;
        home.classList.remove('active');
        timeseries.classList.add('active');
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'timeseries', navPage: 'timeseries' } }));

        expect(document.getElementById('workflow-panel')?.textContent).toContain('Open Upload');

        await vi.advanceTimersByTimeAsync(50);

        expect(document.getElementById('workflow-panel')?.hidden).toBe(true);
    });

    it('omits the automatic completed-count summary in compact mode', async () => {
        vi.resetModules();

        const { appState } = await import('../store/index.js');
        appState.metadata = {
            total_rows: 69_680,
            time_column: 'date',
            time_range: { min: 1, max: 2 },
            numeric_columns: ['HUFL', 'HULL', 'OT'],
        } as any;
        appState.selectedCols = ['HUFL', 'HULL', 'OT'];

        document.body.innerHTML = `
            <nav class="sidebar">
                <button class="nav-item" data-page="home" type="button">Home</button>
                <button class="nav-item active" data-page="scatter" type="button">Scatter</button>
            </nav>
            <button id="workflow-toggle-btn" type="button"></button>
            <section id="workflow-panel"></section>
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="OT" selected>OT</option></select>
        `;
        window.localStorage.setItem('edatime-guided-workflow', JSON.stringify({
            enabled: true,
            visitedPages: ['home', 'timeseries', 'correlations'],
        }));

        const { renderGuidedWorkflow } = await import('./guidedWorkflow.js');
        renderGuidedWorkflow();

        expect(document.getElementById('workflow-panel')?.textContent).not.toContain('completed');
        expect(document.getElementById('workflow-panel')?.classList.contains('workflow-panel--compact-shell')).toBe(true);
    });
});
