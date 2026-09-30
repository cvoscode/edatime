/**
 * Preview controller — manages file preview lifecycle.
 *
 * Handles: status display, abort controller, metadata hydration,
 * column selection from preview response.
 */
import {
    previewUpload,
} from '../../services/api/index.js';
import { uploadProfile } from './profileState.js';
import { setPreviewSelectedColumns, setPreviewTimeColumn, uploadUi } from './uploadUi.js';
import { formatCount, formatAnalysisTime, formatToDatetimeLocal } from '../../utils/format.js';
import { getPartialTimeRangeInputs } from './partialLoadControls.js';
import { toast } from '../../utils/toast.js';
import { getDropdownValue, setDropdownOptions, setDropdownValue } from '../../ui/primitives/Dropdown.js';
import type { DatasetMetadata } from '../../types/api.js';
import { errorMessage, isAbortError } from '../../utils/errors.js';

// ── Status display ───────────────────────────────────────────────────────────

export function setUploadPreviewStatus(text: string, kind = ''): void {
    const el = document.getElementById('upload-preview-status');
    if (!el) return;
    el.textContent = text;
    el.className = `upload-preview-status ${kind}`.trim();
}

// ── Profile mode badge ──────────────────────────────────────────────────────

export type UploadProfileMode = 'dataset' | 'preview' | 'exact' | 'sampled' | 'unavailable';

export function setProfileMode(mode: UploadProfileMode): void {
    const badge = document.getElementById('profile-mode-badge');
    const heading = document.getElementById('upload-preview-heading');
    if (badge) {
        badge.setAttribute('data-mode', mode);
        const labels: Record<UploadProfileMode, string> = {
            dataset: 'Active dataset', preview: 'Not loaded yet', exact: 'Exact statistics',
            sampled: 'Sampled estimate', unavailable: 'Statistics unavailable',
        };
        badge.textContent = labels[mode];
    }
    if (heading) heading.textContent = mode === 'preview' ? 'Incoming file preview' : 'Current dataset profile';
}

// ── Preview lifecycle ───────────────────────────────────────────────────────

export interface PreviewCallbacks {
    hydrateColumnProfiles: (metadata: DatasetMetadata) => void;
    renderColumnProfilesGrid: (resetScroll: boolean) => void;
    onTimeColumnChanged: () => void;
    signal?: AbortSignal;
}

export type UploadPreviewResult = 'ready' | 'failed' | 'ignored';

export interface UploadPreviewController {
    run(file: File, callbacks: PreviewCallbacks): Promise<UploadPreviewResult>;
    cancel(): void;
    dispose(): void;
}

/** Create an upload-preview request owner for one mounted Upload panel. */
export function createUploadPreviewController(): UploadPreviewController {
    let request: AbortController | null = null;
    let disposed = false;

    const cancel = () => {
        request?.abort();
        request = null;
    };

    return {
        async run(file: File, callbacks: PreviewCallbacks): Promise<UploadPreviewResult> {
            if (disposed || callbacks.signal?.aborted) return 'ignored';
            if (!file) {
                setUploadPreviewStatus('Select a file to preview columns');
                return 'failed';
            }
            request?.abort();
            const controller = new AbortController();
            request = controller;
            const abort = () => controller.abort();
            callbacks.signal?.addEventListener('abort', abort, { once: true });
            setUploadPreviewStatus('Profiling file…', 'loading');

            try {
                const formData = new FormData();
                formData.append('file', file);

                const timeColumn = String(uploadUi.previewTimeColumn || '').trim();
                if (timeColumn) formData.append('time_column', timeColumn);

                const res = await previewUpload(formData, { signal: controller.signal });
                if (disposed || controller.signal.aborted || request !== controller) return 'ignored';
                const result = await res.json();
                if (disposed || controller.signal.aborted || request !== controller) return 'ignored';
                const previewMetadata = result?.metadata as DatasetMetadata;
                if (!previewMetadata || !Array.isArray(previewMetadata.columns)) {
                    throw new Error('Preview response missing metadata');
                }

                uploadProfile.metadata = previewMetadata;
                callbacks.hydrateColumnProfiles(previewMetadata);
                applyPreviewColumnSelection(previewMetadata, callbacks);
                callbacks.renderColumnProfilesGrid(true);
                applyTimeRangeFromMetadata(previewMetadata, true);

                const previewRows = Number(previewMetadata.total_rows || (result as any)?.preview_rows || 0);
                if (!uploadUi.previewTimeColumn && !previewMetadata.time_range) {
                    setUploadPreviewStatus('No time column detected in preview. Please select one from the dropdown before upload.', 'warning');
                } else {
                    setUploadPreviewStatus(`Preview ready (${formatCount(previewRows)} rows)`, 'success');
                }
                setProfileMode('preview');
                return 'ready';
            } catch (e: unknown) {
                if (disposed || controller.signal.aborted || request !== controller || isAbortError(e)) return 'ignored';
                const message = errorMessage(e);
                if (message.includes('Specified time column not found')) {
                    setPreviewTimeColumn(null);
                }
                setUploadPreviewStatus(`Preview failed: ${message}`, 'error');
                toast(`Upload preview failed: ${message}`, 'error', {});
                applyTimeRangeFromMetadata(null, false);
                return 'failed';
            } finally {
                callbacks.signal?.removeEventListener('abort', abort);
                if (request === controller) request = null;
            }
        },
        cancel,
        dispose(): void {
            disposed = true;
            cancel();
        },
    };
}

