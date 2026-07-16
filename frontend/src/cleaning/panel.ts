import {
    applyCleaningPlan,
    cancelSessionJob,
    exportCleaningCode,
    exportCleaningManifest,
    exportCleaningPlan,
    getArtifactStorageUsage,
    listSessionJobs,
    listDatasetVersions,
    previewCleaningPlan,
    selectDatasetVersion,
} from './api.js';
import type { CleaningPreviewResponse, CleaningStageImpact } from './api.js';
import { buildPipelineGraph, renderPipelineGraphSvg, serializePipelineGraph } from './pipelineGraph.js';
import { formatResampleAggregations, hasAscendingTimeSortBefore, normalizeFixedDuration, parseResampleAggregations } from './resample.js';
import type { CleaningPlan, CleaningStage } from './types.js';
import type { CleaningPlanStore } from './store.js';
import { downloadBlob } from '../utils/dom.js';

type PlanPanelStore = Pick<CleaningPlanStore,
    'getSnapshot' | 'subscribe' | 'setPlan' | 'addStage' | 'updateStage' | 'removeStage' | 'setStageEnabled' | 'reorderStage' | 'canUndo' | 'canRedo' | 'isDirty' | 'undo' | 'redo'>;
type WorkbenchTab = 'pipeline' | 'stages' | 'export';

export interface CleaningPlanPanelDeps {
    planStore: PlanPanelStore;
    getViewport: () => { xMin: number | null; xMax: number | null } | null;
    onPlanChanged?: () => void;
    onPlanApplied?: () => Promise<void> | void;
}

function button(label: string, className = 'btn btn-ghost btn-sm'): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    return element;
}

function stageSummary(stage: CleaningStage): string {
    switch (stage.kind) {
        case 'timeRange': return (stage.mode === 'keepInside' ? 'Keep ' : 'Drop ') + new Date(stage.startMs).toISOString() + ' – ' + new Date(stage.endMs).toISOString();
        case 'columnRange': return (stage.mode === 'keepInside' ? 'Keep ' : 'Drop ') + stage.column + ': ' + stage.from + ' – ' + stage.to;
        case 'adaptiveLine': return (stage.keepAbove ? 'Keep above' : 'Keep below') + ' line for ' + stage.column;
        case 'missingValue': return 'Drop ' + (stage.dropNulls ? 'null' : '') + (stage.dropNulls && stage.dropNonFinite ? ' and ' : '') + (stage.dropNonFinite ? 'non-finite' : '') + ' rows for ' + stage.column;
        case 'deduplicate': return 'Keep ' + stage.keep + ' row by ' + stage.columns.join(', ');
        case 'columnSelect': return (stage.mode === 'keep' ? 'Keep only ' : 'Drop ') + 'columns: ' + stage.columns.join(', ');
        case 'sort': return 'Stable ' + (stage.descending ? 'descending' : 'ascending') + ' sort by ' + stage.columns.join(', ');
        case 'fillNull': return (stage.strategy === 'forward' ? 'Forward' : 'Backward') + ' fill nulls in ' + stage.columns.join(', ');
        case 'resample': return 'Resample every ' + stage.every + ': ' + stage.aggregations.map(({ column, method }) => column + ' ' + method).join(', ');
        case 'chronologicalSplit': return 'Chronological train / validation / test labels in ' + stage.outputColumn;
        case 'annotation': return stage.note?.trim() || stage.label;
    }
}

function executable(stage: CleaningStage | undefined): boolean {
    return !!stage && stage.executionClass !== 'annotation';
}

function hasEnabledTimeSort(plan: CleaningPlan): boolean {
    return plan.stages.some((stage) => stage.enabled && stage.kind === 'sort'
        && stage.columns.some((column) => column.trim() === plan.timeColumn.trim()));
}

function resampleOrderingError(plan: CleaningPlan): string | null {
    const invalid = plan.stages.findIndex((stage, index) => stage.enabled && stage.kind === 'resample'
        && !hasAscendingTimeSortBefore(plan, index));
    return invalid < 0 ? null : 'Resampling requires the latest earlier enabled sort to be ascending with the time column first.';
}

function previewSummary(result: CleaningPreviewResponse): string {
    const rows = String(result.rowsAfter.toLocaleString()) + ' of ' + String(result.rowsBefore.toLocaleString())
        + ' rows remain (' + String(result.rowsRemoved.toLocaleString()) + ' removed).';
    const columns = result.columnsAfter === result.columnsBefore
        ? ' Columns unchanged.'
        : ' Columns: ' + String(result.columnsBefore) + ' → ' + String(result.columnsAfter) + '.';
    const warnings = result.warnings.length === 0 ? '' : ' Warnings: ' + result.warnings.join(' ');
    return rows + columns + warnings;
}

function stageImpactSummary(stage: CleaningStage, impact: CleaningStageImpact | undefined): string {
    if (!impact) return 'Preview to calculate row impact.';
    if (!stage.enabled) return 'Disabled — not run in this preview.';
    if (!impact.executed) return 'Annotation — no row membership change.';
    if (stage.kind === 'sort') return 'Executed — stable row order changed; row membership unchanged.';
    if (stage.kind === 'fillNull') return 'Executed — null values may change; row membership unchanged.';
    if (stage.kind === 'resample') return 'Executed — rows are aggregated into non-empty fixed-duration buckets.';
    if (stage.kind === 'columnSelect') return 'Executed — schema may change; row membership unchanged.';
    return String(impact.rowsAfter.toLocaleString()) + ' of ' + String(impact.rowsBefore.toLocaleString())
        + ' rows after this stage · ' + String(impact.rowsRemoved.toLocaleString()) + ' removed.';
}

function textInput(label: string, value: string, name: string, type = 'text'): HTMLLabelElement {
    const field = document.createElement('label');
    field.className = 'modal-field';
    const caption = document.createElement('span');
    caption.className = 'modal-label';
    caption.textContent = label;
    const input = document.createElement('input');
    input.className = 'modal-input';
    input.name = name;
    input.type = type;
    input.value = value;
    if (type === 'number') input.step = 'any';
    field.append(caption, input);
    return field;
}

function selectInput(label: string, value: string, name: string, options: Array<[string, string]>): HTMLLabelElement {
    const field = document.createElement('label');
    field.className = 'modal-field';
    const caption = document.createElement('span');
    caption.className = 'modal-label';
    caption.textContent = label;
    const select = document.createElement('select');
    select.className = 'modal-select';
    select.name = name;
    for (const [optionValue, optionLabel] of options) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionLabel;
        option.selected = optionValue === value;
        select.appendChild(option);
    }
    field.append(caption, select);
    return field;
}

function checkboxInput(label: string, checked: boolean, name: string): HTMLLabelElement {
    const field = document.createElement('label');
    field.className = 'pipeline-workbench__checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = checked;
    const caption = document.createElement('span');
    caption.textContent = label;
    field.append(input, caption);
    return field;
}

