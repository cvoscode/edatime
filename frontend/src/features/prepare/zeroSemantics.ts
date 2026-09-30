import { cleaningPlanStore } from '../../cleaning/store.js';
import { buildPlanRequestSnapshot } from '../../cleaning/compiler.js';
import { hashCleaningPlan } from '../../cleaning/planHash.js';
import { previewCleaningPlan } from '../../cleaning/api.js';
import type { CleaningPlan, DerivedColumnStage } from '../../cleaning/types.js';
import type { DatasetMetadata } from '../../contracts/api/v1/dataset.js';
import type { CorrelationMatrixResponse, FftResponse } from '../../contracts/api/v1/analytics.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import { postJson } from '../../services/api/http.js';
import { formatSamplingCadence } from '../spectralSampling.js';
import type { DriftResponse } from '../../contracts/api/v1/drift.js';

export function zeroMissingStage(column: string): DerivedColumnStage {
    const now = new Date().toISOString();
    return { id: `zero-${crypto.randomUUID()}`, createdAt: now, updatedAt: now,
        kind: 'derivedColumn', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
        sourcePage: 'manual', label: `Treat zeros as missing: ${column}`,
        note: 'Explicit domain decision after impact preview. Zero values become null; timestamps and rows are retained.',
        expression: `nullifzero(${JSON.stringify(column)})`, outputColumn: column };
}

/** A draft is evaluated against immutable source/plan snapshots; it never enters the store until Apply. */
export async function previewZeroImpact(plan: CleaningPlan, stage: DerivedColumnStage, metadata: DatasetMetadata, signal: AbortSignal): Promise<string[]> {
    const candidate = { ...plan, stages: [...plan.stages, stage], planRevision: plan.planRevision + 1 };
    const preview = await previewCleaningPlan(candidate, { signal });
    const plans = [plan, candidate].map(buildPlanRequestSnapshot);
    const matrices = await Promise.all(plans.map((cleaning_plan) => postJson<CorrelationMatrixResponse>(
        apiV1Routes.scatter.correlationMatrix, { mode: 'pearson_raw', cleaning_plan }, 'Zero impact correlations', { signal })));
    const lines: string[] = [];
    const counts = matrices.map((matrix) => {
        const index = matrix.columns.indexOf(stage.outputColumn);
        const count = matrix.counts?.[index]?.[index];
        if (count == null) throw new Error('Exact valid counts were not returned. Update the server and retry the preview.');
        return count;
    });
    lines.push(`Valid ${stage.outputColumn} observations: ${counts[0].toLocaleString()} → ${counts[1].toLocaleString()}; ${(counts[0] - counts[1]).toLocaleString()} zeros become missing.`);
    lines.push(`Rows: ${preview.rowsBefore.toLocaleString()} → ${preview.rowsAfter.toLocaleString()}. No timestamp rows are removed. Missing intervals become visible gaps; filling or dropping them requires a separate rule.`);
    const first = matrices[0]; const second = matrices[1];
    const i = first.columns.indexOf(stage.outputColumn); const k = second.columns.indexOf(stage.outputColumn);
    const changes = first.columns.flatMap((column, j) => {
        if (column === stage.outputColumn) return [];
        const next = second.columns.indexOf(column);
        const before = first.pearson_raw?.[i]?.[j]; const after = second.pearson_raw?.[k]?.[next];
        return [`${column}: ${before?.toFixed(3) ?? 'undefined'} → ${after?.toFixed(3) ?? 'undefined'} (n=${second.counts?.[k]?.[next]?.toLocaleString() ?? 'unknown'})`];
    });
    lines.push(`Pearson levels, full working plan: ${changes.join('; ')}. These serially dependent associations do not establish causation.`);
    const range = metadata.time_range;
    if (!range) return [...lines, 'Spectrum and Drift unavailable: no time range.'];
    const start = new Date(range.min).toISOString(); const end = new Date(range.max).toISOString();
    const referenceEnd = new Date(range.min + Math.min(7 * 86_400_000, (range.max - range.min) / 2)).toISOString();
    const comparisons = await Promise.allSettled([
        Promise.all(plans.map((cleaning_plan) => postJson<FftResponse>(apiV1Routes.analytics.fft,
            { start, end, columns: stage.outputColumn, max_points: 8192, detrend: 'constant', cleaning_plan }, 'Zero impact spectrum', { signal }))),
        Promise.all(plans.map((cleaningPlan) => postJson<DriftResponse>(apiV1Routes.drift.stats,
            { column: stage.outputColumn, window: 'daily', referenceStart: start, referenceEnd, cleaningPlan }, 'Zero impact drift', { signal }))),
    ]);
    const spectrum = comparisons[0];
    if (spectrum.status === 'fulfilled') {
        const descriptions = spectrum.value.map((response) => {
            const peak = response.results[0]?.dominant_peaks[0];
            return peak?.frequency_hz ? formatSamplingCadence(1000 / peak.frequency_hz) : 'no finite peak';
        });
        lines.push(`Spectrum strongest non-DC bin period: ${descriptions.join(' → ')}. Mean removal, Hann window, 8,192-point budget; aggregated missing bins are masked. This is a sensitivity check, not evidence that zeros are invalid.`);
    } else lines.push(`Spectrum preview unavailable: ${String(spectrum.reason)}. Regular timestamps are required.`);
    const drift = comparisons[1];
    if (drift.status === 'fulfilled') {
        const descriptions = drift.value.map((response) => `${response.windows.filter((window) => window.drift_level !== 'green').length}/${response.windows.length} windows flagged${response.metadata?.bin_count_warning || response.metadata?.psi_sample_ratio_warning ? ' (reliability warning)' : ''}`);
        lines.push(`Drift sensitivity: ${descriptions.join(' → ')}. Daily windows, first 7 days or half the range as reference; default unadjusted thresholds. Baseline values and usable counts change with masking.`);
    } else lines.push(`Drift preview unavailable: ${String(drift.reason)}.`);
    return lines;
}

