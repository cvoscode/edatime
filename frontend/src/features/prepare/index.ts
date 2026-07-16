import { buildPipelineGraph, renderPipelineGraphSvg } from '../../cleaning/pipelineGraph.js';
import { hasAscendingTimeSortBefore, normalizeFixedDuration, parseResampleAggregations } from '../../cleaning/resample.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { cancelSessionJob } from '../../cleaning/api.js';
import type { CleaningPlan } from '../../cleaning/types.js';
import { datasetState } from '../../store/datasetState.js';
import { fetchDatasetProfile, startDatasetProfile } from '../../services/api/profile.js';
import type { DatasetMetadata, DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
import '../../../css/modules/prepare.css';

export interface PreparePageDeps {
    onPlanChanged?: () => void;
    startProfile?: () => Promise<DatasetProfileResponse>;
    getProfile?: () => Promise<DatasetProfileResponse>;
    cancelProfile?: (jobId: string) => Promise<unknown>;
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
        case 'deduplicate': return 'Keep ' + stage.keep + ' row by ' + stage.columns.join(', ');
        case 'columnSelect': return (stage.mode === 'keep' ? 'Keep only ' : 'Drop ') + 'columns: ' + stage.columns.join(', ');
        case 'sort': return 'Stable ' + (stage.descending ? 'descending' : 'ascending') + ' sort by ' + stage.columns.join(', ');
        case 'fillNull': return (stage.strategy === 'forward' ? 'Forward' : 'Backward') + ' fill nulls in ' + stage.columns.join(', ');
        case 'resample': return 'Resample every ' + stage.every + ': ' + stage.aggregations.map(({ column, method }) => column + ' ' + method).join(', ');
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

function hasEnabledTimeSort(plan: CleaningPlan): boolean {
    return plan.stages.some((stage) => stage.enabled && stage.kind === 'sort'
        && stage.columns.some((column) => column.trim() === plan.timeColumn.trim()));
}

function resampleOrderingError(plan: CleaningPlan): string | null {
    const invalid = plan.stages.findIndex((stage, index) => stage.enabled && stage.kind === 'resample'
        && !hasAscendingTimeSortBefore(plan, index));
    return invalid < 0 ? null : 'Resampling requires the latest earlier enabled sort to be ascending with the time column first.';
}

function numericDtype(dtype: string): boolean {
    return /^(u?int|float|decimal)/i.test(dtype.trim());
}

function hasMissingValuePolicy(plan: CleaningPlan, column: string, kind: 'null' | 'nonFinite'): boolean {
    return plan.stages.some((stage) => stage.kind === 'missingValue' && stage.column === column
        && (kind === 'null' ? stage.dropNulls : stage.dropNonFinite));
}

/**
 * Surface immediate metadata findings first. More expensive cadence, duplicate,
 * and distribution findings belong to the progressive profile job rather than
 * being guessed in this Prepare surface.
 */
function renderQualityFindings(
    plan: CleaningPlan,
    deps: PreparePageDeps,
    profileMetadata: DatasetMetadata | null,
    profileStatus: DatasetProfileResponse['status'],
    requestProfile: () => void,
    cancelProfile: () => void,
): HTMLElement {
    const section = createElement('section', 'prepare-workspace__quality');
    const title = createElement('h2');
    title.textContent = 'Quality findings';
    const copy = createElement('p', 'prepare-workspace__copy');
    copy.textContent = profileStatus === 'ready'
        ? 'Exact background-profile findings can be turned into reversible stages. Review the proposed action before previewing or materializing.'
        : profileStatus === 'queued' || profileStatus === 'running' || profileStatus === 'cancelling'
            ? 'Immediate source findings are shown while the exact background quality report runs.'
            : 'Immediate source-profile findings can be turned into reversible stages. Build the exact quality report for a cached, versioned follow-up.';
    const findings = (profileMetadata?.column_profiles ?? datasetState.metadata?.column_profiles ?? [])
        .flatMap((profile) => {
            const nullCount = Number(profile?.null_count) || 0;
            const nonFiniteCount = numericDtype(String(profile?.dtype ?? '')) ? Number(profile?.non_finite_count) || 0 : 0;
            return [
                ...(nullCount > 0 ? [{ profile, kind: 'null' as const, count: nullCount }] : []),
                ...(nonFiniteCount > 0 ? [{ profile, kind: 'nonFinite' as const, count: nonFiniteCount }] : []),
            ];
        })
        .sort((left, right) => right.count - left.count
            || String(left.profile.name).localeCompare(String(right.profile.name))
            || left.kind.localeCompare(right.kind));
    const list = createElement('ul', 'prepare-workspace__quality-list');

    const profileRunning = profileStatus === 'queued' || profileStatus === 'running' || profileStatus === 'cancelling';
    const profileAction = actionButton(
        profileRunning ? 'Cancel exact quality report' : profileStatus === 'ready' ? 'Exact quality report ready' : 'Build exact quality report',
        profileRunning ? cancelProfile : requestProfile,
        profileStatus === 'ready' || profileStatus === 'cancelling',
    );
    profileAction.classList.add('prepare-workspace__quality-action');

    if (findings.length === 0) {
        const empty = createElement('li', 'prepare-workspace__quality-empty');
        empty.textContent = datasetState.metadata
            ? 'No null-value findings are present in the current profile.'
            : 'Load dataset metadata to inspect exact source-profile findings.';
        list.append(empty);
    }

    for (const finding of findings) {
        const { profile, kind, count } = finding;
        const item = createElement('li', 'prepare-workspace__quality-finding');
        item.dataset.qualityColumn = profile.name;
        item.dataset.qualityKind = kind;
        const summary = createElement('div');
        const label = createElement('strong');
        label.textContent = profile.name;
        const detail = createElement('span');
        detail.textContent = String(count) + (kind === 'null' ? ' null value' : ' non-finite value') + (count === 1 ? '' : 's')
            + ' · ' + profile.dtype;
        summary.append(label, detail);
        const policyExists = hasMissingValuePolicy(plan, profile.name, kind);
        const add = actionButton(
            policyExists ? 'Policy already added' : kind === 'null' ? 'Add null policy' : 'Add non-finite policy',
            () => {
                cleaningPlanStore.addStage({
                    kind: 'missingValue', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                    sourcePage: 'manual', label: 'Drop ' + (kind === 'null' ? 'missing values from ' : 'non-finite values from ') + profile.name,
                    column: profile.name,
                    dropNulls: kind === 'null',
                    dropNonFinite: kind === 'nonFinite' || (kind === 'null' && numericDtype(profile.dtype)),
                });
                deps.onPlanChanged?.();
            },
            policyExists,
        );
        item.append(summary, add);
        list.append(item);
    }
    section.append(title, copy, profileAction, list);
    return section;
}

function renderPrepareWorkspace(
    root: HTMLElement,
    plan: CleaningPlan | null,
    deps: PreparePageDeps,
    profileMetadata: DatasetMetadata | null,
    profileStatus: DatasetProfileResponse['status'],
    requestProfile: () => void,
    cancelProfile: () => void,
): void {
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

    const qualitySection = renderQualityFindings(plan, deps, profileMetadata, profileStatus, requestProfile, cancelProfile);

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
    const addDeduplicate = createElement('form', 'prepare-workspace__policy-form');
    const deduplicateTitle = createElement('h3');
    deduplicateTitle.textContent = 'Add duplicate resolution';
    const deduplicateColumns = createElement('input', 'modal-input');
    deduplicateColumns.name = 'columns';
    deduplicateColumns.placeholder = 'Key columns, comma-separated';
    deduplicateColumns.required = true;
    deduplicateColumns.setAttribute('aria-label', 'Duplicate-resolution key columns');
    const keep = createElement('select', 'modal-select');
    keep.name = 'keep';
    const keepFirst = createElement('option');
    keepFirst.value = 'first';
    keepFirst.textContent = 'Keep first row';
    const keepLast = createElement('option');
    keepLast.value = 'last';
    keepLast.textContent = 'Keep last row';
    keep.append(keepFirst, keepLast);
    const deduplicateSubmit = actionButton('Resolve duplicates', () => {});
    deduplicateSubmit.type = 'submit';
    const deduplicateStatus = createElement('p', 'prepare-workspace__policy-status');
    deduplicateStatus.setAttribute('aria-live', 'polite');
    addDeduplicate.append(deduplicateTitle, deduplicateColumns, keep, deduplicateSubmit, deduplicateStatus);
    addDeduplicate.addEventListener('submit', (event) => {
        event.preventDefault();
        const columns = deduplicateColumns.value.split(',').map((column) => column.trim()).filter(Boolean);
        if (columns.length === 0 || new Set(columns).size !== columns.length) {
            deduplicateStatus.textContent = 'Choose one or more unique key columns.';
            return;
        }
        const resolution = keep.value as 'first' | 'last';
        cleaningPlanStore.addStage({
            kind: 'deduplicate', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'manual', label: 'Keep ' + resolution + ' row by ' + columns.join(', '), columns, keep: resolution,
        });
        deps.onPlanChanged?.();
    });
    const addColumnSelect = createElement('form', 'prepare-workspace__policy-form');
    const columnSelectTitle = createElement('h3');
    columnSelectTitle.textContent = 'Add column selection';
    const columnSelectColumns = createElement('input', 'modal-input');
    columnSelectColumns.name = 'columns';
    columnSelectColumns.placeholder = 'Columns, comma-separated';
    columnSelectColumns.required = true;
    columnSelectColumns.setAttribute('aria-label', 'Columns to keep or drop');
    const columnSelectMode = createElement('select', 'modal-select');
    columnSelectMode.name = 'mode';
    const keepColumns = createElement('option');
    keepColumns.value = 'keep';
    keepColumns.textContent = 'Keep only these columns';
    const dropColumns = createElement('option');
    dropColumns.value = 'drop';
    dropColumns.textContent = 'Drop these columns';
    columnSelectMode.append(keepColumns, dropColumns);
    const columnSelectSubmit = actionButton('Add selection', () => {});
    columnSelectSubmit.type = 'submit';
    const columnSelectStatus = createElement('p', 'prepare-workspace__policy-status');
    columnSelectStatus.setAttribute('aria-live', 'polite');
    addColumnSelect.append(columnSelectTitle, columnSelectColumns, columnSelectMode, columnSelectSubmit, columnSelectStatus);
    addColumnSelect.addEventListener('submit', (event) => {
        event.preventDefault();
        const columns = columnSelectColumns.value.split(',').map((column) => column.trim()).filter(Boolean);
        if (columns.length === 0 || new Set(columns).size !== columns.length) {
            columnSelectStatus.textContent = 'Choose one or more unique columns.';
            return;
        }
        const mode = columnSelectMode.value as 'keep' | 'drop';
        cleaningPlanStore.addStage({
            kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
            sourcePage: 'manual', label: (mode === 'keep' ? 'Keep only ' : 'Drop ') + columns.join(', '), columns, mode,
        });
        deps.onPlanChanged?.();
    });
    const addSort = createElement('form', 'prepare-workspace__policy-form');
    const sortTitle = createElement('h3');
    sortTitle.textContent = 'Add stable sort';
    const sortColumns = createElement('input', 'modal-input');
    sortColumns.name = 'columns';
    sortColumns.placeholder = 'Columns, comma-separated';
    sortColumns.required = true;
    sortColumns.setAttribute('aria-label', 'Columns to sort by');
    const sortDescending = checkbox('Sort descending', 'descending', false);
    const sortNullsLast = checkbox('Place nulls last', 'nullsLast', true);
    const sortSubmit = actionButton('Add sort', () => {});
    sortSubmit.type = 'submit';
    const sortStatus = createElement('p', 'prepare-workspace__policy-status');
    sortStatus.setAttribute('aria-live', 'polite');
    addSort.append(sortTitle, sortColumns, sortDescending, sortNullsLast, sortSubmit, sortStatus);
    addSort.addEventListener('submit', (event) => {
        event.preventDefault();
        const columns = sortColumns.value.split(',').map((column) => column.trim()).filter(Boolean);
        if (columns.length === 0 || new Set(columns).size !== columns.length) {
            sortStatus.textContent = 'Choose one or more unique columns.';
            return;
        }
        const descending = (addSort.elements.namedItem('descending') as HTMLInputElement).checked;
        const nullsLast = (addSort.elements.namedItem('nullsLast') as HTMLInputElement).checked;
        cleaningPlanStore.addStage({
            kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true,
            sourcePage: 'manual', label: 'Stable ' + (descending ? 'descending' : 'ascending') + ' sort by ' + columns.join(', '),
            columns, descending, nullsLast,
        });
        deps.onPlanChanged?.();
    });
    const addFill = createElement('form', 'prepare-workspace__policy-form');
    const fillTitle = createElement('h3'); fillTitle.textContent = 'Add ordered null fill';
    const fillColumns = createElement('input', 'modal-input'); fillColumns.name = 'columns'; fillColumns.placeholder = 'Columns, comma-separated'; fillColumns.required = true;
    const fillStrategy = createElement('select', 'modal-select'); fillStrategy.name = 'strategy';
    for (const [value, label] of [['forward', 'Forward fill'], ['backward', 'Backward fill']] as const) { const option = createElement('option'); option.value = value; option.textContent = label; fillStrategy.appendChild(option); }
    const fillLimit = createElement('input', 'modal-input'); fillLimit.name = 'limit'; fillLimit.type = 'number'; fillLimit.min = '1'; fillLimit.placeholder = 'Maximum consecutive fills (optional)';
    const fillSubmit = actionButton('Add null fill', () => {}); fillSubmit.type = 'submit';
    const fillStatus = createElement('p', 'prepare-workspace__policy-status'); fillStatus.setAttribute('aria-live', 'polite');
    addFill.append(fillTitle, fillColumns, fillStrategy, fillLimit, fillSubmit, fillStatus);
    addFill.addEventListener('submit', (event) => { event.preventDefault(); const columns = fillColumns.value.split(',').map((column) => column.trim()).filter(Boolean); const limit = fillLimit.value ? Number(fillLimit.value) : null; if (!hasEnabledTimeSort(plan)) { fillStatus.textContent = 'Add and enable a stable sort on the time column before ordered null fill.'; return; } if (columns.length === 0 || new Set(columns).size !== columns.length || (limit != null && (!Number.isInteger(limit) || limit <= 0))) { fillStatus.textContent = 'Choose unique columns and an optional positive integer limit.'; return; } const strategy = fillStrategy.value as 'forward' | 'backward'; cleaningPlanStore.addStage({ kind: 'fillNull', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: (strategy === 'forward' ? 'Forward' : 'Backward') + ' fill nulls in ' + columns.join(', '), columns, strategy, limit }); deps.onPlanChanged?.(); });
    const addResample = createElement('form', 'prepare-workspace__policy-form');
    const resampleTitle = createElement('h3'); resampleTitle.textContent = 'Add fixed-duration resampling';
    const resampleEvery = createElement('input', 'modal-input'); resampleEvery.name = 'every'; resampleEvery.placeholder = 'Fixed interval, for example 15m'; resampleEvery.required = true;
    const resampleAggregations = createElement('input', 'modal-input'); resampleAggregations.name = 'aggregations'; resampleAggregations.placeholder = 'value:mean, volume:sum'; resampleAggregations.required = true;
    const resampleSubmit = actionButton('Add resampling', () => {}); resampleSubmit.type = 'submit';
    const resampleStatus = createElement('p', 'prepare-workspace__policy-status'); resampleStatus.setAttribute('aria-live', 'polite');
    addResample.append(resampleTitle, resampleEvery, resampleAggregations, resampleSubmit, resampleStatus);
    addResample.addEventListener('submit', (event) => {
        event.preventDefault();
        const every = normalizeFixedDuration(resampleEvery.value);
        const aggregations = parseResampleAggregations(resampleAggregations.value, plan.timeColumn);
        if (!hasAscendingTimeSortBefore(plan)) { resampleStatus.textContent = 'Add an ascending stable sort with the time column first before resampling.'; return; }
        if (!every || !aggregations) { resampleStatus.textContent = 'Use a positive fixed interval and unique entries such as value:mean, volume:sum.'; return; }
        cleaningPlanStore.addStage({ kind: 'resample', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: 'Resample every ' + every, every, aggregations });
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
                const stages = plan.stages.map((candidate) => candidate.id === stage.id
                    ? { ...candidate, enabled: !stage.enabled } as CleaningPlan['stages'][number]
                    : candidate);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.setStageEnabled(stage.id, !stage.enabled);
                deps.onPlanChanged?.();
            }),
            actionButton('Up', () => {
                const stages = [...plan.stages];
                stages.splice(index - 1, 0, stages.splice(index, 1)[0]);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.reorderStage(stage.id, index - 1);
                deps.onPlanChanged?.();
            }, index === 0),
            actionButton('Down', () => {
                const stages = [...plan.stages];
                stages.splice(index + 1, 0, stages.splice(index, 1)[0]);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.reorderStage(stage.id, index + 1);
                deps.onPlanChanged?.();
            }, index === plan.stages.length - 1),
            actionButton('Remove', () => {
                const stages = plan.stages.filter((candidate) => candidate.id !== stage.id);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.removeStage(stage.id);
                deps.onPlanChanged?.();
            }),
        );
        item.append(summary, controls);
        list.append(item);
    }
    stagesSection.append(stageTitle, stageCopy, history, addPolicy, addDeduplicate, addColumnSelect, addSort, addFill, addResample, list);
    root.append(header, identity, qualitySection, graphSection, stagesSection);
}

