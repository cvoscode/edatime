/**
 * Preview controller — manages file preview lifecycle.
 *
 * Handles: status display, abort controller, metadata hydration,
 * column selection from preview response.
 */
import {
    previewUpload,
} from '../../services/api/index.js';
import { datasetState, setMetadata } from '../../store/datasetState.js';
import { setPreviewSelectedColumns, setPreviewTimeColumn, uiState } from '../../store/uiState.js';
import { formatCount, formatAnalysisTime, formatToDatetimeLocal } from '../../utils/format.js';
import { getPartialTimeRangeInputs } from './partialLoadControls.js';
import { toast } from '../../utils/toast.js';
import { getDropdownValue, setDropdownOptions, setDropdownValue } from '../../ui/primitives/Dropdown.js';
import type { DatasetMetadata } from '../../types/api.js';

// ── Status display ───────────────────────────────────────────────────────────

export function setUploadPreviewStatus(text: string, kind = ''): void {
    const el = document.getElementById('upload-preview-status');
    if (!el) return;
    el.textContent = text;
    el.className = `upload-preview-status ${kind}`.trim();
}

// ── Profile mode badge ──────────────────────────────────────────────────────

export function setProfileMode(mode: 'dataset' | 'preview'): void {
    const badge = document.getElementById('profile-mode-badge');
    if (!badge) return;
    badge.setAttribute('data-mode', mode);
    badge.textContent = mode === 'preview' ? 'Upload preview' : 'Current dataset';
}

// ── Preview lifecycle ───────────────────────────────────────────────────────

let _previewController: AbortController | null = null;

export function abortPreview(): void {
    if (_previewController) {
        _previewController.abort();
        _previewController = null;
    }
}

export interface PreviewCallbacks {
    hydrateColumnProfiles: (metadata: DatasetMetadata) => void;
    renderColumnProfilesGrid: (resetScroll: boolean) => void;
    onTimeColumnChanged: (file: File) => void;
}

export async function runFilePreview(
    file: File,
    callbacks: PreviewCallbacks,
): Promise<void> {
    if (!file) {
        setUploadPreviewStatus('Select a file to preview columns');
        return;
    }
    if (_previewController) _previewController.abort();
    _previewController = new AbortController();
    setUploadPreviewStatus('Profiling file…', 'loading');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const timeColumn = String(uiState.previewTimeColumn || '').trim();
        if (timeColumn) formData.append('time_column', timeColumn);

        const res = await previewUpload(formData, { signal: _previewController.signal });
        if (!res.ok) {
            const txt = await res.text().catch(() => 'Preview failed');
            throw new Error(txt || 'Preview failed');
        }
        const result = await res.json();
        const previewMetadata = result?.metadata as DatasetMetadata;
        if (!previewMetadata || !Array.isArray(previewMetadata.columns)) {
            throw new Error('Preview response missing metadata');
        }

        setMetadata(previewMetadata);
        callbacks.hydrateColumnProfiles(previewMetadata);
        applyPreviewColumnSelection(previewMetadata, callbacks);
        callbacks.renderColumnProfilesGrid(true);
        applyTimeRangeFromMetadata(previewMetadata, true);

        const previewRows = Number(previewMetadata.total_rows || (result as any)?.preview_rows || 0);
        if (!uiState.previewTimeColumn && !previewMetadata.time_range) {
            setUploadPreviewStatus('No time column detected in preview. Please select one from the dropdown before upload.', 'warning');
        } else {
            setUploadPreviewStatus(`Preview ready (${formatCount(previewRows)} rows)`, 'success');
        }
        setProfileMode('preview');
    } catch (e: unknown) {
        if ((e as Error)?.name === 'AbortError') return;
        if (String((e as Error)?.message || '').includes('Specified time column not found')) {
            setPreviewTimeColumn(null);
        }
        setUploadPreviewStatus(`Preview failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        toast(`Upload preview failed: ${e instanceof Error ? e.message : String(e)}`, 'error', {});
        applyTimeRangeFromMetadata(null, false);
    }
}

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

    const timeColumnExists = uiState.previewTimeColumn && columns.some((col) => String(col?.name || '').trim() === uiState.previewTimeColumn);
    const calledTimeColumn = metadataTimeCol || detectedTimeCol || (timeColumnExists ? uiState.previewTimeColumn : null);
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

        timeColumnControl.onchange = () => {
            setPreviewTimeColumn(getDropdownValue('time-column-select') || null);
            const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
            const file = fileInput?.files?.[0] || null;
            if (file) callbacks.onTimeColumnChanged(file);
        };
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
