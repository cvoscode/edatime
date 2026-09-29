import { hashCleaningPlan } from '../cleaning/planHash.js';
import type { WorkspaceSnapshot } from '../contracts/workspace.js';
import {
    getCompletedAnalysisExportContext,
    getExportProvenanceContext,
    setExportProvenanceContext,
    type ExportProvenanceDeps,
} from './exportProvenanceContext.js';
export type { ExportProvenanceDeps } from './exportProvenanceContext.js';
import type { DataObject } from '../types/api.js';
import { getDropdownValue } from '../ui/primitives/Dropdown.js';

export interface ExportProvenanceDocument {
    format: 'edatime.export-provenance';
    schemaVersion: 1;
    createdAt: string;
    export: { filename: string; mimeType: string };
    dataset: {
        name: string | null;
        sourceVersionId: string | null;
        sourceRevision: number | null;
        workspaceRevision: number;
        datasetFingerprint: string | null;
        schemaFingerprint: string | null;
        totalRows: number | null;
        columns: string[];
        timeColumn: string | null;
        timeRange: { start: string; end: string } | null;
    };
    selection: {
        columns: string[];
        colorColumn: string | null;
        visibleTraceCheckboxes: string[];
    };
    filters: WorkspaceSnapshot['filters'];
    viewport: WorkspaceSnapshot['viewport'];
    analysis: {
        page: string | null;
        controls: Record<string, string | number | boolean | null>;
    };
    sampling: {
        signals: string | null;
        spectrum: string | null;
        timeFrequency: string | null;
    };
    preparation: {
        draftPlanHash: string | null;
        draftPlan: unknown;
        draftIsDirty: boolean;
        appliedPlanHistory: {
            status: 'available' | 'missing' | 'none' | 'unavailable' | 'mismatched' | 'no-version-id';
            plan: unknown;
        };
    };
    result: {
        executionIdentity: DataObject['_meta']['executionIdentity'] | null;
        matchesActiveDataset: boolean | null;
    };
}

let unbindRetryControls: (() => void) | null = null;
let lastSidecar: { blob: Blob; filename: string } | null = null;
let downloadSequence = 0;

function isoTime(value: number | undefined): string | null {
    if (!Number.isFinite(value) || Math.abs(value!) > 8_640_000_000_000_000) return null;
    return new Date(value!).toISOString();
}

function currentPage(pageName?: string): HTMLElement | null {
    const pages = [...document.querySelectorAll<HTMLElement>('[data-page-name]')];
    return pageName
        ? pages.find((page) => page.dataset.pageName === pageName) ?? null
        : pages.find((page) => !page.hidden) ?? null;
}

function controlValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | number | boolean | null {
    if (control instanceof HTMLInputElement) {
        if (['file', 'password', 'search', 'submit', 'button', 'reset', 'image'].includes(control.type)) return null;
        if (control.type === 'checkbox' || control.type === 'radio') return control.checked;
        if (control.type === 'number' || control.type === 'range') {
            const numeric = Number(control.value);
            return control.value.trim() && Number.isFinite(numeric) ? numeric : null;
        }
    }
    const value = control.value;
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
}

function readAnalysisControls(page: HTMLElement | null): Record<string, string | number | boolean | null> {
    if (!page) return {};
    const controls: Record<string, string | number | boolean | null> = {};
    for (const control of page.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
        if (control.disabled || !control.id && !control.name) continue;
        const key = control.id || control.name;
        const value = controlValue(control);
        if (value !== null) controls[key] = value;
    }
    for (const dropdown of page.querySelectorAll<HTMLElement>('.dropdown[id]')) {
        if (dropdown.getAttribute('aria-disabled') === 'true') continue;
        const value = getDropdownValue(dropdown.id);
        if (value) controls[dropdown.id] = value;
    }
    return controls;
}

function readSamplingContext(id: string, pageName: string | undefined): string | null {
    if (!pageName) return null;
    const element = document.getElementById(id);
    const ownerPage = element?.closest<HTMLElement>('[data-page-name]');
    if (!element || element.hidden || ownerPage?.dataset.pageName !== pageName) return null;
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return text || null;
}

