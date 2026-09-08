import { buildPipelineGraph, renderPipelineGraphSvg } from '../../cleaning/pipelineGraph.js';
import { hasAscendingTimeSortBefore, normalizeFixedDuration, parseResampleAggregations } from '../../cleaning/resample.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { cancelSessionJob } from '../../cleaning/api.js';
import type { CleaningPlan } from '../../cleaning/types.js';
import type { ApiRequestOptions } from '../../services/api/http.js';
import type { WorkspaceStore } from '../../contracts/workspace.js';
import {
    fetchDatasetProfile,
    fetchSampledDatasetProfile,
    startDatasetProfile,
    startSampledDatasetProfile,
} from '../../services/api/profile.js';
import type { DatasetMetadata, DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
import type { DataObject } from '../../types/api.js';
import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';
import '../../../css/modules/prepare.css';

export const PREPARE_HELP: PageHelpContent = {
    pageName: 'Preparation',
    intro: 'Review and refine the reversible cleaning plan that EdaTime applies before analysis. Nothing here replaces the source dataset until you explicitly materialize a new version.',
    sections: [
        {
            title: 'Recommended order',
            bullets: [
                'Check source identity and quality findings first.',
                'Review the pipeline graph from left to right.',
                'Add or reorder stages, then open the workbench for parameter previews.',
                'Materialize only after the plan matches the intended analysis dataset.',
            ],
        },
        {
            title: 'How changes behave',
            body: 'Stage controls edit the canonical plan immediately, but source data remains unchanged. Undo and Redo operate on plan history; disabled stages stay in the plan and can be re-enabled later.',
        },
        {
            title: 'Quality profiles',
            body: 'Immediate findings are fast source checks. Sampled profiles estimate quality on part of a large dataset; exact profiles run in the background and provide authoritative counts.',
        },
    ],
    tips: [
        'Sort by the time column before adding a resample stage.',
        'Use the workbench when you need previews, import/export, or materialization.',
    ],
};

export interface PreparePageDeps {
    workspace?: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>
        & Partial<Pick<WorkspaceStore, 'setSelection' | 'setViewport'>>;
    showPage?: (pageName: string) => void;
    onPlanChanged?: () => void;
    startProfile?: (options?: ApiRequestOptions) => Promise<DatasetProfileResponse>;
    getProfile?: (options?: ApiRequestOptions) => Promise<DatasetProfileResponse>;
    startSampleProfile?: (options?: ApiRequestOptions) => Promise<DatasetProfileResponse>;
    getSampleProfile?: (options?: ApiRequestOptions) => Promise<DatasetProfileResponse>;
    cancelProfile?: (jobId: string, options?: ApiRequestOptions) => Promise<unknown>;
    getCurrentData?: () => DataObject | null;
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
        case 'chronologicalSplit': return 'Chronological split into ' + stage.outputColumn;
        case 'derivedColumn': return 'Derive ' + stage.outputColumn + ' = ' + stage.expression;
        case 'annotation': return stage.note?.trim() || stage.label;
    }
}

