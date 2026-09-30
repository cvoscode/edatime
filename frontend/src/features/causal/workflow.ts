import { estimateAnalysisSampling, formatAnalysisSamplingContext, formatAnalysisTimeRange, formatSamplingCadence } from '../spectralSampling.js';
/**
 * causal/workflow — workflow control helpers.
 *
 * Encapsulates:
 *   - Method-control enable/disable rules
 *   - Add-edge mode action wiring
 *   - Compute button request/response flow
 */

import { fetchCausalGraph } from '../../services/api/index.js';
import { emitFeatureEvent } from '../../platform/featureEvents.js';
import { notifyCausalGraphUpdated } from './causalComparison.js';
import {
    _selectedColumns,
    _addEdgeMode,
    setAddEdgeMode,
    setAddEdgeFirst,
    setCurrentColumns,
    setCurrentLinks,
    setCurrentTauMax,
    setCurrentSampling,
    isNumericColumn,
    ensureNodeMetadata,
    uniqueCausalLinks,
    workspaceMetadata,
} from './selectionState.js';
import {
    hideProgress,
    setProgress,
    setStatus,
    showCausalGraphRenderFailure,
    syncCausalEmptyState,
} from './statusView.js';
import { initChart, renderEChartsGraph } from './graphView.js';
import { syncCausalComputeActionState } from './chipPanel.js';
import type { CausalDeps } from './selectionState.js';
import { getDropdownValueFromElement, setDropdownDisabledForElement } from '../../ui/primitives/Dropdown.js';
import { markDataUpdated } from '../../ui/freshnessIndicator.js';
import { beginCompletedAnalysisExportContext } from '../../utils/exportProvenanceContext.js';

export const METHOD_PC_STAGE = new Set(['pcmci', 'pcmciplus', 'lpcmci']);

const TEST_LABELS: Readonly<Record<string, string>> = {
    par_corr: 'ParCorr',
    robust_parcorr: 'RobustParCorr',
    cmi_knn: 'CMI-KNN',
    gsquared: 'G-squared',
    cmi_symb: 'CMI-Symb',
};

/** Build the compact, method-aware summary shown on the collapsed control. */
export function buildCausalParameterSummary(input: {
    method: string;
    test: string;
    tauMax: string;
    alpha: string;
    pcAlpha: string;
    maxConds: string;
    fdr: string;
}): string {
    const parts = [
        TEST_LABELS[input.test] ?? input.test,
        `tau ${input.tauMax || '3'}`,
        `alpha ${input.alpha || '0.05'}`,
    ];
    if (METHOD_PC_STAGE.has(input.method)) {
        parts.push(`PC alpha ${input.pcAlpha || '0.2'}`);
        parts.push(`max conds ${input.maxConds || 'auto'}`);
    }
    parts.push(input.fdr === 'fdr_bh' ? 'BH FDR' : 'no FDR');
    return parts.join(' · ');
}

export function syncCausalParameterSummary(): void {
    const summary = document.getElementById('causal-parameters-summary');
    if (!summary) return;
    summary.textContent = buildCausalParameterSummary({
        method: getDropdownValueFromElement(document.getElementById('causal-method-select')) || 'pcmci',
        test: getDropdownValueFromElement(document.getElementById('causal-test-select')) || 'par_corr',
        tauMax: (document.getElementById('causal-tau-max') as HTMLInputElement | null)?.value ?? '3',
        alpha: (document.getElementById('causal-alpha') as HTMLInputElement | null)?.value ?? '0.05',
        pcAlpha: (document.getElementById('causal-pc-alpha') as HTMLInputElement | null)?.value ?? '0.2',
        maxConds: (document.getElementById('causal-max-conds') as HTMLInputElement | null)?.value ?? '',
        fdr: getDropdownValueFromElement(document.getElementById('causal-fdr-select')) || 'none',
    });
}