function readText(form: HTMLFormElement, name: string): string {
    return (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value.trim() ?? '';
}

function readNumber(form: HTMLFormElement, name: string, label: string): number {
    const value = Number((form.elements.namedItem(name) as HTMLInputElement).value);
    if (!Number.isFinite(value)) throw new Error(label + ' must be a finite number.');
    return value;
}

function readChecked(form: HTMLFormElement, name: string): boolean {
    return !!(form.elements.namedItem(name) as HTMLInputElement | null)?.checked;
}

function updateToolbarSummary(plan: CleaningPlan | null): void {
    const summary = document.querySelector<HTMLElement>('[data-cleaning-plan-summary]');
    if (!summary) return;
    if (!plan) {
        summary.textContent = 'No source';
        return;
    }
    const count = plan.stages.filter((stage) => executable(stage) && stage.enabled).length;
    summary.textContent = count === 0 ? 'Source' : String(count) + ' active';
}

function createTab(label: string, tab: WorkbenchTab): HTMLButtonElement {
    const element = button(label, 'pipeline-workbench__tab');
    element.setAttribute('role', 'tab');
    element.dataset.planTab = tab;
    return element;
}

/**
 * Pipeline workbench for the canonical plan store. The SVG is a visual
 * projection only; every mutation continues through the existing plan store.
 */
export function mountCleaningPlanPanel(deps: CleaningPlanPanelDeps): () => void {
    const trigger = document.getElementById('open-cleaning-plan-btn') as HTMLButtonElement | null;
    if (!trigger) return () => {};

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop cleaning-plan-backdrop';
    backdrop.hidden = true;
    const modal = document.createElement('section');
    modal.className = 'modal cleaning-plan-modal pipeline-workbench-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cleaning-plan-title');
    const header = document.createElement('header');
    header.className = 'modal-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('span');
    title.className = 'modal-title';
    title.id = 'cleaning-plan-title';
    title.textContent = 'Pipeline workbench';
    const subtitle = document.createElement('span');
    subtitle.className = 'pipeline-workbench__subtitle';
    subtitle.textContent = 'Inspect and change the reversible preprocessing pipeline.';
    titleWrap.append(title, subtitle);
    const closeButton = button('Close');
    closeButton.dataset.planClose = 'true';
    closeButton.setAttribute('aria-label', 'Close pipeline workbench');
    header.append(titleWrap, closeButton);
    const body = document.createElement('div');
    body.className = 'modal-body';
    const status = document.createElement('p');
    status.className = 'cleaning-plan-status';
    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'pipeline-workbench__tabs';
    tabsWrap.setAttribute('role', 'tablist');
    tabsWrap.setAttribute('aria-label', 'Pipeline workbench sections');
    const pipelineTab = createTab('Pipeline', 'pipeline');
    const stagesTab = createTab('Stages', 'stages');
    const exportTab = createTab('Export', 'export');
    tabsWrap.append(pipelineTab, stagesTab, exportTab);
    const panel = document.createElement('div');
    panel.className = 'pipeline-workbench__panel';
    const preview = document.createElement('p');
    preview.className = 'cleaning-plan-preview';
    preview.dataset.planPreview = 'true';
    preview.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'cleaning-plan-actions';
    body.append(status, tabsWrap, panel, preview, actions);
    modal.append(header, body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const tabs = [pipelineTab, stagesTab, exportTab];
    let activeTab: WorkbenchTab = 'pipeline';
    let selectedStageId: string | null = null;
    let lastPreview: { planId: string; planRevision: number; result: CleaningPreviewResponse } | null = null;

    const notify = (stage?: CleaningStage) => {
        if (stage === undefined || executable(stage)) deps.onPlanChanged?.();
    };
    const renderTabs = () => {
        for (const tab of tabs) {
            const selected = tab.dataset.planTab === activeTab;
            tab.setAttribute('aria-selected', String(selected));
            tab.classList.toggle('is-active', selected);
        }
    };
    const setActiveTab = (tab: WorkbenchTab) => {
        activeTab = tab;
        render();
    };
    const selectStage = (stageId: string) => {
        selectedStageId = stageId;
        activeTab = 'stages';
        render();
    };
    const renderPipeline = (plan: CleaningPlan) => {
        panel.replaceChildren();
        const legend = document.createElement('div');
        legend.className = 'pipeline-workbench__legend';
        legend.textContent = 'Active stages can filter rows, alter values or schema, or establish row order. Disabled stages are bypassed. Annotations document the pipeline.';
        const scroll = document.createElement('div');
        scroll.className = 'pipeline-workbench__graph-scroll';
        scroll.innerHTML = renderPipelineGraphSvg(buildPipelineGraph(plan), { selectedStageId });
        const hint = document.createElement('p');
        hint.className = 'pipeline-workbench__hint';
        hint.textContent = 'Select a stage in the graph to edit it. The graph never changes data directly.';
        const onSelect = (event: Event) => {
            const stageId = (event.target as Element | null)?.closest<SVGGElement>('[data-stage-id]')?.dataset.stageId;
            if (stageId) selectStage(stageId);
        };
        scroll.addEventListener('click', onSelect);
        scroll.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onSelect(event);
        });
        panel.append(legend, scroll, hint);
    };
    const saveStage = (stage: CleaningStage, form: HTMLFormElement) => {
        const common = {
            label: readText(form, 'label') || stage.kind,
            note: readText(form, 'note') || undefined,
            enabled: readChecked(form, 'enabled'),
        };
        let patch: Partial<CleaningStage>;
        if (stage.kind === 'timeRange') {
            patch = {
                ...common,
                startMs: readNumber(form, 'startMs', 'Start'),
                endMs: readNumber(form, 'endMs', 'End'),
                mode: readText(form, 'mode') as 'keepInside' | 'dropInside',
            } as Partial<CleaningStage>;
        } else if (stage.kind === 'columnRange') {
            patch = {
                ...common,
                column: readText(form, 'column'),
                from: readNumber(form, 'from', 'From'),
                to: readNumber(form, 'to', 'To'),
                mode: readText(form, 'mode') as 'keepInside' | 'dropInside',
            } as Partial<CleaningStage>;
        } else if (stage.kind === 'missingValue') {
            patch = {
                ...common,
                column: readText(form, 'column'),
                dropNulls: readChecked(form, 'dropNulls'),
                dropNonFinite: readChecked(form, 'dropNonFinite'),
            } as Partial<CleaningStage>;
        } else if (stage.kind === 'deduplicate') {
            const columns = readText(form, 'columns').split(',').map((column) => column.trim()).filter(Boolean);
            if (columns.length === 0 || new Set(columns).size !== columns.length) throw new Error('Duplicate resolution needs unique key columns.');
            patch = { ...common, columns, keep: readText(form, 'keep') as 'first' | 'last' } as Partial<CleaningStage>;
        } else if (stage.kind === 'columnSelect') {
            const columns = readText(form, 'columns').split(',').map((column) => column.trim()).filter(Boolean);
            if (columns.length === 0 || new Set(columns).size !== columns.length) throw new Error('Column selection needs unique column names.');
            patch = { ...common, columns, mode: readText(form, 'mode') as 'keep' | 'drop' } as Partial<CleaningStage>;
        } else if (stage.kind === 'sort') {
            const columns = readText(form, 'columns').split(',').map((column) => column.trim()).filter(Boolean);
            if (columns.length === 0 || new Set(columns).size !== columns.length) throw new Error('Sorting needs unique column names.');
            patch = { ...common, columns, descending: readChecked(form, 'descending'), nullsLast: readChecked(form, 'nullsLast') } as Partial<CleaningStage>;
        } else if (stage.kind === 'fillNull') {
            const columns = readText(form, 'columns').split(',').map((column) => column.trim()).filter(Boolean);
            const rawLimit = readText(form, 'limit');
            const limit = rawLimit ? Number(rawLimit) : null;
            if (columns.length === 0 || new Set(columns).size !== columns.length || (limit != null && (!Number.isInteger(limit) || limit <= 0))) throw new Error('Fill needs unique columns and an optional positive integer limit.');
            patch = { ...common, columns, strategy: readText(form, 'strategy') as 'forward' | 'backward', limit } as Partial<CleaningStage>;
        } else if (stage.kind === 'resample') {
            const plan = deps.planStore.getSnapshot();
            const index = plan?.stages.findIndex((candidate) => candidate.id === stage.id) ?? -1;
            const every = normalizeFixedDuration(readText(form, 'every'));
            const aggregations = parseResampleAggregations(readText(form, 'aggregations'), plan?.timeColumn ?? '');
            if (!every || !aggregations) throw new Error('Use a positive fixed interval and unique entries such as value:mean, volume:sum.');
            if (common.enabled && (!plan || index < 0 || !hasAscendingTimeSortBefore(plan, index))) {
                throw new Error('Resampling requires the latest earlier enabled sort to be ascending with the time column first.');
            }
            patch = { ...common, every, aggregations } as Partial<CleaningStage>;
        } else if (stage.kind === 'chronologicalSplit') {
            const trainEndMs = readNumber(form, 'trainEndMs', 'Train end');
            const validationEndMs = readNumber(form, 'validationEndMs', 'Validation end');
            const embargoMs = readNumber(form, 'embargoMs', 'Embargo');
            const outputColumn = readText(form, 'outputColumn').trim();
            if (trainEndMs >= validationEndMs || embargoMs < 0 || !outputColumn) throw new Error('Train end must precede validation end; embargo must be non-negative; choose an output column.');
            patch = { ...common, trainEndMs, validationEndMs, embargoMs, outputColumn } as Partial<CleaningStage>;
        } else if (stage.kind === 'adaptiveLine') {
            const x1Ms = readNumber(form, 'x1Ms', 'X1');
            const x2Ms = readNumber(form, 'x2Ms', 'X2');
            if (x1Ms === x2Ms) throw new Error('Adaptive line X coordinates must differ.');
            patch = {
                ...common,
                column: readText(form, 'column'),
                x1Ms,
                y1: readNumber(form, 'y1', 'Y1'),
                x2Ms,
                y2: readNumber(form, 'y2', 'Y2'),
                keepAbove: readChecked(form, 'keepAbove'),
                applyWithinSegmentOnly: readChecked(form, 'applyWithinSegmentOnly'),
            } as Partial<CleaningStage>;
        } else {
            patch = {
                ...common,
                severity: readText(form, 'severity') as 'info' | 'warning' | 'critical',
            } as Partial<CleaningStage>;
        }
        const plan = deps.planStore.getSnapshot();
        if (plan) {
            const stages = plan.stages.map((candidate) => candidate.id === stage.id
                ? { ...candidate, ...patch, id: candidate.id, kind: candidate.kind } as CleaningStage
                : candidate);
            const error = resampleOrderingError({ ...plan, stages });
            if (error) throw new Error(error);
        }
        deps.planStore.updateStage(stage.id, patch);
        notify(stage);
        preview.textContent = 'Saved ' + (stage.label || stage.kind) + '.';
    };
    const renderEditor = (stage: CleaningStage) => {
        const form = document.createElement('form');
        form.className = 'pipeline-workbench__editor';
        const heading = document.createElement('h3');
        heading.textContent = 'Edit ' + stage.kind;
        const general = document.createElement('div');
        general.className = 'modal-grid';
        general.append(textInput('Label', stage.label, 'label'), checkboxInput('Enabled', stage.enabled, 'enabled'));
        const note = document.createElement('label');
        note.className = 'modal-field';
        const noteLabel = document.createElement('span');
        noteLabel.className = 'modal-label';
        noteLabel.textContent = 'Note';
        const noteText = document.createElement('textarea');
        noteText.className = 'modal-input';
        noteText.name = 'note';
        noteText.rows = 2;
        noteText.value = stage.note ?? '';
        note.append(noteLabel, noteText);
        const fields = document.createElement('div');
        fields.className = 'modal-grid';
        if (stage.kind === 'timeRange') {
            fields.append(
                textInput('Start (ms)', String(stage.startMs), 'startMs', 'number'),
                textInput('End (ms)', String(stage.endMs), 'endMs', 'number'),
                selectInput('Mode', stage.mode, 'mode', [['keepInside', 'Keep inside'], ['dropInside', 'Drop inside']]),
            );
        } else if (stage.kind === 'columnRange') {
            fields.append(
                textInput('Column', stage.column, 'column'),
                textInput('From', String(stage.from), 'from', 'number'),
                textInput('To', String(stage.to), 'to', 'number'),
                selectInput('Mode', stage.mode, 'mode', [['keepInside', 'Keep inside'], ['dropInside', 'Drop inside']]),
            );
        } else if (stage.kind === 'missingValue') {
            fields.append(
                textInput('Column', stage.column, 'column'),
                checkboxInput('Drop null rows', stage.dropNulls, 'dropNulls'),
                checkboxInput('Drop non-finite rows', stage.dropNonFinite, 'dropNonFinite'),
            );
        } else if (stage.kind === 'deduplicate') {
            fields.append(
                textInput('Key columns (comma-separated)', stage.columns.join(', '), 'columns'),
                selectInput('Keep', stage.keep, 'keep', [['first', 'First row'], ['last', 'Last row']]),
            );
        } else if (stage.kind === 'columnSelect') {
            fields.append(
                textInput('Columns (comma-separated)', stage.columns.join(', '), 'columns'),
                selectInput('Mode', stage.mode, 'mode', [['keep', 'Keep only these columns'], ['drop', 'Drop these columns']]),
            );
        } else if (stage.kind === 'sort') {
            fields.append(
                textInput('Columns (comma-separated)', stage.columns.join(', '), 'columns'),
                checkboxInput('Descending', stage.descending, 'descending'),
                checkboxInput('Place nulls last', stage.nullsLast, 'nullsLast'),
            );
        } else if (stage.kind === 'fillNull') {
            fields.append(textInput('Columns (comma-separated)', stage.columns.join(', '), 'columns'), selectInput('Direction', stage.strategy, 'strategy', [['forward', 'Forward fill'], ['backward', 'Backward fill']]), textInput('Maximum consecutive fills (blank = unlimited)', stage.limit == null ? '' : String(stage.limit), 'limit', 'number'));
        } else if (stage.kind === 'resample') {
            fields.append(
                textInput('Fixed interval (for example 15m)', stage.every, 'every'),
                textInput('Aggregations (column:method, comma-separated)', formatResampleAggregations(stage.aggregations), 'aggregations'),
            );
        } else if (stage.kind === 'chronologicalSplit') {
            fields.append(
                textInput('Train end (epoch ms)', String(stage.trainEndMs), 'trainEndMs', 'number'),
                textInput('Validation end (epoch ms)', String(stage.validationEndMs), 'validationEndMs', 'number'),
                textInput('Embargo (ms)', String(stage.embargoMs), 'embargoMs', 'number'),
                textInput('Split output column', stage.outputColumn, 'outputColumn'),
            );
        } else if (stage.kind === 'adaptiveLine') {
            fields.append(
                textInput('Column', stage.column, 'column'),
                textInput('X1 (ms)', String(stage.x1Ms), 'x1Ms', 'number'),
                textInput('Y1', String(stage.y1), 'y1', 'number'),
                textInput('X2 (ms)', String(stage.x2Ms), 'x2Ms', 'number'),
                textInput('Y2', String(stage.y2), 'y2', 'number'),
                checkboxInput('Keep above line', stage.keepAbove, 'keepAbove'),
                checkboxInput('Only within segment', stage.applyWithinSegmentOnly, 'applyWithinSegmentOnly'),
            );
        } else {
            fields.append(selectInput('Severity', stage.severity ?? 'info', 'severity', [
                ['info', 'Info'], ['warning', 'Warning'], ['critical', 'Critical'],
            ]));
        }
        const editorActions = document.createElement('div');
        editorActions.className = 'pipeline-workbench__editor-actions';
        const save = button('Save stage', 'btn btn-primary btn-sm');
        save.type = 'submit';
        const clear = button('Clear selection');
        clear.addEventListener('click', () => {
            selectedStageId = null;
            render();
        });
        editorActions.append(save, clear);
        form.append(heading, general, note, fields, editorActions);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            try {
                saveStage(stage, form);
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not save this stage.';
            }
        });
        panel.appendChild(form);
    };
    const renderStages = (plan: CleaningPlan) => {
        panel.replaceChildren();
        const addMissingForm = document.createElement('form');
        addMissingForm.className = 'pipeline-workbench__add-stage';
        const addHeading = document.createElement('h3');
        addHeading.textContent = 'Add missing-value policy';
        const addFields = document.createElement('div');
        addFields.className = 'modal-grid';
        addFields.append(
            textInput('Numeric column', '', 'missingValueColumn'),
            checkboxInput('Drop null rows', true, 'missingValueDropNulls'),
            checkboxInput('Drop non-finite rows', true, 'missingValueDropNonFinite'),
        );
        const addActions = document.createElement('div');
        addActions.className = 'pipeline-workbench__editor-actions';
        const addMissing = button('Add policy', 'btn btn-primary btn-sm');
        addMissing.type = 'submit';
        addActions.appendChild(addMissing);
        addMissingForm.append(addHeading, addFields, addActions);
        addMissingForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const column = readText(addMissingForm, 'missingValueColumn');
            const dropNulls = readChecked(addMissingForm, 'missingValueDropNulls');
            const dropNonFinite = readChecked(addMissingForm, 'missingValueDropNonFinite');
            if (!column) {
                preview.textContent = 'Choose a numeric column for the missing-value policy.';
                return;
            }
            if (!dropNulls && !dropNonFinite) {
                preview.textContent = 'Choose null removal, non-finite removal, or both.';
                return;
            }
            deps.planStore.addStage({
                kind: 'missingValue', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                sourcePage: 'manual', label: 'Drop missing values from ' + column,
                column, dropNulls, dropNonFinite,
            });
            notify();
        });
        const addDeduplicateForm = document.createElement('form');
        addDeduplicateForm.className = 'pipeline-workbench__add-stage';
        const deduplicateHeading = document.createElement('h3');
        deduplicateHeading.textContent = 'Add duplicate resolution';
        const deduplicateFields = document.createElement('div');
        deduplicateFields.className = 'modal-grid';
        deduplicateFields.append(
            textInput('Key columns (comma-separated)', '', 'deduplicateColumns'),
            selectInput('Keep', 'first', 'deduplicateKeep', [['first', 'First row'], ['last', 'Last row']]),
        );
        const deduplicateActions = document.createElement('div');
        deduplicateActions.className = 'pipeline-workbench__editor-actions';
        const addDeduplicate = button('Resolve duplicates', 'btn btn-primary btn-sm');
        addDeduplicate.type = 'submit';
        deduplicateActions.appendChild(addDeduplicate);
        addDeduplicateForm.append(deduplicateHeading, deduplicateFields, deduplicateActions);
        addDeduplicateForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const columns = readText(addDeduplicateForm, 'deduplicateColumns').split(',').map((column) => column.trim()).filter(Boolean);
            if (columns.length === 0 || new Set(columns).size !== columns.length) {
                preview.textContent = 'Choose one or more unique key columns for duplicate resolution.';
                return;
            }
            const keep = readText(addDeduplicateForm, 'deduplicateKeep') as 'first' | 'last';
            deps.planStore.addStage({
                kind: 'deduplicate', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                sourcePage: 'manual', label: 'Keep ' + keep + ' row by ' + columns.join(', '), columns, keep,
            });
            notify();
        });
        const addColumnSelectForm = document.createElement('form');
        addColumnSelectForm.className = 'pipeline-workbench__add-stage';
        const columnSelectHeading = document.createElement('h3');
        columnSelectHeading.textContent = 'Add column selection';
        const columnSelectFields = document.createElement('div');
        columnSelectFields.className = 'modal-grid';
        columnSelectFields.append(
            textInput('Columns (comma-separated)', '', 'columnSelectColumns'),
            selectInput('Mode', 'keep', 'columnSelectMode', [['keep', 'Keep only these columns'], ['drop', 'Drop these columns']]),
        );
        const columnSelectActions = document.createElement('div');
        columnSelectActions.className = 'pipeline-workbench__editor-actions';
        const addColumnSelect = button('Add selection', 'btn btn-primary btn-sm');
        addColumnSelect.type = 'submit';
        columnSelectActions.appendChild(addColumnSelect);
        addColumnSelectForm.append(columnSelectHeading, columnSelectFields, columnSelectActions);
        addColumnSelectForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const columns = readText(addColumnSelectForm, 'columnSelectColumns').split(',').map((column) => column.trim()).filter(Boolean);
            if (columns.length === 0 || new Set(columns).size !== columns.length) {
                preview.textContent = 'Choose one or more unique columns for column selection.';
                return;
            }
            const mode = readText(addColumnSelectForm, 'columnSelectMode') as 'keep' | 'drop';
            deps.planStore.addStage({
                kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
                sourcePage: 'manual', label: (mode === 'keep' ? 'Keep only ' : 'Drop ') + columns.join(', '), columns, mode,
            });
            notify();
        });
        const addSortForm = document.createElement('form');
        addSortForm.className = 'pipeline-workbench__add-stage';
        const sortHeading = document.createElement('h3');
        sortHeading.textContent = 'Add stable sort';
        const sortFields = document.createElement('div');
        sortFields.className = 'modal-grid';
        sortFields.append(
            textInput('Columns (comma-separated)', '', 'sortColumns'),
            checkboxInput('Descending', false, 'sortDescending'),
            checkboxInput('Place nulls last', true, 'sortNullsLast'),
        );
        const sortActions = document.createElement('div');
        sortActions.className = 'pipeline-workbench__editor-actions';
        const addSort = button('Add sort', 'btn btn-primary btn-sm');
        addSort.type = 'submit';
        sortActions.appendChild(addSort);
        addSortForm.append(sortHeading, sortFields, sortActions);
        addSortForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const columns = readText(addSortForm, 'sortColumns').split(',').map((column) => column.trim()).filter(Boolean);
            if (columns.length === 0 || new Set(columns).size !== columns.length) {
                preview.textContent = 'Choose one or more unique columns for stable sorting.';
                return;
            }
            const descending = readChecked(addSortForm, 'sortDescending');
            const nullsLast = readChecked(addSortForm, 'sortNullsLast');
            deps.planStore.addStage({
                kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true,
                sourcePage: 'manual', label: 'Stable ' + (descending ? 'descending' : 'ascending') + ' sort by ' + columns.join(', '),
                columns, descending, nullsLast,
            });
            notify();
        });
        const addFillForm = document.createElement('form');
        addFillForm.className = 'pipeline-workbench__add-stage';
        const fillHeading = document.createElement('h3');
        fillHeading.textContent = 'Add ordered null fill';
        const fillFields = document.createElement('div');
        fillFields.className = 'modal-grid';
        fillFields.append(textInput('Columns (comma-separated)', '', 'fillColumns'), selectInput('Direction', 'forward', 'fillStrategy', [['forward', 'Forward fill'], ['backward', 'Backward fill']]), textInput('Maximum consecutive fills (optional)', '', 'fillLimit', 'number'));
        const fillActions = document.createElement('div');
        fillActions.className = 'pipeline-workbench__editor-actions';
        const addFill = button('Add null fill', 'btn btn-primary btn-sm');
        addFill.type = 'submit';
        fillActions.appendChild(addFill);
        addFillForm.append(fillHeading, fillFields, fillActions);
        addFillForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const columns = readText(addFillForm, 'fillColumns').split(',').map((column) => column.trim()).filter(Boolean);
            const rawLimit = readText(addFillForm, 'fillLimit');
            const limit = rawLimit ? Number(rawLimit) : null;
            if (!hasEnabledTimeSort(plan)) { preview.textContent = 'Add and enable a stable sort on the time column before ordered null fill.'; return; }
            if (columns.length === 0 || new Set(columns).size !== columns.length || (limit != null && (!Number.isInteger(limit) || limit <= 0))) { preview.textContent = 'Choose unique columns and an optional positive integer limit.'; return; }
            const strategy = readText(addFillForm, 'fillStrategy') as 'forward' | 'backward';
            deps.planStore.addStage({ kind: 'fillNull', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: (strategy === 'forward' ? 'Forward' : 'Backward') + ' fill nulls in ' + columns.join(', '), columns, strategy, limit });
            notify();
        });
        const addResampleForm = document.createElement('form');
        addResampleForm.className = 'pipeline-workbench__add-stage';
        const resampleHeading = document.createElement('h3');
        resampleHeading.textContent = 'Add fixed-duration resampling';
        const resampleFields = document.createElement('div');
        resampleFields.className = 'modal-grid';
        resampleFields.append(
            textInput('Fixed interval (for example 15m)', '', 'resampleEvery'),
            textInput('Aggregations (column:method, comma-separated)', '', 'resampleAggregations'),
        );
        const resampleActions = document.createElement('div');
        resampleActions.className = 'pipeline-workbench__editor-actions';
        const addResample = button('Add resampling', 'btn btn-primary btn-sm');
        addResample.type = 'submit';
        resampleActions.appendChild(addResample);
        addResampleForm.append(resampleHeading, resampleFields, resampleActions);
        addResampleForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const every = normalizeFixedDuration(readText(addResampleForm, 'resampleEvery'));
            const aggregations = parseResampleAggregations(readText(addResampleForm, 'resampleAggregations'), plan.timeColumn);
            if (!hasAscendingTimeSortBefore(plan)) {
                preview.textContent = 'Add an ascending stable sort with the time column first before resampling.';
                return;
            }
            if (!every || !aggregations) {
                preview.textContent = 'Use a positive fixed interval and unique entries such as value:mean, volume:sum.';
                return;
            }
            deps.planStore.addStage({
                kind: 'resample', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                sourcePage: 'manual', label: 'Resample every ' + every, every, aggregations,
            });
            notify();
        });
        const addSplitForm = document.createElement('form');
        addSplitForm.className = 'pipeline-workbench__add-stage';
        const splitHeading = document.createElement('h3');
        splitHeading.textContent = 'Add chronological split';
        const splitFields = document.createElement('div');
        splitFields.className = 'modal-grid';
        splitFields.append(textInput('Train end (epoch ms)', '', 'trainEndMs', 'number'), textInput('Validation end (epoch ms)', '', 'validationEndMs', 'number'), textInput('Embargo (ms)', '0', 'embargoMs', 'number'), textInput('Split output column', 'split', 'outputColumn'));
        const splitActions = document.createElement('div'); splitActions.className = 'pipeline-workbench__editor-actions';
        const addSplit = button('Add chronological split', 'btn btn-primary btn-sm'); addSplit.type = 'submit'; splitActions.appendChild(addSplit);
        addSplitForm.append(splitHeading, splitFields, splitActions);
        addSplitForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const trainEndMs = Number(readText(addSplitForm, 'trainEndMs')); const validationEndMs = Number(readText(addSplitForm, 'validationEndMs')); const embargoMs = Number(readText(addSplitForm, 'embargoMs')); const outputColumn = readText(addSplitForm, 'outputColumn').trim();
            if (!Number.isFinite(trainEndMs) || !Number.isFinite(validationEndMs) || !Number.isFinite(embargoMs) || trainEndMs >= validationEndMs || embargoMs < 0 || !outputColumn) { preview.textContent = 'Train end must precede validation end; embargo must be non-negative; choose an output column.'; return; }
            deps.planStore.addStage({ kind: 'chronologicalSplit', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Chronological split', trainEndMs, validationEndMs, embargoMs, outputColumn }); notify();
        });
        const list = document.createElement('div');
        list.className = 'cleaning-plan-stages';
        if (plan.stages.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'pipeline-workbench__hint';
            empty.textContent = 'No transforms yet. Add a visible time range or create a stage from a plot.';
            list.appendChild(empty);
        }
        const impacts = new Map((lastPreview?.planId === plan.id && lastPreview.planRevision === plan.planRevision
            ? lastPreview.result.stageImpacts
            : []).map((impact) => [impact.stageId, impact]));
        for (const [index, stage] of plan.stages.entries()) {
            const row = document.createElement('div');
            row.className = 'cleaning-plan-stage';
            row.classList.toggle('is-selected', stage.id === selectedStageId);
            const description = button(String(index + 1) + '. ' + (stage.label || stage.kind) + ' — ' + stageSummary(stage), 'cleaning-plan-stage__summary');
            description.setAttribute('aria-pressed', String(stage.id === selectedStageId));
            description.classList.toggle('is-disabled', !stage.enabled);
            description.addEventListener('click', () => selectStage(stage.id));
            const impact = document.createElement('span');
            impact.className = 'cleaning-plan-stage__impact';
            impact.textContent = stageImpactSummary(stage, impacts.get(stage.id));
            const toggle = button(stage.enabled ? 'Disable' : 'Enable');
            toggle.addEventListener('click', () => {
                const stages = plan.stages.map((candidate) => candidate.id === stage.id
                    ? { ...candidate, enabled: !stage.enabled } as CleaningStage
                    : candidate);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { preview.textContent = error; return; }
                deps.planStore.setStageEnabled(stage.id, !stage.enabled);
                notify(stage);
            });
            const up = button('Move up');
            up.disabled = index === 0;
            up.addEventListener('click', () => {
                const stages = [...plan.stages];
                stages.splice(index - 1, 0, stages.splice(index, 1)[0]);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { preview.textContent = error; return; }
                deps.planStore.reorderStage(stage.id, index - 1);
                notify(stage);
            });
            const down = button('Move down');
            down.disabled = index === plan.stages.length - 1;
            down.addEventListener('click', () => {
                const stages = [...plan.stages];
                stages.splice(index + 1, 0, stages.splice(index, 1)[0]);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { preview.textContent = error; return; }
                deps.planStore.reorderStage(stage.id, index + 1);
                notify(stage);
            });
            const remove = button('Remove');
            remove.addEventListener('click', () => {
                const stages = plan.stages.filter((candidate) => candidate.id !== stage.id);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { preview.textContent = error; return; }
                deps.planStore.removeStage(stage.id);
                if (selectedStageId === stage.id) selectedStageId = null;
                notify(stage);
            });
            row.append(description, impact, toggle, up, down, remove);
            list.appendChild(row);
        }
        panel.append(addMissingForm, addDeduplicateForm, addColumnSelectForm, addSortForm, addFillForm, addResampleForm, addSplitForm, list);
        const selected = plan.stages.find((stage) => stage.id === selectedStageId);
        if (selected) renderEditor(selected);
    };
    const exportText = (content: string, filename: string, type: string) => {
        downloadBlob(new Blob([content], { type }), filename);
    };
    const renderExport = (plan: CleaningPlan) => {
        panel.replaceChildren();
        const copy = document.createElement('p');
        copy.className = 'pipeline-workbench__hint';
        copy.textContent = 'Export the backend-validated plan for reproducibility, backend-generated Python or Rust application code for supported v1 stages, or this visual projection for review.';
        const controls = document.createElement('div');
        controls.className = 'pipeline-workbench__export-actions';
        const planExport = button('Export plan JSON');
        planExport.addEventListener('click', async () => {
            planExport.disabled = true;
            try {
                downloadBlob(await exportCleaningPlan(plan), 'edatime_cleaning_plan.json');
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not export this plan.';
            } finally {
                planExport.disabled = false;
            }
        });
        const manifestExport = button('Export handoff manifest');
        manifestExport.addEventListener('click', async () => {
            manifestExport.disabled = true;
            try { downloadBlob(await exportCleaningManifest(plan), 'edatime_handoff_manifest.json'); }
            catch (error) { preview.textContent = error instanceof Error ? error.message : 'Could not export the handoff manifest.'; }
            finally { manifestExport.disabled = false; }
        });
        const graphExport = button('Export graph JSON');
        graphExport.addEventListener('click', () => {
            exportText(serializePipelineGraph(buildPipelineGraph(plan)), 'edatime_pipeline_graph.json', 'application/json;charset=utf-8');
        });
        const svgExport = button('Export graph SVG');
        svgExport.addEventListener('click', () => {
            exportText(renderPipelineGraphSvg(buildPipelineGraph(plan)), 'edatime_pipeline_graph.svg', 'image/svg+xml;charset=utf-8');
        });
        const pythonExport = button('Export canonical Python');
        pythonExport.addEventListener('click', async () => {
            pythonExport.disabled = true;
            try { downloadBlob(await exportCleaningCode(plan, 'python'), 'apply_edatime_plan.py'); }
            catch (error) { preview.textContent = error instanceof Error ? error.message : 'Could not export canonical Python code.'; }
            finally { pythonExport.disabled = false; }
        });
        const rustExport = button('Export canonical Rust');
        rustExport.addEventListener('click', async () => {
            rustExport.disabled = true;
            try { downloadBlob(await exportCleaningCode(plan, 'rust'), 'apply_edatime_plan.rs'); }
            catch (error) { preview.textContent = error instanceof Error ? error.message : 'Could not export canonical Rust code.'; }
            finally { rustExport.disabled = false; }
        });
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = 'application/json,.json';
        importInput.hidden = true;
        const importPlan = button('Import plan JSON');
        importPlan.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', async () => {
            const file = importInput.files?.[0];
            if (!file) return;
            try {
                deps.planStore.setPlan(parseImportedPlan(await file.text(), plan));
                deps.onPlanChanged?.();
                preview.textContent = 'Imported ' + file.name + ' for this dataset baseline.';
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not import this plan.';
            } finally {
                importInput.value = '';
            }
        });
        const storage = document.createElement('p');
        storage.className = 'pipeline-workbench__hint';
        storage.textContent = 'Managed artifact storage is not loaded.';
        const refreshStorage = button('Refresh storage usage');
        refreshStorage.addEventListener('click', async () => {
            refreshStorage.disabled = true;
            try {
                const usage = await getArtifactStorageUsage();
                if (!usage.enabled) {
                    storage.textContent = 'Managed artifact storage is disabled for this server.';
                } else {
                    const quota = usage.maxBytes == null ? 'no quota' : formatBytes(usage.maxBytes) + ' quota';
                    storage.textContent = String(usage.artifactCount) + ' retained artifact' + (usage.artifactCount === 1 ? '' : 's') + ' · ' + formatBytes(usage.usedBytes) + ' used · ' + quota + '.';
                }
            } catch (error) {
                storage.textContent = error instanceof Error ? error.message : 'Could not load managed storage usage.';
            } finally {
                refreshStorage.disabled = false;
            }
        });
        const jobs = document.createElement('div');
        jobs.className = 'pipeline-workbench__jobs';
        jobs.textContent = 'Recent pipeline jobs are not loaded.';
        const refreshJobs = button('Refresh pipeline jobs');
        refreshJobs.addEventListener('click', async () => {
            refreshJobs.disabled = true;
            try {
                const records = (await listSessionJobs())
                    .filter((job) => job.kind === 'materialization')
                    .slice(-5)
                    .reverse();
                jobs.replaceChildren();
                if (records.length === 0) {
                    jobs.textContent = 'No materialization jobs in this server session.';
                    return;
                }
                for (const job of records) {
                    const row = document.createElement('div');
                    row.className = 'pipeline-workbench__job';
                    const label = document.createElement('span');
                    label.textContent = `${job.id} · ${job.status}${job.progressPercent == null ? '' : ` · ${job.progressPercent}%`}${job.message ? ` · ${job.message}` : ''}`;
                    row.appendChild(label);
                    if (job.status === 'queued' || job.status === 'running' || job.status === 'cancelling') {
                        const cancel = button('Cancel', 'btn btn-ghost btn-sm');
                        cancel.addEventListener('click', async () => {
                            cancel.disabled = true;
                            try {
                                await cancelSessionJob(job.id);
                                refreshJobs.click();
                            } catch (error) {
                                preview.textContent = error instanceof Error ? error.message : 'Could not cancel this job.';
                            } finally {
                                cancel.disabled = false;
                            }
                        });
                        row.appendChild(cancel);
                    }
                    jobs.appendChild(row);
                }
            } catch (error) {
                jobs.textContent = error instanceof Error ? error.message : 'Could not load session jobs.';
            } finally {
                refreshJobs.disabled = false;
            }
        });
        controls.append(planExport, manifestExport, graphExport, svgExport, pythonExport, rustExport, importPlan, importInput, refreshStorage, refreshJobs);
        panel.append(copy, controls, storage, jobs);
    };
    const renderActions = (plan: CleaningPlan) => {
        actions.replaceChildren();
        const undo = button('Undo');
        undo.disabled = !deps.planStore.canUndo();
        undo.addEventListener('click', () => {
            if (deps.planStore.undo()) {
                preview.textContent = 'Undid the latest pipeline edit.';
                deps.onPlanChanged?.();
            }
        });
        const redo = button('Redo');
        redo.disabled = !deps.planStore.canRedo();
        redo.addEventListener('click', () => {
            if (deps.planStore.redo()) {
                preview.textContent = 'Restored the latest pipeline edit.';
                deps.onPlanChanged?.();
            }
        });
        const addViewport = button('Add visible time range');
        addViewport.addEventListener('click', () => {
            const viewport = deps.getViewport();
            const startMs = Number(viewport?.xMin);
            const endMs = Number(viewport?.xMax);
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs === endMs) {
                preview.textContent = 'Zoom or set a valid visible time range first.';
                return;
            }
            // An explicit Add action is append-only. Replacing a previous
            // stage here would hide user intent and break the pipeline's
            // saved-order/audit invariant; editing remains available from the
            // Stages tab after the new stage is added.
            deps.planStore.addStage({
                kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                sourcePage: 'timeseries', label: 'Keep visible time range',
                startMs: Math.min(startMs, endMs), endMs: Math.max(startMs, endMs), mode: 'keepInside',
            });
            notify();
            setActiveTab('stages');
        });
        const previewButton = button('Preview');
        previewButton.addEventListener('click', async () => {
            const current = deps.planStore.getSnapshot();
            if (!current) return;
            preview.textContent = 'Calculating preview…';
            try {
                const result = await previewCleaningPlan(current);
                const latest = deps.planStore.getSnapshot();
                if (!latest || latest.id !== current.id || latest.planRevision !== current.planRevision) {
                    preview.textContent = 'The plan changed while this preview was running. Preview again for current impacts.';
                    return;
                }
                lastPreview = { planId: current.id, planRevision: current.planRevision, result };
                render();
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not preview this plan.';
            }
        });
        const apply = button('Apply as new dataset', 'btn btn-primary btn-sm');
        apply.addEventListener('click', async () => {
            const current = deps.planStore.getSnapshot();
            if (!current) return;
            apply.disabled = true;
            preview.textContent = 'Materializing a new dataset version…';
            try {
                const result = await applyCleaningPlan(current);
                preview.textContent = 'Created ' + result.sourceVersion.id + ' from ' + current.sourceVersionId + ' · job ' + result.jobId + '.';
                await deps.onPlanApplied?.();
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not materialize this plan.';
            } finally {
                apply.disabled = false;
            }
        });
        const resetOriginal = button('Use original dataset');
        resetOriginal.addEventListener('click', async () => {
            resetOriginal.disabled = true;
            preview.textContent = 'Restoring the original source dataset…';
            try {
                const versions = await listDatasetVersions();
                const root = versions.find((version) => version.id === version.rootId);
                if (!root) throw new Error('The original source version is no longer available.');
                await selectDatasetVersion(root.id);
                preview.textContent = 'Restored ' + root.id + '.';
                await deps.onPlanApplied?.();
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not restore the original dataset.';
            } finally {
                resetOriginal.disabled = false;
            }
        });
        actions.append(undo, redo, addViewport, previewButton, apply, resetOriginal);
    };
    const render = () => {
        const plan = deps.planStore.getSnapshot();
        renderTabs();
        updateToolbarSummary(plan);
        if (!plan) {
            lastPreview = null;
            preview.textContent = '';
            status.textContent = 'Load a dataset to start an accumulated cleaning plan.';
            panel.replaceChildren();
            actions.replaceChildren();
            return;
        }
        if (lastPreview && (lastPreview.planId !== plan.id || lastPreview.planRevision !== plan.planRevision)) lastPreview = null;
        preview.textContent = lastPreview ? previewSummary(lastPreview.result) : '';
        const activeCount = plan.stages.filter((stage) => executable(stage) && stage.enabled).length;
        status.textContent = String(activeCount) + ' active executable stage' + (activeCount === 1 ? '' : 's') + ' · source ' + plan.sourceVersionId + ' · revision ' + plan.datasetRevision
            + ' · ' + (deps.planStore.isDirty() ? 'unmaterialized changes' : 'source baseline');
        if (activeTab === 'pipeline') renderPipeline(plan);
        else if (activeTab === 'stages') renderStages(plan);
        else renderExport(plan);
        renderActions(plan);
    };
    const close = () => {
        backdrop.hidden = true;
        trigger.focus();
    };
    const open = () => {
        selectedStageId = null;
        activeTab = 'pipeline';
        render();
        backdrop.hidden = false;
        pipelineTab.focus();
    };
    const closeOnBackdrop = (event: MouseEvent) => { if (event.target === backdrop) close(); };
    const closeOnEscape = (event: KeyboardEvent) => { if (!backdrop.hidden && event.key === 'Escape') close(); };
    const trapFocus = (event: KeyboardEvent) => {
        if (backdrop.hidden || event.key !== 'Tab') return;
        const focusable = Array.from(modal.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => !element.hidden);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey ? active === first || !modal.contains(active) : active === last || !modal.contains(active)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        }
    };
    trigger.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    for (const tab of tabs) tab.addEventListener('click', () => setActiveTab(tab.dataset.planTab as WorkbenchTab));
    backdrop.addEventListener('click', closeOnBackdrop);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('keydown', trapFocus);
    updateToolbarSummary(deps.planStore.getSnapshot());
    const unsubscribe = deps.planStore.subscribe(() => {
        updateToolbarSummary(deps.planStore.getSnapshot());
        if (!backdrop.hidden) render();
    });
    return () => {
        trigger.removeEventListener('click', open);
        closeButton.removeEventListener('click', close);
        backdrop.removeEventListener('click', closeOnBackdrop);
        document.removeEventListener('keydown', closeOnEscape);
        document.removeEventListener('keydown', trapFocus);
        unsubscribe();
        backdrop.remove();
    };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return String(bytes) + ' B';
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes;
    let unit = -1;
    do {
        value /= 1024;
        unit += 1;
    } while (value >= 1024 && unit < units.length - 1);
    return value.toFixed(value >= 10 ? 0 : 1) + ' ' + units[unit];
}

