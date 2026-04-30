import { appState } from '../state.js';
import { toast } from '../utils/toast.js';

export type WorkflowStepId = 'upload' | 'timeseries' | 'correlations' | 'scatter' | 'causal';

export interface WorkflowSnapshot {
    currentPage: string;
    hasDataset: boolean;
    selectedSeriesCount: number;
    visitedPages: string[];
    scatterX: string;
    scatterY: string;
    causalLinkCount: number;
}

export interface WorkflowStepState {
    id: WorkflowStepId;
    label: string;
    page: string;
    status: 'done' | 'current' | 'next' | 'pending';
}

export interface WorkflowProgress {
    steps: WorkflowStepState[];
    completedStepIds: WorkflowStepId[];
    activeStepId: WorkflowStepId | null;
    nextStepId: WorkflowStepId | null;
}

export interface WorkflowSuggestion {
    title: string;
    body: string;
    actionLabel: string | null;
    actionPage: string | null;
    hint?: string;
}

interface WorkflowPrefs {
    enabled: boolean;
    visitedPages: string[];
    visitedPagesByDataset?: Record<string, string[]>;
}

const STORAGE_KEY = 'edatime-guided-workflow';
const WORKFLOW_STEPS: Array<{ id: WorkflowStepId; label: string; page: string }> = [
    { id: 'upload', label: 'Upload', page: 'upload' },
    { id: 'timeseries', label: 'Timeseries', page: 'timeseries' },
    { id: 'correlations', label: 'Correlations', page: 'heatmap' },
    { id: 'scatter', label: 'Scatter', page: 'scatter' },
    { id: 'causal', label: 'Causal', page: 'causal' },
];

let _initialized = false;
let _currentNavPage = 'home';

function sanitizeVisitedPages(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((page) => String(page || '').trim())
        .filter((page, index, all) => !!page && all.indexOf(page) === index);
}

function sanitizeVisitedPagesByDataset(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const entries = Object.entries(value as Record<string, unknown>)
        .map(([datasetKey, pages]) => [String(datasetKey || '').trim(), sanitizeVisitedPages(pages)] as const)
        .filter(([datasetKey, pages]) => !!datasetKey && pages.length > 0);
    return Object.fromEntries(entries);
}

function currentDatasetKey(): string {
    const metadata = appState.metadata;
    const rows = Number(metadata?.total_rows || 0);
    const rangeStart = Number(metadata?.time_range?.min);
    const rangeEnd = Number(metadata?.time_range?.max);
    if (!rows || !Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return 'no-dataset';

    const revision = Number(appState.datasetRevision ?? metadata?.revision ?? 0);
    const numericColumns = Array.isArray(metadata?.numeric_columns) ? metadata.numeric_columns.join('|') : '';
    return [
        Number.isFinite(revision) ? revision : 0,
        rows,
        metadata?.time_column || '',
        rangeStart,
        rangeEnd,
        numericColumns,
    ].join(':');
}

function getVisitedPagesForCurrentDataset(prefs: WorkflowPrefs): string[] {
    const datasetKey = currentDatasetKey();
    if (datasetKey === 'no-dataset') return sanitizeVisitedPages(prefs.visitedPages);
    return sanitizeVisitedPages(prefs.visitedPagesByDataset?.[datasetKey]);
}

function setVisitedPagesForCurrentDataset(prefs: WorkflowPrefs, pages: string[]): void {
    const nextPages = sanitizeVisitedPages(pages);
    prefs.visitedPages = nextPages;

    const datasetKey = currentDatasetKey();
    if (datasetKey === 'no-dataset') return;

    prefs.visitedPagesByDataset = {
        ...(prefs.visitedPagesByDataset || {}),
        [datasetKey]: nextPages,
    };
}

function readPrefs(): WorkflowPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { enabled: true, visitedPages: [] };
        const parsed = JSON.parse(raw) as Partial<WorkflowPrefs>;
        const visitedPagesByDataset = sanitizeVisitedPagesByDataset(parsed.visitedPagesByDataset);
        const legacyVisitedPages = sanitizeVisitedPages(parsed.visitedPages);
        const datasetKey = currentDatasetKey();
        if (legacyVisitedPages.length > 0 && datasetKey !== 'no-dataset' && !visitedPagesByDataset[datasetKey]?.length) {
            visitedPagesByDataset[datasetKey] = legacyVisitedPages;
        }
        return {
            enabled: parsed.enabled !== false,
            visitedPages: datasetKey === 'no-dataset'
                ? legacyVisitedPages
                : sanitizeVisitedPages(visitedPagesByDataset[datasetKey]),
            visitedPagesByDataset,
        };
    } catch {
        return { enabled: true, visitedPages: [] };
    }
}