export function createZeroDecisionControls(column: string, metadata: DatasetMetadata): HTMLElement {
    const root = document.createElement('div'); root.className = 'prepare-zero-decision';
    const label = document.createElement('label'); label.textContent = `Meaning of zero in ${column} `;
    const select = document.createElement('select'); select.setAttribute('aria-label', `Meaning of zero in ${column}`);
    for (const [value, text] of [['unresolved', 'Unresolved'], ['valid', 'Valid measured zero'], ['sentinel', 'Suspected missing/offline sentinel']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
    }
    const noteLabel = `Zero interpretation: ${column}`;
    const annotation = cleaningPlanStore.getSnapshot()?.stages.find((stage) => stage.kind === 'annotation' && stage.label === noteLabel);
    select.value = annotation?.note || 'unresolved';
    label.append(select);
    const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'btn btn-ghost btn-sm';
    preview.textContent = `Preview zero-as-missing: ${column}`; preview.hidden = select.value !== 'sentinel';
    const status = document.createElement('div'); status.setAttribute('role', 'status');
    const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'btn btn-primary btn-sm';
    apply.textContent = `Apply zero-as-missing: ${column}`; apply.hidden = true;
    let checkedPlan: string | null = null; let proposed: DerivedColumnStage | null = null;
    let controller: AbortController | null = null;
    select.addEventListener('change', () => {
        controller?.abort(); apply.hidden = true; checkedPlan = null;
        const plan = cleaningPlanStore.getSnapshot(); if (!plan) return;
        const current = plan.stages.find((stage) => stage.kind === 'annotation' && stage.label === noteLabel);
        if (current) cleaningPlanStore.updateStage(current.id, { note: select.value });
        else cleaningPlanStore.addStage({ kind: 'annotation', executionClass: 'annotation', scope: 'annotation', sourcePage: 'manual', enabled: true, label: noteLabel, note: select.value, severity: select.value === 'sentinel' ? 'warning' : 'info' });
        preview.hidden = select.value !== 'sentinel';
    });
    preview.addEventListener('click', async () => {
        const plan = cleaningPlanStore.getSnapshot(); if (!plan) return;
        controller?.abort(); controller = new AbortController(); const activeController = controller;
        proposed = zeroMissingStage(column); const stage = proposed;
        const key = hashCleaningPlan(plan); apply.hidden = true; preview.disabled = true;
        status.textContent = 'Computing a draft impact preview; the working data are unchanged…';
        try {
            const lines = await previewZeroImpact(plan, stage, metadata, controller.signal);
            const current = cleaningPlanStore.getSnapshot();
            if (activeController.signal.aborted) return;
            if (!current || hashCleaningPlan(current) !== key) throw new Error('The dataset or plan changed. Preview again before applying.');
            const list = document.createElement('ul');
            for (const line of lines) { const item = document.createElement('li'); item.textContent = line; list.append(item); }
            status.replaceChildren(list); checkedPlan = key; apply.hidden = false;
        } catch (error) { if (!activeController.signal.aborted) status.textContent = `Preview failed: ${error instanceof Error ? error.message : String(error)}`; }
        finally { if (controller === activeController) preview.disabled = false; }
    });
    apply.addEventListener('click', () => {
        const current = cleaningPlanStore.getSnapshot();
        if (!current || !proposed || hashCleaningPlan(current) !== checkedPlan || select.value !== 'sentinel') {
            apply.hidden = true; status.textContent = 'Settings changed. Preview again before applying.'; return;
        }
        cleaningPlanStore.addStage(proposed); apply.hidden = true;
    });
    root.append(label, preview, status, apply); return root;
}