export function formatPipelinePreviewCaption(stages: CleaningPlan['stages']): { text: string; title: string } {
    const enabled = stages.filter((stage) => stage.enabled && stage.executionClass !== 'annotation');
    if (enabled.length === 0) {
        const baseline = 'Source baseline — add a stage to produce a post-pipeline preview.';
        return { text: baseline, title: baseline };
    }
    const summaries = enabled.map(stageSummary);
    const prefix = `After ${enabled.length} stage${enabled.length === 1 ? '' : 's'}: `;
    const title = prefix + summaries.join(' → ');
    const remaining = summaries.length - 3;
    return {
        text: prefix + summaries.slice(0, 3).join(' → ') + (remaining > 0 ? ` → +${remaining} more…` : ''),
        title,
    };
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

function textInput(label: string, value: string, name: string): HTMLLabelElement {
    const field = createElement('label', 'modal-field');
    const caption = createElement('span', 'modal-label');
    caption.textContent = label;
    const input = createElement('input', 'modal-input');
    input.name = name;
    input.value = value;
    field.append(caption, input);
    return field;
}

function selectInput(label: string, value: string, name: string, options: Array<[string, string]>): HTMLLabelElement {
    const field = createElement('label', 'modal-field');
    const caption = createElement('span', 'modal-label');
    caption.textContent = label;
    const select = createElement('select', 'modal-select');
    select.name = name;
    for (const [optionValue, optionLabel] of options) {
        const option = createElement('option');
        option.value = optionValue;
        option.textContent = optionLabel;
        option.selected = optionValue === value;
        select.appendChild(option);
    }
    field.append(caption, select);
    return field;
}

function configureColumnInput(
    input: HTMLInputElement,
    columns: readonly string[],
    options: { multiple?: boolean; aggregation?: boolean } = {},
): void {
    const available = [...new Set(columns.map((column) => column.trim()).filter(Boolean))];
    const key = options.aggregation ? 'aggregation' : options.multiple ? 'multiple' : 'single';
    const listId = `prepare-column-list-${key}`;
    const list = document.getElementById(listId) as HTMLDataListElement | null ?? createElement('datalist');
    list.id = listId;
    list.replaceChildren();
    for (const column of available) {
        const option = createElement('option');
        option.value = options.aggregation ? `${column}:mean` : column;
        list.appendChild(option);
    }
    if (!list.isConnected) document.body.appendChild(list);
    input.setAttribute('list', list.id);
    const examples = available.slice(0, options.multiple || options.aggregation ? 2 : 1);
    if (examples.length > 0) {
        input.placeholder = options.aggregation
            ? examples.map((column) => `${column}:mean`).join(', ')
            : examples.join(', ');
    }
    const validate = () => {
        const tokens = input.value.split(',').map((token) => token.trim()).filter(Boolean);
        const names = tokens.map((token) => options.aggregation ? token.split(':', 1)[0]!.trim() : token);
        const invalid = names.find((name) => !available.includes(name));
        input.setCustomValidity(invalid ? `Column '${invalid}' not in dataset` : '');
        input.title = input.validationMessage || `Available columns: ${available.join(', ')}`;
    };
    input.addEventListener('input', validate);
    input.addEventListener('change', validate);
    validate();
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

function renderPipelinePreviewChart(data: DataObject | null, columns: readonly string[]): HTMLElement {
    const frame = createElement('div', 'prepare-workspace__preview-chart');
    if (!data || data.ts.length === 0) {
        frame.textContent = 'Preview data is loading…';
        frame.setAttribute('role', 'status');
        return frame;
    }
    const visible = columns.filter((column) => data.values[column]).slice(0, 3);
    const values = visible.flatMap((column) => Array.from(data.values[column] ?? [], Number).filter(Number.isFinite));
    if (visible.length === 0 || values.length === 0) {
        frame.textContent = 'Select a numeric series in Signals to populate this preview.';
        return frame;
    }
    let yMin = Number.POSITIVE_INFINITY;
    let yMax = Number.NEGATIVE_INFINITY;
    for (const value of values) {
        yMin = Math.min(yMin, value);
        yMax = Math.max(yMax, value);
    }
    const ySpan = Math.max(1e-12, yMax - yMin);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 600 150');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Post-pipeline preview of ${visible.join(', ')}`);
    const colors = ['var(--cyan)', 'var(--amber)', 'var(--green)'];
    visible.forEach((column, seriesIndex) => {
        const series = data.values[column]!;
        const stride = Math.max(1, Math.ceil(series.length / 240));
        const points: string[] = [];
        for (let index = 0; index < series.length; index += stride) {
            const value = Number(series[index]);
            if (!Number.isFinite(value)) continue;
            const x = series.length > 1 ? 8 + (index / (series.length - 1)) * 584 : 300;
            const y = 142 - ((value - yMin) / ySpan) * 134;
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        path.setAttribute('points', points.join(' '));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', colors[seriesIndex]!);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.append(path);
    });
    frame.append(svg);
    return frame;
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
    profileKind: 'exact' | 'sampled',
    requestExactProfile: () => void,
    requestSampleProfile: () => void,
    cancelProfile: () => void,
): HTMLElement {
    const section = createElement('section', 'prepare-workspace__quality');
    section.id = 'prepare-profile-findings';
    const title = createElement('h2');
    title.textContent = 'Quality findings';
    const copy = createElement('p', 'prepare-workspace__copy');
    copy.textContent = profileStatus === 'ready'
        ? profileKind === 'exact'
            ? 'Exact background-profile findings can be turned into reversible stages. Review the proposed action before previewing or materializing.'
            : 'Sampled quality findings are estimates from ' + String(profileMetadata?.profile_sample_rows ?? 0) + ' rows. Confirm them with the exact report before materializing.'
        : profileStatus === 'queued' || profileStatus === 'running' || profileStatus === 'cancelling'
            ? 'Immediate source findings are shown while the ' + (profileKind === 'exact' ? 'exact' : 'sampled') + ' background quality report runs.'
            : 'Immediate source-profile findings can be turned into reversible stages. Build a bounded sample or exact quality report for a cached, versioned follow-up.';
    const sourceMetadata = profileMetadata;
    const timeQuality = sourceMetadata?.time_quality;
    const findings = (sourceMetadata?.column_profiles ?? [])
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
    const constantColumns = (sourceMetadata?.column_profiles ?? [])
        .filter((profile) => profile.is_constant === true)
        .sort((left, right) => String(left.name).localeCompare(String(right.name)));
    const zeroFrequencyColumns = (sourceMetadata?.column_profiles ?? [])
        .filter((profile) => !profile.is_constant && typeof profile.zero_count === 'number' && profile.zero_count > 0)
        .sort((left, right) => (Number(right.zero_count) || 0) - (Number(left.zero_count) || 0));
    const distributionColumns = (sourceMetadata?.column_profiles ?? [])
        .filter((profile) => numericDtype(String(profile.dtype ?? ''))
            && [profile.q25, profile.median, profile.q75, profile.interquartile_range]
                .every((value) => typeof value === 'number' && Number.isFinite(value)))
        .sort((left, right) => String(left.name).localeCompare(String(right.name)));
    const list = createElement('ul', 'prepare-workspace__quality-list');

    const inspectZeroRun = (profile: typeof zeroFrequencyColumns[number]) => {
        const start = Number(profile.longest_zero_run_start_ms);
        const end = Number(profile.longest_zero_run_end_ms);
        if (deps.workspace?.setSelection) {
            const current = deps.workspace.getSnapshot().selection;
            deps.workspace.setSelection(
                current.columns.includes(profile.name) ? current.columns : [...current.columns, profile.name],
                current.colorColumn,
            );
        }
        if (deps.workspace?.setViewport && Number.isFinite(start) && Number.isFinite(end) && end > start) {
            deps.workspace.setViewport({ xMin: start, xMax: end, yMin: null, yMax: null });
        }
        deps.showPage?.('timeseries');
    };

    const profileActions = createElement('div', 'prepare-workspace__quality-actions');
    const profileRunning = profileStatus === 'queued' || profileStatus === 'running' || profileStatus === 'cancelling';
    if (profileRunning) {
        const cancel = actionButton('Cancel ' + (profileKind === 'exact' ? 'exact' : 'sampled') + ' quality report', cancelProfile, profileStatus === 'cancelling');
        cancel.classList.add('prepare-workspace__quality-action');
        const progress = createElement('span', 'prepare-workspace__quality-progress');
        progress.setAttribute('role', 'status');
        progress.setAttribute('aria-live', 'polite');
        progress.textContent = profileStatus === 'cancelling'
            ? 'Cancelling report…'
            : `⏳ ${profileKind === 'exact' ? 'Exact' : 'Sampled'} report in progress…`;
        profileActions.append(progress, cancel);
    } else {
        const sample = actionButton(
            profileKind === 'sampled' && profileStatus === 'ready' ? 'Sampled quality report ready' : 'Build sampled quality report',
            requestSampleProfile,
            profileKind === 'sampled' && profileStatus === 'ready',
        );
        const exact = actionButton(
            profileKind === 'exact' && profileStatus === 'ready' ? 'Exact quality report ready' : 'Build exact quality report',
            requestExactProfile,
            profileKind === 'exact' && profileStatus === 'ready',
        );
        sample.classList.add('prepare-workspace__quality-action');
        exact.classList.add('prepare-workspace__quality-action');
        sample.title = 'Computes an estimated quality report from a bounded sample.';
        exact.title = 'Computes null counts, type checks, and distribution stats for the full dataset. May take several seconds for large data.';
        profileActions.append(sample, exact);
    }

    const profileTable = createElement('table', 'prepare-workspace__quality-table');
    profileTable.setAttribute('aria-label', `${profileKind === 'exact' ? 'Exact' : 'Sampled'} column quality report`);
    const profileHead = createElement('thead');
    const profileHeaderRow = createElement('tr');
    for (const heading of ['Column', 'dtype', '% missing', 'status', 'Action']) {
        const cell = createElement('th');
        cell.scope = 'col';
        cell.textContent = heading;
        profileHeaderRow.append(cell);
    }
    profileHead.append(profileHeaderRow);
    const profileBody = createElement('tbody');
    if (profileStatus === 'ready') {
        for (const profile of sourceMetadata?.column_profiles ?? []) {
            const row = createElement('tr');
            const nullCount = Math.max(0, Number(profile.null_count) || 0);
            const denominator = Math.max(0, Number(sourceMetadata?.total_rows) || 0);
            const missingPercent = denominator > 0 ? (nullCount / denominator) * 100 : 0;
            const status = nullCount > 0 || (Number(profile.non_finite_count) || 0) > 0 ? 'Needs review' : 'OK';
            for (const value of [profile.name, profile.dtype, `${missingPercent.toFixed(2)}%`, status]) {
                const cell = createElement('td');
                cell.textContent = value;
                row.append(cell);
            }
            const actionCell = createElement('td');
            const exists = hasMissingValuePolicy(plan, profile.name, 'null');
            const addPolicy = actionButton(exists ? 'Policy added' : 'Add missing-value policy', () => {
                cleaningPlanStore.addStage({
                    kind: 'missingValue', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                    sourcePage: 'manual', label: 'Drop missing values from ' + profile.name,
                    column: profile.name, dropNulls: true, dropNonFinite: numericDtype(profile.dtype),
                });
                deps.onPlanChanged?.();
            }, exists);
            addPolicy.title = `Add a reversible missing-value stage for ${profile.name}`;
            actionCell.append(addPolicy);
            row.append(actionCell);
            profileBody.append(row);
        }
    }
    profileTable.append(profileHead, profileBody);
    profileTable.hidden = profileBody.children.length === 0;

    if (timeQuality) {
        const item = createElement('li', 'prepare-workspace__quality-finding');
        item.dataset.qualityKind = 'time';
        const summary = createElement('div');
        const label = createElement('strong');
        label.textContent = 'Time axis';
        const detail = createElement('span');
        const duplicateSuffix = timeQuality.duplicate_timestamp_count === 1 ? '' : 's';
        const orderSuffix = timeQuality.out_of_order_count === 1 ? '' : 's';
        const gap = typeof timeQuality.median_gap_ms === 'number'
            ? ' · median observed gap ' + String(timeQuality.median_gap_ms) + ' ms'
            : '';
        detail.textContent = String(timeQuality.unique_timestamp_count) + ' unique timestamps · '
            + String(timeQuality.duplicate_timestamp_count) + ' duplicate timestamp' + duplicateSuffix + ' · '
            + String(timeQuality.out_of_order_count) + ' out-of-order transition' + orderSuffix + gap;
        summary.append(label, detail);
        item.append(summary);
        list.append(item);
    }

    for (const profile of constantColumns) {
        const item = createElement('li', 'prepare-workspace__quality-finding');
        item.dataset.qualityColumn = profile.name;
        item.dataset.qualityKind = 'constant';
        const summary = createElement('div');
        const label = createElement('strong');
        label.textContent = profile.name;
        const detail = createElement('span');
        const finiteCount = typeof profile.finite_count === 'number' ? profile.finite_count : 0;
        const zeroCount = typeof profile.zero_count === 'number' ? profile.zero_count : 0;
        detail.textContent = 'constant numeric values · ' + String(finiteCount) + ' finite values · '
            + String(zeroCount) + ' zero' + (zeroCount === 1 ? '' : 's');
        summary.append(label, detail);
        item.append(summary);
        list.append(item);
    }

    for (const profile of zeroFrequencyColumns) {
        const item = createElement('li', 'prepare-workspace__quality-finding');
        item.dataset.qualityColumn = profile.name;
        item.dataset.qualityKind = 'zero-frequency';
        const summary = createElement('div');
        const label = createElement('strong');
        label.textContent = profile.name;
        const detail = createElement('span');
        const zeroCount = Number(profile.zero_count) || 0;
        const finiteCount = Number(profile.finite_count) || 0;
        const rate = finiteCount > 0 ? ` (${((zeroCount / finiteCount) * 100).toFixed(1)}%)` : '';
        const longestRun = Number(profile.longest_zero_run) || 0;
        const certainty = profileKind === 'sampled' ? 'sampled ' : 'exact ';
        const runLabel = profileKind === 'sampled' ? 'estimated longest consecutive run' : 'longest consecutive run';
        detail.textContent = `${zeroCount} ${certainty}zero value${zeroCount === 1 ? '' : 's'}${rate} · `
            + `candidate for zero-frequency/run inspection${longestRun > 1 ? ` · ${runLabel} ${longestRun}` : ''}`;
        summary.append(label, detail);
        const inspect = actionButton('Inspect in Signals', () => inspectZeroRun(profile));
        inspect.title = Number.isFinite(Number(profile.longest_zero_run_start_ms))
            ? 'Open the longest reported zero run in Signals.'
            : 'Open this series in Signals; no timestamp interval was supplied by the profile.';
        item.append(summary, inspect);
        list.append(item);
    }

    for (const profile of distributionColumns) {
        const item = createElement('li', 'prepare-workspace__quality-finding');
        item.dataset.qualityColumn = profile.name;
        item.dataset.qualityKind = 'distribution';
        const summary = createElement('div');
        const label = createElement('strong');
        label.textContent = profile.name;
        const detail = createElement('span');
        const q25 = Number(profile.q25);
        const median = Number(profile.median);
        const q75 = Number(profile.q75);
        const iqr = Number(profile.interquartile_range);
        const low = q25 - 1.5 * iqr;
        const high = q75 + 1.5 * iqr;
        const certainty = profileKind === 'sampled' ? 'estimated ' : '';
        detail.textContent = `${certainty}distribution Q1 ${q25} · median ${median} · Q3 ${q75} · IQR ${iqr}`
            + ` · candidate IQR range ${low} → ${high} (investigate; not an automatic exclusion)`;
        summary.append(label, detail);
        item.append(summary);
        list.append(item);
    }

    if (findings.length === 0) {
        const empty = createElement('li', 'prepare-workspace__quality-empty');
        const exact = (profileKind === 'exact' && profileStatus === 'ready') || sourceMetadata?.profile_status === 'exact';
        const sampled = profileKind === 'sampled' && profileStatus === 'ready';
        empty.textContent = exact
            ? 'No null or non-finite findings are present in the exact profile.'
            : sampled
                ? 'No null or non-finite findings are present in this sampled estimate.'
            : sourceMetadata
                ? 'Column quality findings are pending the exact profile.'
                : 'Load dataset metadata to inspect source-profile findings.';
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
    section.append(title, copy, profileActions, profileTable, list);
    return section;
}

function renderPrepareWorkspace(
    root: HTMLElement,
    plan: CleaningPlan | null,
    deps: PreparePageDeps,
    profileMetadata: DatasetMetadata | null,
    profileStatus: DatasetProfileResponse['status'],
    profileKind: 'exact' | 'sampled',
    requestExactProfile: () => void,
    requestSampleProfile: () => void,
    cancelProfile: () => void,
): void {
    root.replaceChildren();
    const header = createElement('div', 'page-header prepare-workspace__header');
    const heading = createElement('div');
    const titleRow = createElement('div', 'prepare-workspace__title-row');
    const title = createElement('h1', 'page-header__title');
    title.textContent = 'Preparation';
    const help = createElement('button', 'page-help-trigger');
    help.id = 'prepare-help-btn';
    help.type = 'button';
    const helpIcon = createElement('span');
    helpIcon.setAttribute('aria-hidden', 'true');
    helpIcon.textContent = '?';
    const helpLabel = createElement('span', 'page-help-trigger__label');
    helpLabel.textContent = 'Help';
    help.append(helpIcon, helpLabel);
    titleRow.append(title, help);
    const copy = createElement('p', 'prepare-workspace__copy');
    copy.textContent = 'Review the reversible preprocessing pipeline before materializing a new dataset version.';
    heading.append(titleRow, copy);
    const openWorkbench = createElement('button', 'btn btn-primary btn-sm');
    openWorkbench.type = 'button';
    openWorkbench.textContent = 'Open Pipeline Workbench';
    openWorkbench.disabled = !plan;
    openWorkbench.addEventListener('click', () => document.getElementById('open-cleaning-plan-btn')?.click());
    header.append(heading, openWorkbench);

    const localNav = createElement('nav', 'prepare-workspace__local-nav');
    localNav.setAttribute('aria-label', 'Prepare sections');
    for (const [label, targetId] of [
        ['Applied in Signals', 'prepare-signals-filters'],
        ['Record an insight', 'prepare-insight-record'],
        ['Profile findings', 'prepare-profile-findings'],
        ['Pipeline preview', 'prepare-pipeline-preview'],
        ['Pipeline stages', 'prepare-pipeline-stages'],
    ] as const) {
        const link = createElement('a');
        link.href = `#${targetId}`;
        link.textContent = label;
        link.addEventListener('click', (event) => {
            event.preventDefault();
            document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        localNav.append(link);
    }
    const previewExport = createElement('button');
    previewExport.type = 'button';
    previewExport.textContent = 'Preview & export';
    previewExport.disabled = !plan;
    previewExport.addEventListener('click', () => document.getElementById('open-cleaning-plan-btn')?.click());
    localNav.append(previewExport);

    const identity = createElement('section', 'prepare-workspace__identity');
    identity.setAttribute('aria-label', 'Pipeline source identity');
    if (!plan) {
        identity.textContent = 'Load a dataset to create and inspect a preprocessing plan.';
        root.append(header, identity);
        return;
    }
    const activeStages = plan.stages.filter((stage) => stage.enabled && stage.executionClass !== 'annotation').length;
    const identityPrefix = createElement('span');
    identityPrefix.textContent = 'Source ' + plan.sourceVersionId + ' · ';
    const revisionLink = createElement('button', 'prepare-workspace__revision-link');
    revisionLink.type = 'button';
    revisionLink.textContent = 'revision ' + String(plan.datasetRevision);
    revisionLink.title = 'Open Graph history in the Pipeline Workbench';
    revisionLink.addEventListener('click', () => document.getElementById('open-cleaning-plan-btn')?.click());
    const identitySuffix = createElement('span');
    identitySuffix.textContent = ' · ' + String(activeStages) + ' active executable stage' + (activeStages === 1 ? '' : 's')
        + ' · ' + (cleaningPlanStore.isDirty() ? 'Not yet applied — preview to see effect' : 'Source baseline');
    identity.append(identityPrefix, revisionLink, identitySuffix);

    const filters = deps.workspace?.getSnapshot().filters;
    const rangeFilters = Object.entries(filters?.columnRanges ?? {});
    const adaptiveFilters = filters?.adaptiveLines ?? [];
    const signalsFilterSection = (() => {
            const section = createElement('section', 'prepare-workspace__signals-filters');
            section.id = 'prepare-signals-filters';
            const heading = createElement('h2');
            heading.textContent = 'Applied in Signals';
            const summary = createElement('p', 'prepare-workspace__copy');
            summary.textContent = 'Signals filters are saved in the pipeline and applied to correlations, density/scatter plots, and diagnostics.';
            const list = createElement('ul', 'prepare-workspace__signals-filter-list');
            for (const [column, range] of rangeFilters) {
                const item = createElement('li');
                item.textContent = 'Keep ' + column + ' between ' + String(range.from) + ' and ' + String(range.to);
                list.append(item);
            }
            for (const filter of adaptiveFilters) {
                const item = createElement('li');
                item.textContent = filter.column + ': keep ' + (filter.keepAbove ? 'above' : 'below') + ' the drawn line';
                list.append(item);
            }
            if (rangeFilters.length === 0 && adaptiveFilters.length === 0) {
                const item = createElement('li');
                item.textContent = 'Empty — no Signals filters are active.';
                item.title = 'Add a value-range or adaptive-line filter from Signals to populate this section.';
                list.append(item);
            }
            section.append(heading, summary, list);
            return section;
        })();

    const qualitySection = renderQualityFindings(
        plan, deps, profileMetadata, profileStatus, profileKind,
        requestExactProfile, requestSampleProfile, cancelProfile,
    );

    const insightSection = createElement('section', 'prepare-workspace__insight');
    insightSection.id = 'prepare-insight-record';
    const insightTitle = createElement('h2');
    insightTitle.textContent = 'Record an insight';
    const insightCopy = createElement('p', 'prepare-workspace__copy');
    insightCopy.textContent = 'Capture why an interval or relationship is being retained, flagged, excluded, or transformed. The note is stored as a pipeline annotation and travels with materialized exports.';
    const insightForm = createElement('form', 'prepare-workspace__policy-form');
    const insightDecision = selectInput('Decision', 'retain', 'decision', [
        ['retain', 'Retain as observed'],
        ['flag', 'Flag for follow-up'],
        ['exclude', 'Exclude with a rule'],
        ['transform', 'Transform with a rule'],
    ]).querySelector('select') as HTMLSelectElement;
    const insightColumns = textInput('Columns', (deps.workspace?.getSnapshot().selection.columns ?? []).join(', '), 'columns');
    const insightMetric = selectInput('Metric context', 'raw_pearson', 'metric', [
        ['raw_pearson', 'Raw Pearson'],
        ['raw_spearman', 'Raw Spearman'],
        ['difference_pearson', 'First-difference Pearson'],
        ['difference_spearman', 'First-difference Spearman'],
        ['none', 'No metric'],
    ]).querySelector('select') as HTMLSelectElement;
    const insightNote = document.createElement('label');
    insightNote.className = 'modal-field';
    const insightNoteLabel = document.createElement('span');
    insightNoteLabel.className = 'modal-label';
    insightNoteLabel.textContent = 'Evidence and rationale';
    const insightNoteInput = document.createElement('textarea');
    insightNoteInput.className = 'modal-input';
    insightNoteInput.name = 'note';
    insightNoteInput.rows = 3;
    insightNoteInput.required = true;
    insightNoteInput.placeholder = 'For example: HULL zeros form a long operating plateau; retain pending domain confirmation.';
    insightNote.append(insightNoteLabel, insightNoteInput);
    const insightStatus = createElement('p', 'prepare-workspace__policy-status');
    insightStatus.setAttribute('aria-live', 'polite');
    const insightSubmit = actionButton('Save insight', () => {});
    insightSubmit.type = 'submit';
    insightForm.append(insightDecision.closest('label')!, insightColumns, insightMetric.closest('label')!, insightNote, insightSubmit, insightStatus);
    insightForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const note = insightNoteInput.value.trim();
        if (!note) {
            insightStatus.textContent = 'Add a short evidence note before saving.';
            return;
        }
        const snapshot = deps.workspace?.getSnapshot();
        const columns = insightColumns.querySelector('input')?.value.split(',').map((column) => column.trim()).filter(Boolean) ?? [];
        const range = snapshot?.viewport && Number.isFinite(snapshot.viewport.xMin) && Number.isFinite(snapshot.viewport.xMax)
            ? ` · time ${snapshot.viewport.xMin}–${snapshot.viewport.xMax}`
            : '';
        const metric = insightMetric.value === 'none' ? '' : ` · metric ${insightMetric.options[insightMetric.selectedIndex]?.textContent ?? insightMetric.value}`;
        const decision = insightDecision.options[insightDecision.selectedIndex]?.textContent ?? insightDecision.value;
        cleaningPlanStore.addStage({
            kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true,
            sourcePage: 'manual', label: `Insight — ${decision}`,
            note: `${note} · Decision: ${decision}${columns.length ? ` · columns ${columns.join(', ')}` : ''}${range}${metric}`,
            severity: insightDecision.value === 'exclude' ? 'critical' : insightDecision.value === 'flag' ? 'warning' : 'info',
        });
        insightNoteInput.value = '';
        insightStatus.textContent = 'Insight saved in the canonical pipeline annotation.';
        deps.onPlanChanged?.();
    });

    const graphSection = createElement('section', 'prepare-workspace__graph');
    graphSection.id = 'prepare-pipeline-preview';
    const graphTitle = createElement('h2');
    graphTitle.textContent = 'Current pipeline';
    const graphCopy = createElement('p', 'prepare-workspace__copy');
    graphCopy.textContent = 'This overview is derived directly from the active canonical plan. Use the workbench to edit stages, preview impacts, export, or materialize.';
    const previewCaption = createElement('p', 'prepare-workspace__preview-caption');
    const caption = formatPipelinePreviewCaption(plan.stages);
    previewCaption.textContent = caption.text;
    previewCaption.title = caption.title;
    const graphScroll = createElement('div', 'prepare-workspace__graph-scroll');
    graphScroll.innerHTML = renderPipelineGraphSvg(buildPipelineGraph(plan));
    const previewChart = renderPipelinePreviewChart(
        deps.getCurrentData?.() ?? null,
        deps.workspace?.getSnapshot().selection.columns ?? [],
    );
    graphSection.append(graphTitle, graphCopy, previewCaption, previewChart, graphScroll);

    const stagesSection = createElement('section', 'prepare-workspace__stages');
    stagesSection.id = 'prepare-pipeline-stages';
    const stageTitle = createElement('h2');
    stageTitle.textContent = 'Ordered stages';
    const stageCopy = createElement('p', 'prepare-workspace__copy');
    stageCopy.textContent = 'These controls change the active canonical plan. Open the workbench to edit stage parameters, preview impacts, export, or materialize.';
    const history = createElement('div', 'prepare-workspace__history');
    const previewMaterialize = actionButton('Preview / Materialize', () => document.getElementById('open-cleaning-plan-btn')?.click(), plan.stages.length === 0);
    previewMaterialize.title = plan.stages.length === 0 ? 'Add at least one stage to preview' : 'Open preview and materialization controls';
    history.append(
        actionButton('Undo', () => { if (cleaningPlanStore.undo()) deps.onPlanChanged?.(); }, !cleaningPlanStore.canUndo()),
        actionButton('Redo', () => { if (cleaningPlanStore.redo()) deps.onPlanChanged?.(); }, !cleaningPlanStore.canRedo()),
        previewMaterialize,
    );
    const addPolicy = createElement('form', 'prepare-workspace__policy-form');
    const policyTitle = createElement('h3');
    policyTitle.textContent = 'Add missing-value policy';
    const policyColumn = createElement('input', 'modal-input');
    policyColumn.name = 'column';
    policyColumn.placeholder = 'Numeric column';
    policyColumn.required = true;
    policyColumn.setAttribute('aria-label', 'Numeric column');
    configureColumnInput(policyColumn, deps.workspace?.getSnapshot().dataset.metadata?.numeric_columns ?? []);
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
    configureColumnInput(deduplicateColumns, (deps.workspace?.getSnapshot().dataset.metadata?.columns ?? []).map((column) => column.name), { multiple: true });
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
    configureColumnInput(columnSelectColumns, (deps.workspace?.getSnapshot().dataset.metadata?.columns ?? []).map((column) => column.name), { multiple: true });
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
    configureColumnInput(sortColumns, (deps.workspace?.getSnapshot().dataset.metadata?.columns ?? []).map((column) => column.name), { multiple: true });
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
    configureColumnInput(fillColumns, (deps.workspace?.getSnapshot().dataset.metadata?.columns ?? []).map((column) => column.name), { multiple: true });
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
    configureColumnInput(resampleAggregations, deps.workspace?.getSnapshot().dataset.metadata?.numeric_columns ?? [], { multiple: true, aggregation: true });
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
        empty.textContent = 'No transformations have been added yet. Create one from Signals or open the workbench.';
        list.append(empty);
    }
    for (const [index, stage] of plan.stages.entries()) {
        const item = createElement('li', 'prepare-workspace__stage');
        item.classList.toggle('is-disabled', !stage.enabled);
        if (stage.sourcePage === 'correlation') {
            try {
                if (window.sessionStorage.getItem('edatime-highlight-correlation-stage') === '1') {
                    item.classList.add('is-new');
                    window.sessionStorage.removeItem('edatime-highlight-correlation-stage');
                    window.setTimeout(() => item.classList.remove('is-new'), 1800);
                }
            } catch { /* optional visual handoff */ }
        }
        const summary = createElement('div', 'prepare-workspace__stage-summary');
        const label = createElement('strong');
        label.textContent = stage.label || stage.kind;
        const detail = createElement('span');
        detail.textContent = stageSummary(stage) + (stage.enabled ? '' : ' · disabled');
        summary.append(label, detail);
        const controls = createElement('details', 'prepare-workspace__stage-controls');
        controls.open = !window.matchMedia('(max-width: 680px)').matches;
        const controlsSummary = createElement('summary');
        controlsSummary.textContent = 'Stage actions';
        const controlsList = createElement('div', 'prepare-workspace__stage-actions');
        const toggleStage = actionButton(stage.enabled ? 'Disable' : 'Enable', () => {
                const stages = plan.stages.map((candidate) => candidate.id === stage.id
                    ? { ...candidate, enabled: !stage.enabled } as CleaningPlan['stages'][number]
                    : candidate);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.setStageEnabled(stage.id, !stage.enabled);
                deps.onPlanChanged?.();
            });
        const moveUp = actionButton('Up', () => {
                const stages = [...plan.stages];
                stages.splice(index - 1, 0, stages.splice(index, 1)[0]);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.reorderStage(stage.id, index - 1);
                deps.onPlanChanged?.();
            }, index === 0);
        const moveDown = actionButton('Down', () => {
                const stages = [...plan.stages];
                stages.splice(index + 1, 0, stages.splice(index, 1)[0]);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.reorderStage(stage.id, index + 1);
                deps.onPlanChanged?.();
            }, index === plan.stages.length - 1);
        const removeStage = actionButton('Remove', () => {
                if (typeof window.confirm === 'function'
                    && !window.confirm(`Remove '${stage.label || stageSummary(stage)}'? This cannot be undone.`)) return;
                const stages = plan.stages.filter((candidate) => candidate.id !== stage.id);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { resampleStatus.textContent = error; return; }
                cleaningPlanStore.removeStage(stage.id);
                deps.onPlanChanged?.();
            });
        if (moveUp.disabled) moveUp.title = plan.stages.length === 1 ? 'Cannot move the only remaining stage' : 'Already the first stage';
        if (moveDown.disabled) moveDown.title = plan.stages.length === 1 ? 'Cannot move the only remaining stage' : 'Already the last stage';
        removeStage.title = 'Permanently delete this stage from the plan';
        controlsList.append(toggleStage, moveUp, moveDown, removeStage);
        controls.append(controlsSummary, controlsList);
        item.append(summary, controls);
        list.append(item);
    }
    stagesSection.append(stageTitle, stageCopy, history, addPolicy, addDeduplicate, addColumnSelect, addSort, addFill, addResample, list);
    root.append(header, localNav, identity);
    root.append(signalsFilterSection, insightSection, qualitySection, graphSection, stagesSection);
}

/** Lazy page surface for orienting a data scientist before opening the editor overlay. */
export function initPreparePage(deps: PreparePageDeps = {}): () => void {
    const root = document.getElementById('prepare-workspace');
    if (!root) return () => {};
    let disposed = false;
    let request = new AbortController();
    let profileMetadata: DatasetMetadata | null = null;
    let profileStatus: DatasetProfileResponse['status'] = 'not_started';
    let profileKind: 'exact' | 'sampled' = 'exact';
    let profileJobId: string | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let disposeHelp = () => {};
    const render = () => {
        if (disposed) return;
        disposeHelp();
        renderPrepareWorkspace(
            root,
            cleaningPlanStore.getSnapshot(),
            deps,
            profileMetadata ?? deps.workspace?.getSnapshot().dataset.metadata ?? null,
            profileStatus,
            profileKind,
            requestExactProfile,
            requestSampleProfile,
            cancelProfile,
        );
        disposeHelp = initPageHelp('prepare', PREPARE_HELP);
    };
    const acceptProfile = (response: DatasetProfileResponse, kind: 'exact' | 'sampled', owner: AbortController) => {
        if (disposed || owner.signal.aborted || owner !== request) return false;
        const plan = cleaningPlanStore.getSnapshot();
        if (!plan || response.sourceVersion?.id !== plan.sourceVersionId) return false;
        if (kind === 'exact' && response.algorithmVersion !== 'exact-v1') return false;
        if (kind === 'sampled' && response.algorithmVersion !== 'sample-v1') return false;
        profileKind = kind;
        profileStatus = response.status;
        profileJobId = response.job?.id ?? null;
        if (response.metadata) profileMetadata = response.metadata;
        render();
        return response.status === 'queued' || response.status === 'running' || response.status === 'cancelling';
    };
    const pollProfile = (kind: 'exact' | 'sampled', owner = request) => {
        if (pollTimer != null) clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
            if (disposed || owner.signal.aborted || owner !== request) return;
            try {
                const get = kind === 'exact'
                    ? (deps.getProfile ?? fetchDatasetProfile)
                    : (deps.getSampleProfile ?? fetchSampledDatasetProfile);
                if (acceptProfile(await get({ signal: owner.signal }), kind, owner)) pollProfile(kind, owner);
            } catch {
                if (disposed || owner.signal.aborted || owner !== request) return;
                profileStatus = 'failed';
                render();
            }
        }, 500);
    };
    function requestProfile(kind: 'exact' | 'sampled'): void {
        request.abort();
        const owner = new AbortController();
        request = owner;
        if (pollTimer != null) clearTimeout(pollTimer);
        void (async () => {
            profileKind = kind;
            try {
                const start = kind === 'exact'
                    ? (deps.startProfile ?? startDatasetProfile)
                    : (deps.startSampleProfile ?? startSampledDatasetProfile);
                if (acceptProfile(await start({ signal: owner.signal }), kind, owner)) pollProfile(kind, owner);
            } catch {
                if (disposed || owner.signal.aborted || owner !== request) return;
                profileStatus = 'failed';
                render();
            }
        })();
    }
    function requestExactProfile(): void { requestProfile('exact'); }
    function requestSampleProfile(): void { requestProfile('sampled'); }
    function cancelProfile(): void {
        if (!profileJobId) return;
        const owner = request;
        void (async () => {
            try {
                await (deps.cancelProfile ?? cancelSessionJob)(profileJobId!, { signal: owner.signal });
                if (disposed || owner.signal.aborted || owner !== request) return;
                profileStatus = 'cancelling';
                render();
                pollProfile(profileKind);
            } catch {
                // Keep the last known status; polling or a retry remains safe.
            }
        })();
    }
    render();
    let sourceId = cleaningPlanStore.getSnapshot()?.sourceVersionId;
    const unsubscribe = cleaningPlanStore.subscribe(() => {
        const nextSource = cleaningPlanStore.getSnapshot()?.sourceVersionId;
        if (nextSource !== sourceId) {
            sourceId = nextSource;
            request.abort();
            request = new AbortController();
            if (pollTimer != null) clearTimeout(pollTimer);
            profileMetadata = null;
            profileStatus = 'not_started';
            profileJobId = null;
        }
        render();
    });
    const unsubscribeWorkspace = deps.workspace?.subscribe(render);
    return () => {
        disposed = true;
        request.abort();
        unsubscribeWorkspace?.();
        if (pollTimer != null) clearTimeout(pollTimer);
        disposeHelp();
        unsubscribe();
    };
}