function parseImportedPlan(text: string, current: CleaningPlan): CleaningPlan {
    let candidate: unknown;
    try {
        candidate = JSON.parse(text);
    } catch {
        throw new Error('The selected file is not valid JSON.');
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('The selected file is not a cleaning plan.');
    }
    const plan = candidate as Partial<CleaningPlan>;
    if (plan.schemaVersion !== 1 || !Array.isArray(plan.stages)) {
        throw new Error('The selected file is not a supported cleaning plan.');
    }
    if (plan.sourceVersionId !== current.sourceVersionId
        || plan.datasetRevision !== current.datasetRevision
        || plan.datasetFingerprint !== current.datasetFingerprint
        || plan.schemaFingerprint !== current.schemaFingerprint
        || plan.timeColumn !== current.timeColumn) {
        throw new Error('This plan belongs to a different dataset baseline. Rebinding is not available yet.');
    }
    if (typeof plan.id !== 'string' || typeof plan.planRevision !== 'number'
        || typeof plan.createdAt !== 'string' || typeof plan.updatedAt !== 'string') {
        throw new Error('The selected plan is missing required metadata.');
    }
    for (const stage of plan.stages) {
        if (!isImportableStage(stage)) {
            throw new Error('The selected plan contains an unsupported stage.');
        }
    }
    for (const [index, stage] of plan.stages.entries()) {
        if (!stage.enabled) continue;
        if (stage.kind === 'fillNull') {
            const hasTimeSort = plan.stages.slice(0, index).some((prior) => prior.enabled && prior.kind === 'sort'
                && prior.columns.some((column) => column.trim() === current.timeColumn.trim()));
            if (!hasTimeSort) throw new Error('Ordered null fill requires an earlier enabled stable sort on the time column.');
        }
        if (stage.kind === 'resample') {
            if (!hasAscendingTimeSortBefore(plan as CleaningPlan, index)) {
                throw new Error('Resampling requires the latest earlier enabled sort to be ascending with the time column first.');
            }
            if (stage.aggregations.some(({ column }) => column.trim() === current.timeColumn.trim())) {
                throw new Error('Resampling cannot aggregate the canonical time column.');
            }
        }
    }
    return plan as CleaningPlan;
}

