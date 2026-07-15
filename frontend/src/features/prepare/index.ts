import { buildPipelineGraph, renderPipelineGraphSvg } from '../../cleaning/pipelineGraph.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import type { CleaningPlan } from '../../cleaning/types.js';
import '../../../css/modules/prepare.css';

export interface PreparePageDeps {
    onPlanChanged?: () => void;
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
}

function stageSummary(stage: CleaningPlan['stages'][number]): string {
    switch (stage.kind) {
        case 'timeRange': return (stage.mode === 'keepInside' ? 'Keep' : 'Drop') + ' time range';
        case 'columnRange': return (stage.mode === 'keepInside' ? 'Keep' : 'Drop') + ' ' + stage.column + ' values';
        case 'adaptiveLine': return (stage.keepAbove ? 'Keep above' : 'Keep below') + ' line for ' + stage.column;
        case 'missingValue': return 'Drop ' + (stage.dropNulls ? 'null' : '') + (stage.dropNulls && stage.dropNonFinite ? ' and ' : '') + (stage.dropNonFinite ? 'non-finite' : '') + ' ' + stage.column + ' rows';
        case 'annotation': return 'Annotation';
    }
}

function actionButton(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = createElement('button', 'btn btn-ghost btn-sm');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
}

function checkbox(label: string, name: string, checked: boolean): HTMLLabelElement {
    const field = createElement('label', 'prepare-workspace__policy-checkbox');
    const input = createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = checked;
    const caption = createElement('span');
    caption.textContent = label;
    field.append(input, caption);
    return field;
}

function renderPrepareWorkspace(root: HTMLElement, plan: CleaningPlan | null, deps: PreparePageDeps): void {
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
        + ' · ' + String(activeStages) + ' active executable stage' + (activeStages === 1 ? '' : 's')
        + ' · ' + (cleaningPlanStore.isDirty() ? 'unmaterialized changes' : 'source baseline');

    const graphSection = createElement('section', 'prepare-workspace__graph');
    const graphTitle = createElement('h2');
    graphTitle.textContent = 'Current pipeline';
    const graphCopy = createElement('p', 'prepare-workspace__copy');
    graphCopy.textContent = 'This overview is derived directly from the active canonical plan. Use the workbench to edit stages, preview impacts, export, or materialize.';
    const graphScroll = createElement('div', 'prepare-workspace__graph-scroll');
    graphScroll.innerHTML = renderPipelineGraphSvg(buildPipelineGraph(plan));
    graphSection.append(graphTitle, graphCopy, graphScroll);

    const stagesSection = createElement('section', 'prepare-workspace__stages');
    const stageTitle = createElement('h2');
    stageTitle.textContent = 'Ordered stages';
    const stageCopy = createElement('p', 'prepare-workspace__copy');
    stageCopy.textContent = 'These controls change the active canonical plan. Open the workbench to edit stage parameters, preview impacts, export, or materialize.';
    const history = createElement('div', 'prepare-workspace__history');
    history.append(
        actionButton('Undo', () => { if (cleaningPlanStore.undo()) deps.onPlanChanged?.(); }, !cleaningPlanStore.canUndo()),
        actionButton('Redo', () => { if (cleaningPlanStore.redo()) deps.onPlanChanged?.(); }, !cleaningPlanStore.canRedo()),
    );
    const addPolicy = createElement('form', 'prepare-workspace__policy-form');
    const policyTitle = createElement('h3');
    policyTitle.textContent = 'Add missing-value policy';
    const policyColumn = createElement('input', 'modal-input');
    policyColumn.name = 'column';
    policyColumn.placeholder = 'Numeric column';
    policyColumn.required = true;
    policyColumn.setAttribute('aria-label', 'Numeric column');
    const policySubmit = actionButton('Add policy', () => {});
    policySubmit.type = 'submit';
    const policyStatus = createElement('p', 'prepare-workspace__policy-status');
    policyStatus.setAttribute('aria-live', 'polite');
    addPolicy.append(
        policyTitle,
        policyColumn,
        checkbox('Drop null rows', 'dropNulls', true),
        checkbox('Drop non-finite rows', 'dropNonFinite', true),
        policySubmit,
        policyStatus,
    );
    addPolicy.addEventListener('submit', (event) => {
        event.preventDefault();
        const column = policyColumn.value.trim();
        const dropNulls = (addPolicy.elements.namedItem('dropNulls') as HTMLInputElement).checked;
        const dropNonFinite = (addPolicy.elements.namedItem('dropNonFinite') as HTMLInputElement).checked;
        if (!column) {
            policyStatus.textContent = 'Choose a numeric column.';
            return;
        }
        if (!dropNulls && !dropNonFinite) {
            policyStatus.textContent = 'Choose null removal, non-finite removal, or both.';
            return;
        }
        cleaningPlanStore.addStage({
            kind: 'missingValue', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'manual', label: 'Drop missing values from ' + column,
            column, dropNulls, dropNonFinite,
        });
        deps.onPlanChanged?.();
    });
    const list = createElement('ol', 'prepare-workspace__stage-list');
    if (plan.stages.length === 0) {
        const empty = createElement('li', 'prepare-workspace__empty');
        empty.textContent = 'No transformations have been added yet. Create one from Timeseries or open the workbench.';
        list.append(empty);
    }
    for (const [index, stage] of plan.stages.entries()) {
        const item = createElement('li', 'prepare-workspace__stage');
        const summary = createElement('div', 'prepare-workspace__stage-summary');
        const label = createElement('strong');
        label.textContent = stage.label || stage.kind;
        const detail = createElement('span');
        detail.textContent = stageSummary(stage) + (stage.enabled ? '' : ' · disabled');
        summary.append(label, detail);
        const controls = createElement('div', 'prepare-workspace__stage-controls');
        controls.append(
            actionButton(stage.enabled ? 'Disable' : 'Enable', () => {
                cleaningPlanStore.setStageEnabled(stage.id, !stage.enabled);
                deps.onPlanChanged?.();
            }),
            actionButton('Up', () => {
                cleaningPlanStore.reorderStage(stage.id, index - 1);
                deps.onPlanChanged?.();
            }, index === 0),
            actionButton('Down', () => {
                cleaningPlanStore.reorderStage(stage.id, index + 1);
                deps.onPlanChanged?.();
            }, index === plan.stages.length - 1),
            actionButton('Remove', () => {
                cleaningPlanStore.removeStage(stage.id);
                deps.onPlanChanged?.();
            }),
        );
        item.append(summary, controls);
        list.append(item);
    }
    stagesSection.append(stageTitle, stageCopy, history, addPolicy, list);
    root.append(header, identity, graphSection, stagesSection);
}

/** Lazy page surface for orienting a data scientist before opening the editor overlay. */
export function initPreparePage(deps: PreparePageDeps = {}): () => void {
    const root = document.getElementById('prepare-workspace');
    if (!root) return () => {};
    const render = () => renderPrepareWorkspace(root, cleaningPlanStore.getSnapshot(), deps);
    render();
    return cleaningPlanStore.subscribe(render);
}
