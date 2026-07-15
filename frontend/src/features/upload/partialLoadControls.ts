/**
 * Partial load controls — n_rows, skip_rows, time_start, time_end.
 * Owns DOM state and formatting for the partial-load input group.
 */
import { formatAnalysisTime, formatToDatetimeLocal } from '../../utils/format.js';
import type { DatasetMetadata } from '../../types/api.js';

// ── Constants ──────────────────────────────────────────────────────────────

// ── Time-range inputs ──────────────────────────────────────────────────────

export interface PartialTimeRangeInputs {
    startInput: HTMLInputElement;
    endInput: HTMLInputElement;
    hint: HTMLElement | null;
}

export function getPartialTimeRangeInputs(): PartialTimeRangeInputs | null {
    const startInput = document.getElementById('time-start-input') as HTMLInputElement | null;
    const endInput = document.getElementById('time-end-input') as HTMLInputElement | null;
    if (!startInput || !endInput) return null;

    return {
        startInput,
        endInput,
        hint: document.getElementById('time-range-hint'),
    };
}

export function clearPartialTimeRangeInputs(inputs: PartialTimeRangeInputs): void {
    if (inputs.hint) inputs.hint.textContent = 'Time range not detected in this file.';
    inputs.startInput.min = '';
    inputs.startInput.max = '';
    inputs.endInput.min = '';
    inputs.endInput.max = '';
}

export function setPartialTimeRangeInputs(
    inputs: PartialTimeRangeInputs,
    minLocal: string,
    maxLocal: string,
    overwriteInputs: boolean,
): void {
    inputs.startInput.min = minLocal;
    inputs.startInput.max = maxLocal;
    inputs.endInput.min = minLocal;
    inputs.endInput.max = maxLocal;

    if (overwriteInputs || !inputs.startInput.value) inputs.startInput.value = minLocal;
    if (overwriteInputs || !inputs.endInput.value) inputs.endInput.value = maxLocal;
}

// ── Metadata → inputs ───────────────────────────────────────────────────────

export function applyPartialTimeRangeFromMetadata(
    metadata: DatasetMetadata | null,
    overwriteInputs = true,
): void {
    const inputs = getPartialTimeRangeInputs();
    if (!inputs) return;

    const minMs = Number(metadata?.time_range?.min);
    const maxMs = Number(metadata?.time_range?.max);
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
        clearPartialTimeRangeInputs(inputs);
        return;
    }

    const minLocal = formatToDatetimeLocal(minMs);
    const maxLocal = formatToDatetimeLocal(maxMs);

    setPartialTimeRangeInputs(inputs, minLocal, maxLocal, overwriteInputs);

    if (inputs.hint) {
        inputs.hint.textContent = `Detected: ${formatAnalysisTime(minMs)} → ${formatAnalysisTime(maxMs)}`;
    }
}

// ── Row-count formatting ────────────────────────────────────────────────────

export function formatUploadRowCountValue(rowCount: number): string {
    return rowCount >= 1_000_000
        ? (rowCount / 1_000_000).toFixed(1) + 'M'
        : rowCount >= 1_000 ? (rowCount / 1_000).toFixed(0) + 'K' : String(rowCount);
}

// ── Validation ──────────────────────────────────────────────────────────────

export function validateFileSize(file: File | null): string | null {
    if (!file) return 'Please select a file first.';
    const name = String(file.name || '').toLowerCase();
    if (!(name.endsWith('.csv') || name.endsWith('.parquet'))) {
        return 'Only CSV and Parquet files are supported.';
    }
    // Do not duplicate a fixed browser-side size cap here. The server owns
    // configurable admission and can evolve from resident uploads to
    // scan-backed streaming without the UI rejecting an otherwise supported
    // source before it reaches that policy.
    return null;
}

// ── Form building ────────────────────────────────────────────────────────────

export interface PartialLoadParams {
    partialEnabled: boolean;
    nRowsInput: HTMLInputElement;
    skipInput: HTMLInputElement;
    timeStartInput: HTMLInputElement | null;
    timeEndInput: HTMLInputElement | null;
}

export function buildPartialLoadFormData(params: PartialLoadParams, formData: FormData): { valid: boolean; error?: string } {
    if (!params.partialEnabled) return { valid: true };

    const nRows = parseInt(params.nRowsInput.value, 10);
    const skipRows = parseInt(params.skipInput.value, 10) || 0;
    if (!isNaN(nRows) && nRows > 0) {
        formData.append('n_rows', String(nRows));
    } else {
        return { valid: false, error: 'Enter a valid Max rows value for partial load.' };
    }
    if (skipRows > 0) formData.append('skip_rows', String(skipRows));

    const toIsoOrNull = (v: string): string | null => {
        const s = (v || '').trim();
        if (!s) return null;
        const ms = Date.parse(s);
        if (!Number.isFinite(ms)) return null;
        return new Date(ms).toISOString();
    };
    const tStartIso = toIsoOrNull(params.timeStartInput?.value || '');
    const tEndIso = toIsoOrNull(params.timeEndInput?.value || '');
    if (tStartIso && tEndIso && Date.parse(tStartIso) > Date.parse(tEndIso)) {
        return { valid: false, error: 'Start time must be before end time.' };
    }
    if (tStartIso) formData.append('time_start', tStartIso);
    if (tEndIso) formData.append('time_end', tEndIso);

    return { valid: true };
}