function isImportableStage(value: unknown): value is CleaningStage {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const stage = value as Record<string, unknown>;
    if (typeof stage.id !== 'string' || !stage.id.trim()
        || typeof stage.enabled !== 'boolean'
        || typeof stage.executionClass !== 'string'
        || typeof stage.scope !== 'string'
        || typeof stage.sourcePage !== 'string'
        || typeof stage.label !== 'string'
        || typeof stage.createdAt !== 'string'
        || typeof stage.updatedAt !== 'string') return false;
    const finite = (...values: unknown[]) => values.every((number) => typeof number === 'number' && Number.isFinite(number));
    switch (stage.kind) {
        case 'timeRange':
            return finite(stage.startMs, stage.endMs) && (stage.mode === 'keepInside' || stage.mode === 'dropInside');
        case 'columnRange':
            return typeof stage.column === 'string' && !!stage.column.trim()
                && finite(stage.from, stage.to) && (stage.mode === 'keepInside' || stage.mode === 'dropInside');
        case 'adaptiveLine':
            return typeof stage.column === 'string' && !!stage.column.trim()
                && finite(stage.x1Ms, stage.y1, stage.x2Ms, stage.y2)
                && stage.x1Ms !== stage.x2Ms
                && typeof stage.keepAbove === 'boolean'
                && typeof stage.applyWithinSegmentOnly === 'boolean';
        case 'missingValue':
            return typeof stage.column === 'string' && !!stage.column.trim()
                && typeof stage.dropNulls === 'boolean'
                && typeof stage.dropNonFinite === 'boolean'
                && (stage.dropNulls || stage.dropNonFinite);
        case 'deduplicate':
            return Array.isArray(stage.columns) && stage.columns.length > 0
                && stage.columns.every((column) => typeof column === 'string' && !!column.trim())
                && new Set(stage.columns).size === stage.columns.length
                && (stage.keep === 'first' || stage.keep === 'last');
        case 'columnSelect':
            return Array.isArray(stage.columns) && stage.columns.length > 0
                && stage.columns.every((column) => typeof column === 'string' && !!column.trim())
                && new Set(stage.columns).size === stage.columns.length
                && (stage.mode === 'keep' || stage.mode === 'drop');
        case 'sort':
            return Array.isArray(stage.columns) && stage.columns.length > 0
                && stage.columns.every((column) => typeof column === 'string' && !!column.trim())
                && new Set(stage.columns).size === stage.columns.length
                && typeof stage.descending === 'boolean' && typeof stage.nullsLast === 'boolean';
        case 'fillNull':
            return Array.isArray(stage.columns) && stage.columns.length > 0
                && stage.columns.every((column) => typeof column === 'string' && !!column.trim())
                && new Set(stage.columns).size === stage.columns.length
                && (stage.strategy === 'forward' || stage.strategy === 'backward')
                && (stage.limit === null || (typeof stage.limit === 'number' && Number.isInteger(stage.limit) && stage.limit > 0));
        case 'resample':
            if (typeof stage.every !== 'string' || !normalizeFixedDuration(stage.every)) return false;
            if (!Array.isArray(stage.aggregations) || stage.aggregations.length === 0) return false;
            const columns = stage.aggregations.map((aggregation) => {
                if (!aggregation || typeof aggregation !== 'object') return null;
                const value = aggregation as Record<string, unknown>;
                if (typeof value.column !== 'string' || !value.column.trim()
                    || !['mean', 'sum', 'min', 'max', 'last'].includes(String(value.method))) return null;
                return value.column.trim();
            });
            return columns.every((column): column is string => column !== null)
                && new Set(columns).size === columns.length;
        case 'annotation':
            return stage.severity === undefined || stage.severity === 'info' || stage.severity === 'warning' || stage.severity === 'critical';
        default:
            return false;
    }
}
