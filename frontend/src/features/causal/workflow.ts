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
import type { CausalDeps } from './selectionState.js';
import { getDropdownValueFromElement, setDropdownDisabledForElement } from '../../ui/primitives/Dropdown.js';
import { markDataUpdated } from '../../ui/freshnessIndicator.js';

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
    const methodLabel = method.toUpperCase().replace('PCMCIPLUS', 'PCMCI+');
    const usesPcStage = METHOD_PC_STAGE.has(method);
    let ticks = 0;
    // Abort-before-new: cancel any in-flight compute before starting a new one
    // so a fast-clicking user does not pile up parallel causal runs.
    if (causalComputeController) causalComputeController.abort();
    causalComputeController = new AbortController();
    const signal = causalComputeController.signal;
    let progressId: number | undefined;
    try {
        syncCausalEmptyState(_selectedColumns.size);
        deps.setLoading('causal-compute-btn', 'causal-loading', true, 'Run discovery');
        setStatus(`${methodLabel}: running causal discovery...`);
        setProgress(0, methodLabel + ': preparing');
        progressId = window.setInterval(() => {
            ticks += 1;
            const pct = Math.min(90, (usesPcStage ? 12 : 18) + ticks * 2);
            setProgress(pct, methodLabel + ': ' + (usesPcStage && ticks < 14 ? 'parent selection' : 'conditional tests'));
        }, 320);
        const resp = await fetchCausalGraph(numericSelected, tauMax, alpha, method, 5000, { signal },
            parseFloat((document.getElementById('causal-pc-alpha') as HTMLInputElement | null)?.value || '0.2'),
            test, usesPcStage ? maxCondsDim : undefined, fdrMethod);
        setProgress(100, methodLabel + ': complete');
        window.setTimeout(hideProgress, 800);
        const cols = [...resp.columns, ...manualOnly.filter((col) => !resp.columns.includes(col))];
        const links = uniqueCausalLinks(resp.links);
        setCurrentColumns(cols);
        setCurrentLinks(links);
        setCurrentTauMax(resp.tau_max);
        for (const col of cols) ensureNodeMetadata(col, meta, deps);
        const chartReady = await initChart();
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
        markDataUpdated();
        emitFeatureEvent('workflow:refresh', undefined);
        onComplete?.();
        setStatus(`${methodLabel}: graph updated with ${cols.length} nodes and ${links.length} links.`, 'success');
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            // Superseded by a newer compute run; the newer run owns status UI.
            return;
        }
        hideProgress();
        setStatus(error instanceof Error ? error.message : 'Causal discovery failed.', 'error');
        onComplete?.();
    } finally {
        // Always clear the progress interval, even when aborted.
        if (progressId !== undefined) {
            window.clearInterval(progressId);
            progressId = undefined;
        }
        deps.setLoading('causal-compute-btn', 'causal-loading', false, 'Run discovery');
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
    causalComputeController = null;
    hideProgress();
    setStatus('Causal discovery canceled.');
}

/** Test-only alias for resetting the Causal compute request state. */
export function __resetCausalComputeControllerForTests(): void {
    disposeCausalCompute();
}