/** Lazy page surface for orienting a data scientist before opening the editor overlay. */
export function initPreparePage(deps: PreparePageDeps = {}): () => void {
    const root = document.getElementById('prepare-workspace');
    if (!root) return () => {};
    let disposed = false;
    let profileMetadata: DatasetMetadata | null = null;
    let profileStatus: DatasetProfileResponse['status'] = 'not_started';
    let profileJobId: string | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const render = () => renderPrepareWorkspace(
        root,
        cleaningPlanStore.getSnapshot(),
        deps,
        profileMetadata,
        profileStatus,
        requestProfile,
        cancelProfile,
    );
    const acceptProfile = (response: DatasetProfileResponse) => {
        const plan = cleaningPlanStore.getSnapshot();
        if (!plan || response.sourceVersion?.id !== plan.sourceVersionId) return false;
        profileStatus = response.status;
        profileJobId = response.job?.id ?? null;
        if (response.metadata) profileMetadata = response.metadata;
        render();
        return response.status === 'queued' || response.status === 'running' || response.status === 'cancelling';
    };
    const pollProfile = () => {
        pollTimer = setTimeout(async () => {
            if (disposed) return;
            try {
                if (acceptProfile(await (deps.getProfile ?? fetchDatasetProfile)())) pollProfile();
            } catch {
                profileStatus = 'failed';
                render();
            }
        }, 500);
    };
    function requestProfile(): void {
        void (async () => {
            try {
                if (acceptProfile(await (deps.startProfile ?? startDatasetProfile)())) pollProfile();
            } catch {
                profileStatus = 'failed';
                render();
            }
        })();
    }
    function cancelProfile(): void {
        if (!profileJobId) return;
        void (async () => {
            try {
                await (deps.cancelProfile ?? cancelSessionJob)(profileJobId!);
                profileStatus = 'cancelling';
                render();
                pollProfile();
            } catch {
                // Keep the last known status; polling or a retry remains safe.
            }
        })();
    }
    render();
    const unsubscribe = cleaningPlanStore.subscribe(render);
    return () => {
        disposed = true;
        if (pollTimer != null) clearTimeout(pollTimer);
        unsubscribe();
    };
}