function copyJson<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function captureBase(
    filename: string,
    mimeType: string,
    deps: ExportProvenanceDeps,
    pageName?: string,
): ExportProvenanceDocument {
    const page = currentPage(pageName);
    const completed = page ? getCompletedAnalysisExportContext(page.dataset.pageName || '') : null;
    const snapshot = completed?.workspace ?? deps.workspace.getSnapshot();
    const metadata = snapshot.dataset.metadata;
    const plan = completed ? completed.cleaningPlan : deps.cleaningPlanStore.getSnapshot();
    const versionId = snapshot.dataset.activeSourceVersionId
        || metadata?.source_version_id
        || null;
    const result = page?.dataset.pageName === 'timeseries' ? deps.getData?.() ?? null : null;
    const timeStart = isoTime(metadata?.time_range?.min);
    const timeEnd = isoTime(metadata?.time_range?.max);
    const timeRange = timeStart && timeEnd ? { start: timeStart, end: timeEnd } : null;
    const columns = metadata?.columns?.map((column) => column.name) ?? [];
    const checked = completed?.visibleTraceCheckboxes ?? (page
        ? [...page.querySelectorAll<HTMLInputElement>('.series-chip input[type="checkbox"]:checked')]
            .map((input) => input.value || input.getAttribute('aria-label')?.replace(/^Toggle\s+/, '') || '')
            .filter(Boolean)
        : []);
    const sourceRevision = Number(metadata?.source_version_revision ?? metadata?.revision ?? snapshot.dataset.revision);
    const resultIdentity = completed?.executionIdentity
        ?? (page?.dataset.pageName === 'timeseries' ? result?._meta.executionIdentity : null)
        ?? null;
    const matchesActiveDataset = resultIdentity && versionId
        ? resultIdentity.sourceVersionId === versionId
            && resultIdentity.sourceRevision === sourceRevision
            && resultIdentity.schemaFingerprint === (metadata?.schema_fingerprint ?? plan?.schemaFingerprint)
        : null;

    return {
        format: 'edatime.export-provenance',
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        export: { filename, mimeType },
        dataset: {
            name: metadata?.display_name?.trim() || metadata?.source_name?.trim() || metadata?.source_version_id || versionId,
            sourceVersionId: versionId,
            sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : null,
            workspaceRevision: snapshot.dataset.revision,
            datasetFingerprint: metadata?.dataset_fingerprint ?? snapshot.dataset.sourceFingerprint ?? null,
            schemaFingerprint: metadata?.schema_fingerprint ?? null,
            totalRows: Number.isFinite(metadata?.total_rows) ? metadata!.total_rows : null,
            columns,
            timeColumn: metadata?.time_column ?? null,
            timeRange,
        },
        selection: {
            columns: [...snapshot.selection.columns],
            colorColumn: snapshot.selection.colorColumn,
            visibleTraceCheckboxes: checked,
        },
        filters: copyJson(snapshot.filters),
        viewport: copyJson(snapshot.viewport),
        analysis: {
            page: page?.dataset.pageName ?? null,
            controls: completed && page && completed.pageName === page.dataset.pageName
                ? completed.controls
                : readAnalysisControls(page),
        },
        sampling: completed && page && completed.pageName === page.dataset.pageName ? completed.sampling : {
            signals: page?.dataset.pageName === 'timeseries'
                ? readSamplingContext('timeseries-sampling-indicator', page.dataset.pageName)
                : null,
            spectrum: page?.dataset.pageName === 'fft'
                ? readSamplingContext('fft-sampling-badge', page.dataset.pageName)
                : null,
            timeFrequency: page?.dataset.pageName === 'spectrogram'
                ? readSamplingContext('spectrogram-sampling-context', page.dataset.pageName)
                : null,
        },
        preparation: {
            draftPlanHash: plan ? hashCleaningPlan(plan) : null,
            draftPlan: copyJson(plan),
            draftIsDirty: completed ? completed.cleaningPlanIsDirty : deps.cleaningPlanStore.isDirty(),
            appliedPlanHistory: {
                status: versionId ? 'unavailable' : 'no-version-id',
                plan: null,
            },
        },
        result: { executionIdentity: copyJson(resultIdentity), matchesActiveDataset },
    };
}

export async function buildExportProvenance(
    filename: string,
    mimeType: string,
    deps: ExportProvenanceDeps,
    pageName?: string,
): Promise<ExportProvenanceDocument> {
    const document = captureBase(filename, mimeType, deps, pageName);
    const versionId = document.dataset.sourceVersionId;
    if (!versionId || !deps.loadAppliedPlanHistory) return document;
    try {
        const history = await deps.loadAppliedPlanHistory(versionId);
        if (history.sourceVersion.id !== versionId) {
            document.preparation.appliedPlanHistory = { status: 'mismatched', plan: null };
        } else {
            document.dataset.name = history.sourceVersion.displayName?.trim()
                || history.sourceVersion.sourceName?.trim()
                || document.dataset.name;
            document.preparation.appliedPlanHistory = {
                status: history.historyStatus,
                plan: copyJson(history.appliedPlan),
            };
        }
    } catch {
        document.preparation.appliedPlanHistory = { status: 'unavailable', plan: null };
    }
    return document;
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setRetryNotice(filename: string, blob: Blob): void {
    lastSidecar = { blob, filename };
    const panel = document.getElementById('export-provenance-retry');
    const message = panel?.querySelector<HTMLElement>('.export-provenance-retry__message');
    const retry = document.getElementById('retry-export-provenance-btn') as HTMLButtonElement | null;
    if (!panel || !message || !retry) return;
    message.textContent = `Provenance sidecar: ${filename}. If the browser blocked the second download, retry it here.`;
    retry.hidden = false;
    panel.hidden = false;
}

export function recordExportForProvenance(filename: string, mimeType: string, pageName?: string): void {
    const deps = getExportProvenanceContext();
    if (!deps) return;
    ensureRetryControls();
    const sequence = ++downloadSequence;
    void buildExportProvenance(filename, mimeType, deps, pageName).then((document) => {
        const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json;charset=utf-8' });
        const sidecarFilename = `${filename.replace(/\.[^.]+$/, '')}.provenance.json`;
        triggerDownload(blob, sidecarFilename);
        if (sequence === downloadSequence) setRetryNotice(sidecarFilename, blob);
    });
}

function ensureRetryControls(): void {
    if (unbindRetryControls) return;
    const retry = document.getElementById('retry-export-provenance-btn');
    const dismiss = document.getElementById('dismiss-export-provenance-btn');
    const panel = document.getElementById('export-provenance-retry');
    const onRetry = () => { if (lastSidecar) triggerDownload(lastSidecar.blob, lastSidecar.filename); };
    const onDismiss = () => { if (panel) panel.hidden = true; };
    retry?.addEventListener('click', onRetry);
    dismiss?.addEventListener('click', onDismiss);
    unbindRetryControls = () => {
        retry?.removeEventListener('click', onRetry);
        dismiss?.removeEventListener('click', onDismiss);
        unbindRetryControls = null;
    };
}

export function configureExportProvenance(deps: ExportProvenanceDeps): () => void {
    const resetContext = setExportProvenanceContext(deps);
    ensureRetryControls();
    return () => {
        unbindRetryControls?.();
        resetContext();
        lastSidecar = null;
    };
}
