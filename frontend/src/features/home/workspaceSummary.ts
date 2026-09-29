import type { WorkspaceStore } from '../../contracts/workspace.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';
import { formatAnalysisTime } from '../../utils/format.js';
import { onNavigationChange } from '../../platform/navigationEvents.js';
import { toast } from '../../utils/toast.js';

const LAST_PAGE_KEY = 'edatime-last-analysis-page';
const WELCOME_SHOWN_KEY = 'edatime-welcome-shown';
const PAGE_LABELS: Record<string, string> = {
    upload: 'Data source',
    timeseries: 'Signals',
    prepare: 'Preparation',
    correlations: 'Correlation matrix',
    scatter: 'Pair plot',
    fft: 'Spectrum',
    spectrogram: 'Time-frequency',
    causal: 'Causality',
    drift: 'Drift',
};

interface HomeSummaryDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>;
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'subscribe' | 'isDirty'>;
    showPage(page: string): void;
    ensureDatasetMetadata?: () => Promise<'ready' | 'empty'>;
}

function setText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function readLastPage(): string | null {
    try {
        const page = sessionStorage.getItem(LAST_PAGE_KEY) || '';
        return PAGE_LABELS[page] ? page : null;
    } catch {
        return null;
    }
}

function writeLastPage(page: string): void {
    if (!PAGE_LABELS[page] || page === 'upload') return;
    try { sessionStorage.setItem(LAST_PAGE_KEY, page); } catch { /* optional browser storage */ }
}

function datasetName(metadata: NonNullable<ReturnType<HomeSummaryDeps['workspace']['getSnapshot']>['dataset']['metadata']>): string {
    return String(metadata.source_name || metadata.source_version_id || 'Active dataset');
}