function savePrefs(prefs: WorkflowPrefs): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // ignore quota/storage errors
    }
}

function currentPage(): string {
    const active = document.querySelector('.sidebar .nav-item.active[data-page]') as HTMLElement | null;
    return active?.dataset.page || _currentNavPage || 'home';
}

function readSelectValue(id: string): string {
    return (document.getElementById(id) as HTMLSelectElement | null)?.value || '';
}

function collectSnapshot(): WorkflowSnapshot {
    const graph = (window as any).__edatimeCausalGraph;
    const prefs = readPrefs();
    return {
        currentPage: currentPage(),
        hasDataset: !!appState.metadata?.time_range && Number(appState.metadata?.total_rows || 0) > 0,
        selectedSeriesCount: Array.isArray(appState.selectedCols) ? appState.selectedCols.length : 0,
        visitedPages: getVisitedPagesForCurrentDataset(prefs),
        scatterX: readSelectValue('scatter-x-col'),
        scatterY: readSelectValue('scatter-y-col'),
        causalLinkCount: Array.isArray(graph?.links) ? graph.links.length : 0,
    };
}

function mapPageToStep(page: string, nextStepId: WorkflowStepId | null): WorkflowStepId | null {
    if (page === 'upload') return 'upload';
    if (page === 'timeseries') return 'timeseries';
    if (page === 'heatmap' || page === 'scattermatrix') return 'correlations';
    if (page === 'scatter') return 'scatter';
    if (page === 'causal') return 'causal';
    if (page === 'fft' || page === 'spectrogram') return nextStepId;
    return nextStepId;
}

/** Build workflow progress from the current application snapshot. */
export function computeWorkflowProgress(snapshot: WorkflowSnapshot): WorkflowProgress {
    const visited = new Set((snapshot.visitedPages || []).map(String));
    const completedStepIds: WorkflowStepId[] = [];

    if (snapshot.hasDataset) completedStepIds.push('upload');
    if (snapshot.selectedSeriesCount > 0) completedStepIds.push('timeseries');
    if (visited.has('heatmap') || visited.has('scattermatrix')) completedStepIds.push('correlations');
    if (snapshot.scatterX && snapshot.scatterY) completedStepIds.push('scatter');
    if (snapshot.causalLinkCount > 0) completedStepIds.push('causal');

    const nextStepId = WORKFLOW_STEPS.find((step) => !completedStepIds.includes(step.id))?.id || null;
    const activeStepId = mapPageToStep(snapshot.currentPage, nextStepId);
    const steps: WorkflowStepState[] = WORKFLOW_STEPS.map((step) => {
        const status: WorkflowStepState['status'] = activeStepId === step.id
            ? 'current'
            : completedStepIds.includes(step.id)
                ? 'done'
                : nextStepId === step.id
                    ? 'next'
                    : 'pending';
        return {
            id: step.id,
            label: step.label,
            page: step.page,
            status,
        };
    });

    return { steps, completedStepIds, activeStepId, nextStepId };
}

function defaultSuggestionForStep(stepId: WorkflowStepId | null): WorkflowSuggestion {
    if (stepId === 'timeseries') {
        return {
            title: 'Open Timeseries next',
            body: 'Start with 2 to 4 important numeric series so the first chart remains readable.',
            actionLabel: 'Open Timeseries',
            actionPage: 'timeseries',
        };
    }
    if (stepId === 'correlations') {
        return {
            title: 'Screen correlations next',
            body: 'Use Heatmap or Matrix to separate strong candidates from weak relationships before a deeper scatter drill-down.',
            actionLabel: 'Open Heatmap',
            actionPage: 'heatmap',
            hint: 'Scatter Matrix cells already open the detailed scatter view when clicked.',
        };
    }
    if (stepId === 'scatter') {
        return {
            title: 'Deep dive in Scatter',
            body: 'Pick a candidate pair and inspect its shape, outliers, and filter sensitivity in the detailed scatter view.',
            actionLabel: 'Open Scatter',
            actionPage: 'scatter',
        };
    }
    if (stepId === 'causal') {
        return {
            title: 'Use Causal as the late-stage check',
            body: 'After narrowing the candidate variables, test a small plausible set with lag-aware causal discovery.',
            actionLabel: 'Open Causal',
            actionPage: 'causal',
        };
    }
    return {
        title: 'Workflow complete',
        body: 'You have touched each guided step. Revisit any page as needed and save or export the context you want to keep.',
        actionLabel: 'Open Timeseries',
        actionPage: 'timeseries',
    };
}