const timeColumnBindings = new WeakMap<HTMLElement, AbortController>();

// ── Column selection from preview ────────────────────────────────────────────

export function applyPreviewColumnSelection(
    metadata: DatasetMetadata,
    callbacks: PreviewCallbacks,
): void {
    const columns = Array.isArray(metadata?.columns) ? metadata.columns : [];
    const metadataTimeCol = String(metadata?.time_column || '').trim() || null;
    const detectedTimeCol = columns.find((col) => /date|time|ts|timestamp/i.test(String(col?.name || '')))?.name || null;

    setPreviewSelectedColumns(columns
        .map((col) => String(col?.name || '').trim())
        .filter(Boolean));

    const timeColumnExists = uploadUi.previewTimeColumn && columns.some((col) => String(col?.name || '').trim() === uploadUi.previewTimeColumn);
    const calledTimeColumn = metadataTimeCol || detectedTimeCol || (timeColumnExists ? uploadUi.previewTimeColumn : null);
    setPreviewTimeColumn(calledTimeColumn);

    const timeColumnControl = document.getElementById('time-column-select') as HTMLElement | null;
    if (timeColumnControl) {
        setDropdownOptions('time-column-select', [
            { value: '', label: 'Auto-detect' },
            ...columns
                .map((col) => {
                    const name = String(col?.name || '').trim();
                    if (!name) return null;
                    return { value: name, label: `${name} (${col?.dtype || 'unknown'})` };
                })
                .filter((option): option is { value: string; label: string } => option !== null),
        ], { preferredValue: calledTimeColumn || '' });

        if (calledTimeColumn) {
            setDropdownValue('time-column-select', calledTimeColumn);
        } else {
            setDropdownValue('time-column-select', '');
        }

        timeColumnBindings.get(timeColumnControl)?.abort();
        const binding = new AbortController();
        timeColumnBindings.set(timeColumnControl, binding);
        const signal = callbacks.signal ? AbortSignal.any([callbacks.signal, binding.signal]) : binding.signal;
        timeColumnControl.addEventListener('change', () => {
            setPreviewTimeColumn(getDropdownValue('time-column-select') || null);
            callbacks.onTimeColumnChanged();
        }, { signal });
    }
}

// ── Apply time range from metadata ──────────────────────────────────────────

export function applyTimeRangeFromMetadata(metadata: DatasetMetadata | null, overwriteInputs: boolean): void {
    const inputs = getPartialTimeRangeInputs();
    if (!inputs) return;

    const minMs = Number(metadata?.time_range?.min);
    const maxMs = Number(metadata?.time_range?.max);
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
        if (inputs.hint) inputs.hint.textContent = 'Time range not detected in this file.';
        inputs.startInput.min = '';
        inputs.startInput.max = '';
        inputs.endInput.min = '';
        inputs.endInput.max = '';
        return;
    }

    const minLocal = formatToDatetimeLocal(minMs);
    const maxLocal = formatToDatetimeLocal(maxMs);

    inputs.startInput.min = minLocal;
    inputs.startInput.max = maxLocal;
    inputs.endInput.min = minLocal;
    inputs.endInput.max = maxLocal;

    if (overwriteInputs || !inputs.startInput.value) inputs.startInput.value = minLocal;
    if (overwriteInputs || !inputs.endInput.value) inputs.endInput.value = maxLocal;

    if (inputs.hint) {
        inputs.hint.textContent = `Detected: ${formatAnalysisTime(minMs)} → ${formatAnalysisTime(maxMs)}`;
    }
}

// ── Loaded row count helper ──────────────────────────────────────────────────

export function loadedRowCountFromResponse(response: unknown): number {
    if (!response || typeof response !== 'object') return 0;
    const record = response as Record<string, unknown>;
    const count = Number(record.rows ?? record.rows_loaded);
    return Number.isFinite(count) && count >= 0 ? count : 0;
}

// ── Row-count formatting re-export ──────────────────────────────────────────

export { formatUploadRowCountValue } from './partialLoadControls.js';