/** Keep Overview synchronized with the canonical workspace and cleaning plan. */
export function initHomeWorkspaceSummary(deps: HomeSummaryDeps): () => void {
    const continueButton = document.getElementById('home-continue-btn') as HTMLButtonElement | null;
    let hadDataset = false;
    let metadataState: 'loading' | 'ready' | 'empty' | 'error' = deps.ensureDatasetMetadata ? 'loading' : 'empty';
    const metadataStatus = document.getElementById('home-dataset-status');
    const retryMetadata = document.getElementById('home-dataset-retry') as HTMLButtonElement | null;

    const showWelcomeOnce = () => {
        try {
            if (sessionStorage.getItem(WELCOME_SHOWN_KEY)) return;
            sessionStorage.setItem(WELCOME_SHOWN_KEY, '1');
        } catch { /* the toast still works when storage is unavailable */ }
        toast(
            'Welcome to EdaTime. Try Signals to inspect your data, or Preparation to clean it. Open Help on any page for control-by-control guidance.',
            'info',
            { duration: 0 },
        );
    };

    const render = () => {
        const snapshot = deps.workspace.getSnapshot();
        const metadata = snapshot.dataset.metadata;
        const hasDataset = !!metadata && Number(metadata.total_rows || 0) > 0;
        if (metadata) metadataState = 'ready';
        if (hasDataset && !hadDataset) showWelcomeOnce();
        hadDataset = hasDataset;
        const summary = document.getElementById('home-active-dataset');
        const samples = document.getElementById('home-samples-disclosure') as HTMLDetailsElement | null;
        const cta = document.getElementById('home-primary-cta');
        const subtitle = document.querySelector<HTMLElement>('#page-home .page-header__description');

        if (summary) summary.hidden = !hasDataset;
        if (cta) cta.textContent = hasDataset ? 'Change dataset' : 'Load a dataset';
        if (subtitle) {
            subtitle.textContent = hasDataset
                ? 'Continue from the active dataset or review its analysis context.'
                : metadataState === 'loading'
                    ? 'Checking whether a dataset is already active.'
                    : metadataState === 'error'
                        ? 'The active dataset could not be checked. Retry or load a dataset.'
                        : 'Load a dataset, inspect its signals, then narrow the analysis path.';
        }
        if (metadataStatus) {
            const statusText = metadataState === 'loading'
                ? 'Checking for an active dataset…'
                : metadataState === 'error'
                    ? 'Could not check for an active dataset.'
                    : '';
            metadataStatus.textContent = statusText;
            metadataStatus.hidden = !statusText;
            metadataStatus.setAttribute('role', metadataState === 'error' ? 'alert' : 'status');
        }
        if (retryMetadata) retryMetadata.hidden = metadataState !== 'error';
        if (samples) {
            samples.open = !hasDataset;
            const label = samples.querySelector<HTMLElement>('.home-samples-summary__label');
            if (label) label.textContent = hasDataset ? 'Replace with sample data' : 'Try with sample data';
        }

        document.querySelectorAll<HTMLButtonElement>('[data-sample-dataset]').forEach((button) => {
            const sample = String(button.dataset.sampleDataset || '');
            const source = String(metadata?.source_name || '').toLowerCase();
            const current = hasDataset && (
                (sample === 'ettm2' && source.includes('ettm2'))
                || (sample === 'sinusoidal' && source.includes('sinusoidal'))
                || (sample === 'weather' && source.includes('weather'))
            );
            button.disabled = current || metadataState === 'loading';
            button.classList.toggle('is-current', current);
            button.setAttribute('aria-label', metadataState === 'loading'
                ? `Checking the active dataset before enabling ${sample} sample data`
                : current
                    ? `${sample} sample dataset is already active`
                    : `Replace active dataset with ${sample} sample data`);
        });

        if (!hasDataset || !metadata) return;
        const lastPage = readLastPage();
        const plan = deps.cleaningPlanStore?.getSnapshot();
        const activeStages = plan?.stages.filter((stage) => stage.enabled && stage.executionClass !== 'annotation').length ?? 0;
        setText('home-dataset-name', datasetName(metadata));
        setText('home-dataset-rows', Number(metadata.total_rows || 0).toLocaleString());
        setText('home-dataset-columns', String(metadata.columns?.length ?? 0));
        setText('home-dataset-time-column', metadata.time_column || 'Not detected');
        const rangeSpan = document.getElementById('home-dataset-span');
        if (rangeSpan) {
            const range = metadata.time_range;
            const start = Number(range?.min);
            const end = Number(range?.max);
            const dateLimit = 8_640_000_000_000_000;
            if (Number.isFinite(start) && Number.isFinite(end) && Math.abs(start) <= dateLimit && Math.abs(end) <= dateLimit) {
                const startIso = new Date(start).toISOString();
                const endIso = new Date(end).toISOString();
                rangeSpan.textContent = `${formatAnalysisTime(start)} → ${formatAnalysisTime(end)}`;
                rangeSpan.title = `UTC ${startIso} → UTC ${endIso}`;
                rangeSpan.setAttribute('aria-label', `Time span from UTC ${startIso} to UTC ${endIso}`);
            } else {
                rangeSpan.textContent = 'Not available';
                rangeSpan.removeAttribute('title');
                rangeSpan.removeAttribute('aria-label');
            }
        }
        setText('home-dataset-plan', `${activeStages} active stage${activeStages === 1 ? '' : 's'}${deps.cleaningPlanStore?.isDirty() ? ' · draft' : ' · baseline'}`);
        if (continueButton) {
            continueButton.dataset.page = lastPage || 'timeseries';
            continueButton.textContent = lastPage ? `Resume from ${PAGE_LABELS[lastPage]}` : 'Explore signals';
        }
    };

    const onContinue = () => deps.showPage(continueButton?.dataset.page || 'timeseries');
    const checkMetadata = async () => {
        if (!deps.ensureDatasetMetadata) return;
        metadataState = 'loading';
        render();
        try {
            metadataState = await deps.ensureDatasetMetadata();
        } catch (error) {
            if (deps.workspace.getSnapshot().dataset.metadata) metadataState = 'ready';
            else metadataState = 'error';
        }
        render();
    };
    const onRetryMetadata = () => { void checkMetadata(); };
    retryMetadata?.addEventListener('click', onRetryMetadata);
    continueButton?.addEventListener('click', onContinue);
    const unsubscribeWorkspace = deps.workspace.subscribe(render);
    const unsubscribePlan = deps.cleaningPlanStore?.subscribe(render);
    const unsubscribeNavigation = onNavigationChange(({ navPage, page }) => {
        writeLastPage(navPage || page);
        if ((navPage || page) === 'home') render();
    });
    render();
    if (deps.ensureDatasetMetadata && !deps.workspace.getSnapshot().dataset.metadata) void checkMetadata();

    return () => {
        retryMetadata?.removeEventListener('click', onRetryMetadata);
        continueButton?.removeEventListener('click', onContinue);
        unsubscribeWorkspace();
        unsubscribePlan?.();
        unsubscribeNavigation();
    };
}
