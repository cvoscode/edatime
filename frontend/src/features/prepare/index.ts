import { buildPipelineGraph, renderPipelineGraphSvg } from '../../cleaning/pipelineGraph.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import type { CleaningPlan } from '../../cleaning/types.js';

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
}

function renderPrepareWorkspace(root: HTMLElement, plan: CleaningPlan | null): void {
    root.replaceChildren();
    const header = createElement('div', 'prepare-workspace__header');
    const heading = createElement('div');
    const title = createElement('h1', 'page-header__title');
    title.textContent = 'Prepare';
    const copy = createElement('p', 'prepare-workspace__copy');
    copy.textContent = 'Review the reversible preprocessing pipeline before materializing a new dataset version.';
    heading.append(title, copy);
    const openWorkbench = createElement('button', 'btn btn-primary btn-sm');
    openWorkbench.type = 'button';
    openWorkbench.textContent = 'Open Pipeline Workbench';
    openWorkbench.disabled = !plan;
    openWorkbench.addEventListener('click', () => document.getElementById('open-cleaning-plan-btn')?.click());
    header.append(heading, openWorkbench);

    const identity = createElement('section', 'prepare-workspace__identity');
    identity.setAttribute('aria-label', 'Pipeline source identity');
    if (!plan) {
        identity.textContent = 'Load a dataset to create and inspect a preprocessing plan.';
        root.append(header, identity);
        return;
    }
    const activeStages = plan.stages.filter((stage) => stage.enabled && stage.executionClass !== 'annotation').length;
    identity.textContent = 'Source ' + plan.sourceVersionId + ' · revision ' + String(plan.datasetRevision)
        + ' · ' + String(activeStages) + ' active executable stage' + (activeStages === 1 ? '' : 's');

    const graphSection = createElement('section', 'prepare-workspace__graph');
    const graphTitle = createElement('h2');
    graphTitle.textContent = 'Current pipeline';
    const graphCopy = createElement('p', 'prepare-workspace__copy');
    graphCopy.textContent = 'This overview is derived directly from the active canonical plan. Use the workbench to edit stages, preview impacts, export, or materialize.';
    const graphScroll = createElement('div', 'prepare-workspace__graph-scroll');
    graphScroll.innerHTML = renderPipelineGraphSvg(buildPipelineGraph(plan));
    graphSection.append(graphTitle, graphCopy, graphScroll);
    root.append(header, identity, graphSection);
}

/** Lazy page surface for orienting a data scientist before opening the editor overlay. */
export function initPreparePage(): () => void {
    const root = document.getElementById('prepare-workspace');
    if (!root) return () => {};
    const render = () => renderPrepareWorkspace(root, cleaningPlanStore.getSnapshot());
    render();
    return cleaningPlanStore.subscribe(render);
}