export function syncCausalGraphActionState(hasGraph: boolean): void {
    const addEdgeBtn = document.getElementById('causal-add-edge-btn') as HTMLButtonElement | null;
    const exportBtn = document.getElementById('causal-export-btn') as HTMLButtonElement | null;
    const exportMenu = document.getElementById('causal-export-menu') as HTMLElement | null;
    const saveRunBtn = document.getElementById('causal-save-run-btn') as HTMLButtonElement | null;

    const syncAction = (button: HTMLButtonElement | null, enabledTitle: string) => {
        if (!button) return;
        button.disabled = !hasGraph;
        button.title = hasGraph ? enabledTitle : 'Run discovery first';
    };
    syncAction(addEdgeBtn, 'Click two nodes to add an edge between them');
    syncAction(exportBtn, 'Export graph');
    syncAction(saveRunBtn, 'Save this causal run for comparison');
    if (!hasGraph && exportMenu) exportMenu.hidden = true;
}

// ─── Control helpers ─────────────────────────────────────────────────────────

function controlDecorators(control: HTMLElement | null): HTMLElement[] {
    if (!control) return [];
    const out: HTMLElement[] = [control];
    const prev = control.previousElementSibling as HTMLElement | null;
    const next = control.nextElementSibling as HTMLElement | null;
    if (prev) out.push(prev);
    if (next?.classList.contains('toolbar-info-icon')) out.push(next);
    return out;
}

