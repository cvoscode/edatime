import type { AppliedPlanHistoryResponse } from '../cleaning/api.js';
import type { CleaningPlanStore } from '../cleaning/store.js';
import type { WorkspaceSnapshot, WorkspaceStore } from '../contracts/workspace.js';
import type { CleaningPlan } from '../cleaning/types.js';
import type { DataObject } from '../types/api.js';
import type { ExecutionIdentity } from '../contracts/api/v1/identity.js';

export interface ExportProvenanceDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
    cleaningPlanStore: Pick<CleaningPlanStore, 'getSnapshot' | 'isDirty'>;
    getData?: () => DataObject | null;
    loadAppliedPlanHistory?: (versionId: string) => Promise<AppliedPlanHistoryResponse>;
}

export interface CompletedAnalysisExportContext {
    pageName: string;
    controls: Record<string, string | number | boolean | null>;
    executionIdentity: ExecutionIdentity | null;
    workspace: WorkspaceSnapshot;
    cleaningPlan: CleaningPlan | null;
    cleaningPlanIsDirty: boolean;
    sampling: {
        signals: string | null;
        spectrum: string | null;
        timeFrequency: string | null;
    };
    visibleTraceCheckboxes: string[];
}

let configuredDeps: ExportProvenanceDeps | null = null;
const completedAnalysisByPage = new Map<string, CompletedAnalysisExportContext>();

export function setExportProvenanceContext(deps: ExportProvenanceDeps): () => void {
    if (configuredDeps !== deps) completedAnalysisByPage.clear();
    configuredDeps = deps;
    return () => { if (configuredDeps === deps) configuredDeps = null; };
}

export function getExportProvenanceContext(): ExportProvenanceDeps | null {
    return configuredDeps;
}


function copyJson<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function samplingText(id: string, pageName: string): string | null {
    const element = document.getElementById(id);
    if (!element || element.hidden) return null;
    const ownerPage = element.closest<HTMLElement>('[data-page-name]');
    if (ownerPage && ownerPage.dataset.pageName !== pageName) return null;
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return text || null;
}

/** Capture request-time controls and workspace state; commit only after a result renders. */
export function beginCompletedAnalysisExportContext(input: {
    pageName: string;
    controls: Record<string, string | number | boolean | null>;
    workspaceSnapshot?: WorkspaceSnapshot;
}): (executionIdentity?: ExecutionIdentity | null, resultControls?: Record<string, string | number | boolean | null>) => void {
    const deps = configuredDeps;
    if (!deps) return () => {};
    const workspace = copyJson(input.workspaceSnapshot ?? deps.workspace.getSnapshot());
    const cleaningPlan = copyJson(deps.cleaningPlanStore.getSnapshot());
    const cleaningPlanIsDirty = deps.cleaningPlanStore.isDirty();
    const page = [...document.querySelectorAll<HTMLElement>('[data-page-name]')]
        .find((element) => element.dataset.pageName === input.pageName);
    const visibleTraceCheckboxes = [...(page?.querySelectorAll<HTMLInputElement>('.series-chip input[type="checkbox"]:checked') ?? [])]
        .map((checkbox) => checkbox.value || checkbox.getAttribute('aria-label')?.replace(/^Toggle\s+/, '') || '')
        .filter(Boolean);
    const controls = copyJson(input.controls);

    return (executionIdentity = null, resultControls = {}) => {
        completedAnalysisByPage.set(input.pageName, {
            pageName: input.pageName,
            controls: { ...controls, ...copyJson(resultControls) },
            executionIdentity: copyJson(executionIdentity),
            workspace,
            cleaningPlan,
            cleaningPlanIsDirty,
            sampling: {
                signals: input.pageName === 'timeseries' ? samplingText('timeseries-sampling-indicator', input.pageName) : null,
                spectrum: input.pageName === 'fft' ? samplingText('fft-sampling-badge', input.pageName) : null,
                timeFrequency: input.pageName === 'spectrogram' ? samplingText('spectrogram-sampling-context', input.pageName) : null,
            },
            visibleTraceCheckboxes,
        });
    };
}

export function getCompletedAnalysisExportContext(pageName: string): CompletedAnalysisExportContext | null {
    const context = completedAnalysisByPage.get(pageName);
    return context ? copyJson(context) : null;
}

/** Display-only changes do not replace the completed input-processing provenance. */
export function updateCompletedAnalysisDisplayControls(pageName: string, controls: Record<string, string | number | boolean | null>): void {
    const context = completedAnalysisByPage.get(pageName);
    if (context) context.controls = { ...context.controls, ...copyJson(controls) };
}