/** Build the current guided recommendation from the application snapshot. */
export function buildWorkflowSuggestion(snapshot: WorkflowSnapshot): WorkflowSuggestion {
    const progress = computeWorkflowProgress(snapshot);

    if (snapshot.currentPage === 'home') {
        if (!snapshot.hasDataset) {
            return {
                title: 'Start on Upload',
                body: 'Load a CSV or Parquet file, verify the detected time column, and inspect the profile grid before plotting anything.',
                actionLabel: 'Open Upload',
                actionPage: 'upload',
            };
        }
        return defaultSuggestionForStep(progress.nextStepId);
    }

    if (snapshot.currentPage === 'upload') {
        if (!snapshot.hasDataset) {
            return {
                title: 'Validate the dataset first',
                body: 'Use Upload to confirm row count, time range, numeric columns, and any obvious profile issues before moving on.',
                actionLabel: null,
                actionPage: null,
            };
        }
        return {
            title: 'Move to Timeseries',
            body: 'Choose a small set of important series first so you can establish baseline trend, co-movement, and suspicious windows.',
            actionLabel: 'Open Timeseries',
            actionPage: 'timeseries',
        };
    }

    if (snapshot.currentPage === 'timeseries') {
        if (snapshot.selectedSeriesCount === 0) {
            return {
                title: 'Pick 2 to 4 key series',
                body: 'The guided path starts by keeping the first chart legible. Select 2 to 4 important series before widening the scope.',
                actionLabel: null,
                actionPage: null,
            };
        }
        return {
            title: 'Screen relationships next',
            body: 'Use Heatmap or Matrix to quickly identify strong candidate pairs before committing to a detailed scatter inspection.',
            actionLabel: 'Open Heatmap',
            actionPage: 'heatmap',
            hint: 'You can also use Scatter Matrix if you want direct pairwise shape previews.',
        };
    }

    if (snapshot.currentPage === 'heatmap') {
        return {
            title: 'Choose the strongest pair',
            body: 'Use the heatmap to pick a promising relationship, then inspect it in Scatter where filter context and color-by are easier to read.',
            actionLabel: 'Open Scatter',
            actionPage: 'scatter',
        };
    }

    if (snapshot.currentPage === 'scattermatrix') {
        return {
            title: 'Use matrix cells as a drill-down',
            body: 'Click any off-diagonal matrix cell to open the full scatter detail view for that exact pair.',
            actionLabel: 'Open Scatter',
            actionPage: 'scatter',
            hint: 'Matrix click-through is already wired into the detailed scatter view.',
        };
    }

    if (snapshot.currentPage === 'scatter') {
        if (!snapshot.scatterX || !snapshot.scatterY) {
            return {
                title: 'Set X and Y for the deep dive',
                body: 'Pick two numeric columns so this step can validate the shape, spread, and filter sensitivity of the relationship.',
                actionLabel: null,
                actionPage: null,
            };
        }
        return {
            title: 'Use Causal as the final check',
            body: 'After narrowing the variables, move to Causal with a small plausible set instead of starting broad.',
            actionLabel: 'Open Causal',
            actionPage: 'causal',
        };
    }

    if (snapshot.currentPage === 'causal') {
        if (snapshot.causalLinkCount === 0) {
            return {
                title: 'Run Causal on a focused subset',
                body: 'Keep the variable list tight so the resulting graph stays interpretable and easier to compare across runs.',
                actionLabel: null,
                actionPage: null,
            };
        }
        return {
            title: 'Compare causal runs for stability',
            body: 'Save multiple runs and compare them so stable edges stand out from parameter-sensitive ones.',
            actionLabel: null,
            actionPage: null,
        };
    }

    if (snapshot.currentPage === 'fft' || snapshot.currentPage === 'spectrogram') {
        const fallback = defaultSuggestionForStep(progress.nextStepId);
        return {
            title: 'Use spectral pages as side analysis',
            body: 'These pages work best after you already know the interesting column or interval from the main workflow.',
            actionLabel: fallback.actionLabel,
            actionPage: fallback.actionPage,
            hint: fallback.title,
        };
    }

    return defaultSuggestionForStep(progress.nextStepId);
}