export function setControlEnabled(control: HTMLElement | null, enabled: boolean, title: string): void {
    if (!control) return;
    if (control instanceof HTMLInputElement) control.disabled = !enabled;
    else setDropdownDisabledForElement(control, !enabled);
    control.title = enabled ? '' : title;
    for (const el of controlDecorators(control)) {
        el.classList.toggle('causal-setting-disabled', !enabled);
        if (!enabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
    }
}

export function applyMethodControlState(method: string): void {
    const pcAlphaInput = document.getElementById('causal-pc-alpha') as HTMLInputElement | null;
    const maxCondsInput = document.getElementById('causal-max-conds') as HTMLInputElement | null;
    const usesPcStage = METHOD_PC_STAGE.has(method);
    setControlEnabled(pcAlphaInput, usesPcStage, method.toUpperCase() + ' does not use PC alpha.');
    setControlEnabled(maxCondsInput, usesPcStage, method.toUpperCase() + ' does not use max conditioning sets.');
    syncCausalParameterSummary();
}

function causalScope(deps: CausalDeps) {
    const snapshot = deps.workspace.getSnapshot();
    const time = snapshot.dataset.metadata?.time_range;
    const viewport = snapshot.viewport;
    const useViewport = getDropdownValueFromElement(document.getElementById('causal-range')) === 'viewport';
    const startMs = useViewport ? viewport?.xMin : time?.min;
    const endMs = useViewport ? viewport?.xMax : time?.max;
    const range = Number.isFinite(startMs) && Number.isFinite(endMs) && startMs! < endMs!
        ? { startMs: startMs!, endMs: endMs! } : null;
    const maxPoints = Number((document.getElementById('causal-point-budget') as HTMLInputElement | null)?.value || 5000);
    return { range, maxPoints };
}

export function syncCausalSamplingEstimate(deps: CausalDeps): void {
    const scope = causalScope(deps);
    const sampling = estimateAnalysisSampling(deps.workspace.getSnapshot().dataset.metadata, scope.range, scope.maxPoints);
    const hint = document.getElementById('causal-scope-estimate');
    const tau = Number((document.getElementById('causal-tau-max') as HTMLInputElement | null)?.value || 3);
    if (hint) hint.textContent = sampling ? `Source-based estimate: ${sampling.output_points.toLocaleString()} / ${sampling.input_points.toLocaleString()} points; lag 1 ≈ ${formatSamplingCadence(sampling.effective_cadence_ms)}, max lag ≈ ${formatSamplingCadence(tau * Number(sampling.effective_cadence_ms))}. ${formatAnalysisTimeRange(sampling) ? `${formatAnalysisTimeRange(sampling)}. ` : ''}Working-plan counts are checked on run; averaging can change discovered relationships. Use the Signals viewport or raise the budget to retain shorter lags.` : 'Select a valid range on Signals before using its viewport.';
}

// ─── Add-edge mode ────────────────────────────────────────────────────────────

export function toggleAddEdgeMode(addEdgeBtn: HTMLButtonElement | null): void {
    setAddEdgeMode(!_addEdgeMode);
    setAddEdgeFirst(null);
    setStatus(_addEdgeMode ? 'Add-edge mode enabled. Click two nodes to connect them.' : 'Add-edge mode canceled.');
    if (addEdgeBtn) {
        addEdgeBtn.classList.toggle('btn-accent', !_addEdgeMode);
        addEdgeBtn.classList.toggle('btn-ghost', _addEdgeMode);
    }
}

export function cancelAddEdgeMode(addEdgeBtn: HTMLButtonElement | null): void {
    setAddEdgeMode(false);
    setAddEdgeFirst(null);
    setStatus('Add-edge mode canceled.');
    if (addEdgeBtn) {
        addEdgeBtn.classList.remove('btn-accent');
        addEdgeBtn.classList.add('btn-ghost');
    }
}

// ─── Compute button ───────────────────────────────────────────────────────────

export async function handleComputeClick(
    deps: CausalDeps,
    methodSelect: HTMLElement | null,
    tauInput: HTMLInputElement | null,
    alphaInput: HTMLInputElement | null,
    maxCondsInput: HTMLInputElement | null,
    testSelect: HTMLElement | null,
    fdrSelect: HTMLElement | null,
    onComplete?: () => void,
): Promise<void> {
    const meta = workspaceMetadata(deps);
    const allSelected = Array.from(_selectedColumns);
    const numericSelected = allSelected.filter((col) => isNumericColumn(col, meta));
    const manualOnly = allSelected.filter((col) => !isNumericColumn(col, meta));
    if (numericSelected.length < 2) {
        setStatus('Select at least 2 numeric columns before computing a causal graph.', 'error');
        return;
    }
    const method = getDropdownValueFromElement(methodSelect) || 'pcmci';
    const tauMax = parseInt(tauInput?.value || '3', 10);
    const alpha = parseFloat(alphaInput?.value || '0.05');
    const test = getDropdownValueFromElement(testSelect) || 'par_corr';
    const maxCondsDim = maxCondsInput?.value ? parseInt(maxCondsInput.value, 10) : undefined;
    const fdrMethod = getDropdownValueFromElement(fdrSelect) || 'none';
    const pcAlpha = parseFloat((document.getElementById('causal-pc-alpha') as HTMLInputElement | null)?.value || '0.2');
    const methodLabel = method.toUpperCase().replace('PCMCIPLUS', 'PCMCI+');
    const usesPcStage = METHOD_PC_STAGE.has(method);
    const scope = causalScope(deps);
    if (!Number.isInteger(scope.maxPoints) || scope.maxPoints < 100 || scope.maxPoints > 50000) {
        setStatus('Causal point budget must be an integer between 100 and 50,000.', 'error'); return;
    }
    if (!scope.range && getDropdownValueFromElement(document.getElementById('causal-range')) === 'viewport') {
        setStatus('Select a valid time range on Signals first.', 'error'); return;
    }
    const range = scope.range ? { start: new Date(scope.range.startMs).toISOString(), end: new Date(scope.range.endMs).toISOString() } : undefined;
    const completeAnalysisProvenance = beginCompletedAnalysisExportContext({
        pageName: 'causal',
        controls: {
            columns: numericSelected.join(', '),
            method,
            test,
            tauMax,
            alpha,
            pcAlpha,
            maxCondsDim: usesPcStage ? maxCondsDim ?? null : null,
            fdrMethod,
            maxPoints: scope.maxPoints,
            start: range?.start ?? 'full working range', end: range?.end ?? 'full working range',
            engine: 'Native Rust', interpretation: 'Exploratory conditional-dependence evidence', 
        },
    });
    // Abort-before-new: cancel any in-flight compute before starting a new one
    // so a fast-clicking user does not pile up parallel causal runs.
    causalComputeController?.abort();
    const controller = new AbortController();
    causalComputeController = controller;
    const signal = controller.signal;
    const isCurrent = () => causalComputeController === controller && !signal.aborted;
    try {
        syncCausalEmptyState(_selectedColumns.size);
        deps.setLoading('causal-compute-btn', 'causal-loading', true, 'Run discovery');
        syncCausalComputeActionState(deps);
        setStatus(`${methodLabel}: running causal discovery...`);
        setProgress(`${methodLabel}: computing on ${numericSelected.length} selected series`);
        const resp = await fetchCausalGraph(numericSelected, tauMax, alpha, method, scope.maxPoints, { signal },
            pcAlpha,
            test, usesPcStage ? maxCondsDim : undefined, fdrMethod, range);
        if (!isCurrent()) return;
        setProgress(`${methodLabel}: results received; rendering graph`);
        const cols = [...resp.columns, ...manualOnly.filter((col) => !resp.columns.includes(col))];
        const links = uniqueCausalLinks(resp.links);
        const chartReady = await initChart();
        if (!isCurrent()) return;
        setCurrentColumns(cols);
        setCurrentLinks(links);
        setCurrentTauMax(resp.tau_max);
        setCurrentSampling(resp.sampling ?? null);
        const samplingContext = document.getElementById('causal-sampling-context');
        if (samplingContext) {
            samplingContext.hidden = false;
            samplingContext.textContent = resp.sampling
                ? [
                    formatAnalysisSamplingContext(resp.sampling),
                    `lag 1 = ${formatSamplingCadence(resp.sampling.effective_cadence_ms)}; max lag = ${formatSamplingCadence(resp.tau_max * Number(resp.sampling.effective_cadence_ms))}`,
                    formatAnalysisTimeRange(resp.sampling),
                ].filter(Boolean).join(' · ')
                : 'Sampling metadata was not returned; lag duration is unknown.';
        }
        for (const col of cols) ensureNodeMetadata(col, meta, deps);
        const graphRendered = chartReady && renderEChartsGraph();
        syncCausalGraphActionState(graphRendered && links.length > 0 && cols.length >= 2);
        if (!graphRendered) {
            showCausalGraphRenderFailure(cols.length, links.length);
            setStatus(
                `${methodLabel}: discovery returned ${cols.length} nodes and ${links.length} links, but the graph could not be displayed. Resize or revisit the page and try again.`,
                'error',
            );
            return;
        }
        syncCausalEmptyState(cols.length, true);
        notifyCausalGraphUpdated(cols, links);
        completeAnalysisProvenance(resp.executionIdentity ?? null, { sampling: JSON.stringify(resp.sampling ?? null), sampleCount: resp.sample_count ?? null });
        markDataUpdated();
        emitFeatureEvent('workflow:refresh', undefined);
        onComplete?.();
        setStatus(`${methodLabel}: graph updated with ${cols.length} nodes and ${links.length} links.`, 'success');
    } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof Error && error.name === 'AbortError') {
            setStatus('Causal discovery canceled.', 'info');
            return;
        }
        setStatus(error instanceof Error ? error.message : 'Causal discovery failed.', 'error');
        onComplete?.();
    } finally {
        // A superseded run must not hide or re-enable controls owned by its replacement.
        if (causalComputeController === controller) {
            causalComputeController = null;
            hideProgress();
            deps.setLoading('causal-compute-btn', 'causal-loading', false, 'Run discovery');
            syncCausalComputeActionState(deps);
            if (signal.aborted) setStatus('Causal discovery canceled.', 'info');
        }
    }
}

/** Module-level controller for the latest causal compute run. */
let causalComputeController: AbortController | null = null;

/** Cancel the active Causal compute request when its feature lifetime ends. */
export function disposeCausalCompute(): void {
    if (causalComputeController) causalComputeController.abort();
    causalComputeController = null;
}

/** Cancel the active request from the visible compute overlay. */
export function cancelCausalCompute(): void {
    if (!causalComputeController) return;
    causalComputeController.abort();
    setStatus('Canceling causal discovery…');
}

/** Test-only alias for resetting the Causal compute request state. */
export function __resetCausalComputeControllerForTests(): void {
    disposeCausalCompute();
}
