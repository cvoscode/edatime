import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkflowSuggestion, computeWorkflowProgress, type WorkflowSnapshot } from './guidedWorkflow';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';
import { emitNavigationChange } from '../../platform/navigationEvents.js';

function workflowDeps(metadata: unknown = null, columns: string[] = []) {
    return {
        workspace: {
            getSnapshot: () => makeWorkspaceSnapshot({
                dataset: { metadata: metadata as any, revision: 1 },
                selection: { columns },
            }),
            subscribe: vi.fn(() => vi.fn()),
        },
        registerCleanup: vi.fn(),
    };
}

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

        initGuidedWorkflow(workflowDeps());
        expect(document.getElementById('workflow-panel')?.textContent).toContain('Open Upload');

        const home = document.querySelector('.sidebar .nav-item[data-page="home"]') as HTMLButtonElement;
        const timeseries = document.querySelector('.sidebar .nav-item[data-page="timeseries"]') as HTMLButtonElement;
        home.classList.remove('active');
        timeseries.classList.add('active');
        emitNavigationChange({ page: 'timeseries', navPage: 'timeseries' });

        expect(document.getElementById('workflow-panel')?.textContent).toContain('Open Upload');

        await vi.advanceTimersByTimeAsync(50);

        expect(document.getElementById('workflow-panel')?.hidden).toBe(true);
    });

    it('renders workflow step crumbs with the styled class contract', async () => {
        const { renderGuidedWorkflow } = await import('./guidedWorkflow.js');

        renderGuidedWorkflow();

        const uploadStep = document.querySelector<HTMLElement>('[data-workflow-page="upload"]');
        expect(uploadStep?.classList.contains('workflow-step')).toBe(true);
        expect(uploadStep?.classList.contains('workflow-step--current')).toBe(true);
        expect(document.querySelector('.workflow_step')).toBeNull();
    });

    it('releases its workspace subscription through the shell cleanup hook', async () => {
        vi.resetModules();
        const unsubscribe = vi.fn();
        const deps = workflowDeps();
        deps.workspace.subscribe.mockReturnValue(unsubscribe);
        const { initGuidedWorkflow } = await import('./guidedWorkflow.js');

        initGuidedWorkflow(deps);
        expect(deps.workspace.subscribe).toHaveBeenCalledTimes(1);
        expect(deps.registerCleanup).toHaveBeenCalledTimes(1);

        const cleanup = deps.registerCleanup.mock.calls[0]?.[0] as (() => void);
        cleanup();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('keeps the workflow controller internal instead of publishing a window API', async () => {
        vi.resetModules();
        const deps = workflowDeps();
        const { initGuidedWorkflow } = await import('./guidedWorkflow.js');

        initGuidedWorkflow(deps);
        expect((window as any).__edatime?.guidedWorkflow).toBeUndefined();

        const cleanup = deps.registerCleanup.mock.calls[0]?.[0] as (() => void);
        cleanup();
        expect((window as any).__edatime?.guidedWorkflow).toBeUndefined();
    });

    it('uses dataset-scoped workflow history when rendering compact mode', async () => {
        vi.resetModules();

        const metadata = {
            total_rows: 69_680,
            time_column: 'date',
            time_range: { min: 1, max: 2 },
            numeric_columns: ['HUFL', 'HULL', 'OT'],
        };

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
            visitedPagesByDataset: {
                '1:69680:date:1:2:HUFL|HULL|OT': ['home', 'timeseries', 'correlations'],
            },
        }));

        const { initGuidedWorkflow } = await import('./guidedWorkflow.js');
        initGuidedWorkflow(workflowDeps(metadata, ['HUFL', 'HULL', 'OT']));

        expect(document.getElementById('workflow-panel')?.textContent).not.toContain('completed');
        expect(document.getElementById('workflow-panel')?.classList.contains('workflow-panel--compact-shell')).toBe(true);
    });

    it('does not apply retired unscoped visit history to the current dataset', async () => {
        vi.resetModules();

        const metadata = {
            total_rows: 69_680,
            time_column: 'date',
            time_range: { min: 1, max: 2 },
            numeric_columns: ['HUFL', 'HULL', 'OT'],
        };

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

        const { initGuidedWorkflow } = await import('./guidedWorkflow.js');
        initGuidedWorkflow(workflowDeps(metadata, ['HUFL', 'HULL', 'OT']));

        expect(document.getElementById('workflow-panel')?.classList.contains('workflow-panel--compact-shell')).toBe(false);
    });

    it('refreshes workflow presentation after session restoration', async () => {
        vi.resetModules();
        const { initGuidedWorkflow } = await import('./guidedWorkflow.js');
        const { emitFeatureEvent } = await import('../../platform/featureEvents.js');
        const deps = workflowDeps();
        initGuidedWorkflow(deps);
        const panel = document.getElementById('workflow-panel') as HTMLElement;
        panel.textContent = 'stale workflow';

        emitFeatureEvent('session:restored', undefined);
        await vi.advanceTimersByTimeAsync(50);

        expect(panel.textContent).toContain('Open Upload');
        const cleanup = deps.registerCleanup.mock.calls[0]?.[0] as (() => void);
        cleanup();
    });
});