function escapeHtml(value: string): string {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function navigateToPage(page: string | null): void {
    if (!page) return;
    (document.querySelector(`.sidebar .nav-item[data-page="${page}"]`) as HTMLElement | null)?.click?.();
}

function setEnabled(enabled: boolean, emitToast = true): void {
    const prefs = readPrefs();
    prefs.enabled = enabled;
    savePrefs(prefs);
    renderGuidedWorkflow();
    if (emitToast) {
        toast(enabled ? 'Guided workflow enabled.' : 'Guided workflow hidden.', 'info');
    }
}

function markVisited(page: string): void {
    const prefs = readPrefs();
    const visitedPages = getVisitedPagesForCurrentDataset(prefs);
    if (!page || visitedPages.includes(page)) return;
    setVisitedPagesForCurrentDataset(prefs, [...visitedPages, page]);
    savePrefs(prefs);
}

function bindStaticEvents(): void {
    document.getElementById('workflow-toggle-btn')?.addEventListener('click', () => {
        const prefs = readPrefs();
        setEnabled(!prefs.enabled);
    });

    const panel = document.getElementById('workflow-panel');
    panel?.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        const action = target?.closest<HTMLElement>('[data-workflow-action]')?.dataset.workflowAction;
        const page = target?.closest<HTMLElement>('[data-workflow-page]')?.dataset.workflowPage || null;
        if (!action) return;

        if (action === 'goto') {
            navigateToPage(page);
            return;
        }
        if (action === 'skip') {
            setEnabled(false, false);
            toast('Guided workflow hidden. Use the Guide button or command palette to restore it.', 'info');
            return;
        }
        if (action === 'next') {
            goToNextGuidedStep();
        }
    });

    document.addEventListener('change', (event) => {
        const target = event.target as HTMLElement | null;
        const id = target?.id || '';
        if (id === 'scatter-x-col' || id === 'scatter-y-col') renderGuidedWorkflow();
    });

    window.addEventListener('edatime:page-change', (event: any) => {
        const nextPage = event?.detail?.navPage || event?.detail?.page || currentPage();
        _currentNavPage = nextPage;
        markVisited(nextPage);
        renderGuidedWorkflow();
    });
    window.addEventListener('edatime:session-restored', renderGuidedWorkflow);
    window.addEventListener('edatime:workflow-refresh', renderGuidedWorkflow as EventListener);
}

export function renderGuidedWorkflow(): void {
    const panel = document.getElementById('workflow-panel') as HTMLElement | null;
    const toggleBtn = document.getElementById('workflow-toggle-btn') as HTMLButtonElement | null;
    if (!panel) return;

    const prefs = readPrefs();
    panel.hidden = !prefs.enabled;
    if (toggleBtn) {
        toggleBtn.classList.toggle('btn-accent', prefs.enabled);
        toggleBtn.classList.toggle('btn-ghost', !prefs.enabled);
        toggleBtn.setAttribute('aria-pressed', prefs.enabled ? 'true' : 'false');
    }
    if (!prefs.enabled) return;

    const snapshot = collectSnapshot();
    const progress = computeWorkflowProgress(snapshot);
    const suggestion = buildWorkflowSuggestion(snapshot);

    const crumbs = progress.steps.map((step) => `
        <button
            class="workflow-step workflow-step--${step.status}"
            type="button"
            data-workflow-action="goto"
            data-workflow-page="${escapeHtml(step.page)}"
            title="Open ${escapeHtml(step.label)}"
        >
            <span class="workflow-step__dot"></span>
            <span class="workflow-step__label">${escapeHtml(step.label)}</span>
        </button>
    `).join('');

    panel.innerHTML = `
        <div class="workflow-panel__header workflow-panel__header--compact">
            <div class="workflow-panel__summary">
                <div class="workflow-panel__eyebrow">Guided Workflow</div>
                <div class="workflow-panel__title">${escapeHtml(suggestion.title)}</div>
                <p class="workflow-panel__copy workflow-panel__copy--compact">${escapeHtml(suggestion.body)}</p>
            </div>
            <div class="workflow-panel__actions">
                ${suggestion.actionLabel && suggestion.actionPage ? `
                    <button class="btn btn-accent btn-sm" type="button" data-workflow-action="next">${escapeHtml(suggestion.actionLabel)}</button>
                ` : ''}
                <button class="btn btn-ghost btn-sm" type="button" data-workflow-action="skip">Hide Guide</button>
            </div>
        </div>
        <div class="workflow-panel__crumbs">${crumbs}</div>
        ${suggestion.hint ? `<div class="workflow-panel__hint">${escapeHtml(suggestion.hint)}</div>` : ''}
    `;
}

export function enableGuidedWorkflow(): void {
    setEnabled(true);
}

export function disableGuidedWorkflow(): void {
    setEnabled(false);
}

export function goToNextGuidedStep(): void {
    const suggestion = buildWorkflowSuggestion(collectSnapshot());
    navigateToPage(suggestion.actionPage);
}

export function initGuidedWorkflow(): void {
    if (_initialized) return;
    _initialized = true;
    _currentNavPage = currentPage();
    markVisited(_currentNavPage);
    bindStaticEvents();
    renderGuidedWorkflow();

    (window as any).__edatime = (window as any).__edatime || {};
    (window as any).__edatime.guidedWorkflow = {
        enable: enableGuidedWorkflow,
        disable: disableGuidedWorkflow,
        next: goToNextGuidedStep,
        render: renderGuidedWorkflow,
    };
}