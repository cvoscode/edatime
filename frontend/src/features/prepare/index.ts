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
import { getEffectiveColumnNames, getEffectiveNumericColumns } from '../../platform/analyticsColumns.js';
import { createPipelineExportControls } from '../../cleaning/exportControls.js';
import { addDerivedColumn } from '../../cleaning/derivedColumn.js';
import { initPageHelp, type PageHelpContent } from '../../ui/pageHelp.js';
import { createPreparationPreview, type PreparationPreview } from './preview.js';
import { capturePreparationView, initPreparationNavigation, keyPreparationControls, restorePreparationView } from './viewState.js';
import '../../../css/modules/prepare.css';

export const PREPARE_HELP: PageHelpContent = {
    pageName: 'Preparation',
    intro: 'Prepare data in Signals, then review, refine, and export the pipeline here. Every plot uses the current enabled stages. Create a prepared dataset to save the result as a new version.',
    sections: [
        {
            title: 'Recommended order',
            bullets: [
                'Check source identity and quality findings first.',
                'Review the current pipeline and its numbered stages in order.',
                'Add or reorder stages, then preview exact row and schema impacts before materializing.',
                'Create a prepared dataset after a successful preview of the current plan. Editing or undoing a stage requires a new preview.',
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
        'Export the full working dataset as Parquet, the pipeline as JSON, or executable Python and Rust code.',
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
    refreshDatasetAfterMutation?: () => void | Promise<void>;
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (element instanceof HTMLInputElement) element.type = 'text';
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

let fieldLabelSequence = 0;

function labeledControl(label: string, control: HTMLInputElement | HTMLSelectElement, hint?: string): HTMLLabelElement {
    const field = createElement('label', 'modal-field');
    const caption = createElement('span', 'modal-label');
    caption.textContent = label;
    caption.id = `prepare-field-label-${++fieldLabelSequence}`;
    if (!control.hasAttribute('aria-label')) control.setAttribute('aria-labelledby', caption.id);
    field.append(caption, control);
    if (hint) {
        const description = createElement('span', 'prepare-workspace__field-hint');
        description.id = `prepare-hint-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        description.textContent = hint;
        control.setAttribute('aria-describedby', description.id);
        field.append(description);
    }
    return field;
}

function formatQualityNumber(value: number): string {
    return value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function formatGap(milliseconds: number): string {
    for (const [unit, size] of [['days', 86_400_000], ['h', 3_600_000], ['min', 60_000], ['s', 1_000]] as const) {
        if (Math.abs(milliseconds) >= size) return `${formatQualityNumber(milliseconds / size)} ${unit}`;
    }
    return `${formatQualityNumber(milliseconds)} ms`;
}

function qualityDisclosure(id: string, label: string, content: HTMLElement, open = false): HTMLDetailsElement {
    const details = createElement('details', 'prepare-workspace__quality-group');
    details.id = `prepare-quality-${id}`;
    details.open = open;
    const summary = createElement('summary');
    summary.textContent = label;
    details.append(summary, content);
    return details;
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
    return /^(u?int|float|decimal|[iuf]\d)/i.test(dtype.trim());
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
            : 'Sampled quality findings are estimates from ' + (profileMetadata?.profile_sample_rows ?? 0).toLocaleString() + ' rows. Confirm them with the exact report before materializing.'
        : profileStatus === 'queued' || profileStatus === 'running' || profileStatus === 'cancelling'
            ? 'Immediate source findings are shown while the ' + (profileKind === 'exact' ? 'exact' : 'sampled') + ' background quality report runs.'
            : 'Immediate source-profile findings can be turned into reversible stages. Build a bounded sample or exact quality report for a cached, versioned follow-up.';
    const sourceMetadata = profileMetadata;
    const reportReady = profileStatus === 'ready' || sourceMetadata?.profile_status === 'exact' || sourceMetadata?.profile_status === 'sampled';
    const reportKind = sourceMetadata?.profile_status === 'sampled' ? 'sampled'
        : sourceMetadata?.profile_status === 'exact' ? 'exact' : profileKind;
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
    const timeList = createElement('ul', 'prepare-workspace__quality-list');
    const constantList = createElement('ul', 'prepare-workspace__quality-list');
    const zeroList = createElement('ul', 'prepare-workspace__quality-list');
    const distributionList = createElement('ul', 'prepare-workspace__quality-list');

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
    profileTable.setAttribute('aria-label', `${reportKind === 'exact' ? 'Exact' : 'Sampled'} column quality report`);
    const profileHead = createElement('thead');
    const profileHeaderRow = createElement('tr');
    for (const heading of ['Column', 'Type', 'Missing', 'Status']) {
        const cell = createElement('th');
        cell.scope = 'col';
        cell.textContent = heading;
        profileHeaderRow.append(cell);
    }
    profileHead.append(profileHeaderRow);
    const profileBody = createElement('tbody');
    if (reportReady) {
        for (const profile of sourceMetadata?.column_profiles ?? []) {
            const row = createElement('tr');
            const nullCount = Math.max(0, Number(profile.null_count) || 0);
            const denominator = Math.max(0, Number(reportKind === 'sampled' ? sourceMetadata?.profile_sample_rows : sourceMetadata?.total_rows) || 0);
            const missingPercent = denominator > 0 ? (nullCount / denominator) * 100 : 0;
            const status = nullCount > 0 || (Number(profile.non_finite_count) || 0) > 0 ? 'Needs review' : 'OK';
            for (const value of [profile.name, profile.dtype, denominator > 0 ? `${missingPercent.toFixed(2)}%` : `${nullCount.toLocaleString()} values`, status]) {
                const cell = createElement('td');
                cell.textContent = value;
                row.append(cell);
            }
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
            ? ' · median observed gap ' + formatGap(timeQuality.median_gap_ms)
            : '';
        detail.textContent = timeQuality.unique_timestamp_count.toLocaleString() + ' unique timestamps · '
            + timeQuality.duplicate_timestamp_count.toLocaleString() + ' duplicate timestamp' + duplicateSuffix + ' · '
            + timeQuality.out_of_order_count.toLocaleString() + ' out-of-order transition' + orderSuffix + gap;
        summary.append(label, detail);
        item.append(summary);
        timeList.append(item);
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
        detail.textContent = 'constant numeric values · ' + finiteCount.toLocaleString() + ' finite values · '
            + zeroCount.toLocaleString() + ' zero' + (zeroCount === 1 ? '' : 's');
        summary.append(label, detail);
        item.append(summary);
        constantList.append(item);
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
        const certainty = reportKind === 'sampled' ? 'sampled ' : 'exact ';
        const runLabel = reportKind === 'sampled' ? 'estimated longest consecutive run' : 'longest consecutive run';
        detail.textContent = `${zeroCount.toLocaleString()} ${certainty}zero value${zeroCount === 1 ? '' : 's'}${rate} · `
            + `candidate for zero-frequency/run inspection${longestRun > 1 ? ` · ${runLabel} ${longestRun.toLocaleString()}` : ''}`;
        summary.append(label, detail);
        const inspect = actionButton('Inspect in Signals', () => inspectZeroRun(profile));
        inspect.setAttribute('aria-label', `Inspect ${profile.name} zero values in Signals`);
        inspect.title = Number.isFinite(Number(profile.longest_zero_run_start_ms))
            ? 'Open the longest reported zero run in Signals.'
            : 'Open this series in Signals; no timestamp interval was supplied by the profile.';
        item.append(summary, inspect);
        zeroList.append(item);
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
        const certainty = reportKind === 'sampled' ? 'estimated ' : '';
        detail.textContent = `${certainty}distribution Q1 ${formatQualityNumber(q25)} · median ${formatQualityNumber(median)} · Q3 ${formatQualityNumber(q75)} · IQR ${formatQualityNumber(iqr)}`
            + ` · candidate IQR range ${formatQualityNumber(low)} → ${formatQualityNumber(high)} (investigate; not an automatic exclusion)`;
        detail.title = `Q1 ${q25}; median ${median}; Q3 ${q75}; IQR ${iqr}; range ${low} to ${high}`;
        summary.append(label, detail);
        item.append(summary);
        distributionList.append(item);
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
        detail.textContent = count.toLocaleString() + (kind === 'null' ? ' null value' : ' non-finite value') + (count === 1 ? '' : 's')
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
        add.dataset.prepareKey = `quality-${profile.name}-${kind}`;
        add.setAttribute('aria-label', `${add.textContent} for ${profile.name}`);
        item.append(summary, add);
        list.append(item);
    }
    section.append(title, copy, profileActions);
    if (reportReady || findings.length > 0) {
        const overview = createElement('p', 'prepare-workspace__quality-overview');
        overview.textContent = `${findings.length} missing-value findings · ${constantColumns.length} constant columns · ${zeroFrequencyColumns.length} zero-run candidates · ${distributionColumns.length} distribution summaries`;
        section.append(overview, qualityDisclosure('missing', `Missing values · ${findings.length} findings`, list, findings.length > 0));
    } else section.append(list);
    if (timeQuality) section.append(qualityDisclosure('time', 'Time axis', timeList,
        timeQuality.duplicate_timestamp_count > 0 || timeQuality.out_of_order_count > 0));
    if (constantColumns.length) section.append(qualityDisclosure('constant', `Constant columns · ${constantColumns.length}`, constantList));
    if (zeroFrequencyColumns.length) section.append(qualityDisclosure('zeros', `Zero-run candidates · ${zeroFrequencyColumns.length}`, zeroList));
    if (distributionColumns.length) section.append(qualityDisclosure('distribution', `Distribution summaries · ${distributionColumns.length}`, distributionList));
    if (profileBody.children.length) {
        const scroll = createElement('div', 'prepare-workspace__table-scroll');
        scroll.tabIndex = 0;
        scroll.setAttribute('role', 'region');
        scroll.setAttribute('aria-label', 'Column quality table');
        scroll.append(profileTable);
        section.append(qualityDisclosure('columns', `All columns · ${profileBody.children.length}`, scroll));
    }
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
    preview: PreparationPreview,
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
    helpLabel.textContent = 'Preparation help';
    help.append(helpIcon, helpLabel);
    titleRow.append(title, help);
    const copy = createElement('p', 'prepare-workspace__copy');
    copy.textContent = 'Review source quality, refine your pipeline, then preview and save a prepared dataset.';
    heading.append(titleRow, copy);
    header.append(heading);
    const navigation = createElement('div', 'prepare-workspace__history');
    navigation.append(
        actionButton('Inspect in Signals', () => deps.showPage?.('timeseries')),
        actionButton('Graph and history', () => document.getElementById('open-cleaning-plan-btn')?.click()),
    );
    header.append(navigation);

    const workspaceFilters = deps.workspace?.getSnapshot().filters;
    const filterCount = Object.keys(workspaceFilters?.columnRanges ?? {}).length + (workspaceFilters?.adaptiveLines.length ?? 0);
    const localNav = createElement('nav', 'prepare-workspace__local-nav');
    localNav.setAttribute('aria-label', 'Prepare sections');
    const navTargets = [
        ['Quality findings', 'prepare-profile-findings'],
        ['Pipeline preview', 'prepare-pipeline-preview'],
        ['Pipeline stages', 'prepare-pipeline-stages'],
        ['Export', 'prepare-export'],
        ['Record an insight', 'prepare-insight-record'],
        ...(filterCount > 0 ? [['Signals filters', 'prepare-signals-filters'] as const] : []),
    ] as const;
    const navigate = (targetId: string) => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        params.set('page', 'prepare');
        params.set('section', targetId);
        window.history.replaceState(null, '', `#${params.toString()}`);
        const section = document.getElementById(targetId);
        if (!section) return;
        section.tabIndex = -1;
        section.focus({ preventScroll: true });
        section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    };
    const sectionSelect = createElement('select', 'modal-select');
    sectionSelect.id = 'prepare-section';
    sectionSelect.addEventListener('change', () => navigate(sectionSelect.value));
    for (const [label, targetId] of navTargets) {
        const link = createElement('a');
        link.href = `#${targetId}`;
        link.textContent = label;
        link.dataset.prepareSection = targetId;
        link.addEventListener('click', (event) => {
            event.preventDefault();
            navigate(targetId);
        });
        localNav.append(link);
        const option = createElement('option');
        option.value = targetId;
        option.textContent = label;
        sectionSelect.append(option);
    }
    const mobileNav = labeledControl('Jump to section', sectionSelect);
    mobileNav.classList.add('prepare-workspace__mobile-nav');

    const identity = createElement('section', 'prepare-workspace__identity');
    identity.setAttribute('aria-label', 'Pipeline source identity');
    if (!plan) {
        identity.textContent = 'Load a dataset to create and inspect a preprocessing plan.';
        root.append(header, identity);
        return;
    }
    const activeStages = plan.stages.filter((stage) => stage.enabled && stage.executionClass !== 'annotation').length;
    const previewState = preview.getState();
    const toolbar = createElement('div', 'prepare-workspace__toolbar');
    const stateRow = createElement('div', 'prepare-workspace__state-row');
    const liveStatus = createElement('p', 'prepare-workspace__live-status');
    liveStatus.id = 'prepare-plan-status';
    liveStatus.setAttribute('role', 'status');
    liveStatus.setAttribute('aria-live', 'polite');
    liveStatus.textContent = activeStages > 0 ? 'Working plan active in plots · source unchanged' : 'Source baseline · source unchanged';
    const freshness = createElement('span', 'prepare-workspace__preview-state');
    freshness.dataset.state = previewState.result ? 'ready' : 'pending';
    freshness.textContent = previewState.applying ? 'Creating dataset…' : previewState.running ? 'Preview running…'
        : previewState.result ? 'Preview up to date' : activeStages > 0 ? 'Preview required' : 'Add a stage to begin';
    liveStatus.append(freshness);
    const history = createElement('div', 'prepare-workspace__history');
    history.append(
        actionButton('Undo', () => { if (cleaningPlanStore.undo()) deps.onPlanChanged?.(); }, !cleaningPlanStore.canUndo() || previewState.applying),
        actionButton('Redo', () => { if (cleaningPlanStore.redo()) deps.onPlanChanged?.(); }, !cleaningPlanStore.canRedo() || previewState.applying),
    );
    stateRow.append(liveStatus, history);
    toolbar.append(stateRow, localNav, mobileNav);
    const metadata = deps.workspace?.getSnapshot().dataset.metadata ?? null;
    const workingColumns = getEffectiveColumnNames(metadata, plan);
    const numericColumns = getEffectiveNumericColumns(metadata, plan);
    const identityFacts = createElement('dl', 'prepare-workspace__identity-facts');
    const appendIdentityFact = (label: string, value: string | HTMLElement) => {
        const fact = createElement('div');
        const term = createElement('dt');
        term.textContent = label;
        const description = createElement('dd');
        if (typeof value === 'string') description.textContent = value;
        else description.append(value);
        fact.append(term, description);
        identityFacts.append(fact);
    };
    const revisionLink = createElement('button', 'prepare-workspace__revision-link');
    revisionLink.type = 'button';
    revisionLink.textContent = String(plan.datasetRevision);
    revisionLink.title = 'Open Graph history in the Pipeline Workbench';
    revisionLink.addEventListener('click', () => document.getElementById('open-cleaning-plan-btn')?.click());
    appendIdentityFact('Source', plan.sourceName || plan.sourceVersionId);
    appendIdentityFact('Revision', revisionLink);
    appendIdentityFact('Active stages', String(activeStages));
    appendIdentityFact('Plan status', activeStages > 0 ? 'Live in every plot' : 'Source baseline');
    identity.append(identityFacts);

    const filters = workspaceFilters;
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
            section.hidden = rangeFilters.length === 0 && adaptiveFilters.length === 0;
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
    insightSection.classList.add('prepare-workspace__stages');
    insightSection.append(insightTitle, insightCopy, insightForm);
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
    graphCopy.textContent = 'Enabled steps run in order for all plots and dataset exports. Changes are reversible with Undo and Redo.';
    const previewCaption = createElement('p', 'prepare-workspace__preview-caption');
    const caption = formatPipelinePreviewCaption(plan.stages);
    previewCaption.textContent = caption.text;
    previewCaption.title = caption.title;
    graphSection.append(graphTitle, graphCopy, previewCaption);
    const viewport = deps.workspace?.getSnapshot().viewport;
    const hasViewport = viewport?.xMin != null && viewport.xMax != null
        && Number.isFinite(viewport.xMin) && Number.isFinite(viewport.xMax) && viewport.xMin < viewport.xMax;
    graphSection.append(actionButton('Keep Signals time window', () => {
        if (!hasViewport) return;
        cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep Signals time window',
            startMs: viewport!.xMin!, endMs: viewport!.xMax!, mode: 'keepInside',
        });
        deps.onPlanChanged?.();
    }, !hasViewport));

    const stagesSection = createElement('section', 'prepare-workspace__stages');
    stagesSection.id = 'prepare-pipeline-stages';
    const stageTitle = createElement('h2');
    stageTitle.textContent = 'Ordered stages';
    const stageCopy = createElement('p', 'prepare-workspace__copy');
    stageCopy.textContent = 'Enabled stages update every plot immediately. Reorder by position, disable a stage to compare, or use Undo to restore an earlier plan.';
    const previewStatus = createElement('p', 'prepare-workspace__policy-status');
    previewStatus.id = 'prepare-preview-status';
    previewStatus.tabIndex = -1;
    previewStatus.dataset.prepareKey = previewStatus.id;
    previewStatus.setAttribute('role', 'status');
    previewStatus.setAttribute('aria-live', 'polite');
    previewStatus.textContent = previewState.message || 'Preview exact row and column changes before creating a prepared dataset.';
    const previewChanges = actionButton(activeStages === 0 ? 'Preview baseline' : 'Preview changes', () => { void preview.preview(); }, previewState.running || previewState.applying);
    previewChanges.id = 'prepare-preview-button';
    previewChanges.classList.replace('btn-ghost', 'btn-primary');
    const materialize = actionButton('Create prepared dataset', () => { void preview.materialize(); }, !previewState.canApply);
    materialize.id = 'prepare-materialize-button';
    materialize.setAttribute('aria-describedby', previewStatus.id);
    materialize.title = activeStages === 0
        ? 'Add and enable at least one executable stage first'
        : previewState.canApply ? 'Save this previewed plan as a new immutable dataset version'
            : 'Run a successful preview of the current plan first';
    const previewActions = createElement('div', 'prepare-workspace__preview-actions');
    previewActions.append(previewChanges, materialize);
    graphSection.append(previewActions, previewStatus);
    if (previewState.result?.warnings.length) {
        const warnings = createElement('ul', 'prepare-workspace__preview-warnings');
        warnings.setAttribute('aria-label', 'Preview warnings');
        for (const warning of previewState.result.warnings) {
            const item = createElement('li');
            item.textContent = warning;
            warnings.append(item);
        }
        graphSection.append(warnings);
    }
    const addPolicy = createElement('form', 'prepare-workspace__policy-form');
    const policyTitle = createElement('h3');
    policyTitle.textContent = 'Add missing-value policy';
    const policyColumn = createElement('input', 'modal-input');
    policyColumn.name = 'column';
    policyColumn.placeholder = 'Numeric column';
    policyColumn.required = true;
    policyColumn.setAttribute('aria-label', 'Numeric column');
    configureColumnInput(policyColumn, numericColumns);
    const policySubmit = actionButton('Add stage', () => {});
    policySubmit.type = 'submit';
    const policyStatus = createElement('p', 'prepare-workspace__policy-status');
    policyStatus.setAttribute('aria-live', 'polite');
    addPolicy.append(
        policyTitle,
        labeledControl('Numeric column', policyColumn),
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
    configureColumnInput(deduplicateColumns, workingColumns, { multiple: true });
    const keep = createElement('select', 'modal-select');
    keep.name = 'keep';
    const keepFirst = createElement('option');
    keepFirst.value = 'first';
    keepFirst.textContent = 'Keep first row';
    const keepLast = createElement('option');
    keepLast.value = 'last';
    keepLast.textContent = 'Keep last row';
    keep.append(keepFirst, keepLast);
    const deduplicateSubmit = actionButton('Add stage', () => {});
    deduplicateSubmit.type = 'submit';
    const deduplicateStatus = createElement('p', 'prepare-workspace__policy-status');
    deduplicateStatus.setAttribute('aria-live', 'polite');
    addDeduplicate.append(deduplicateTitle,
        labeledControl('Duplicate-resolution key columns', deduplicateColumns, 'Separate column names with commas.'),
        labeledControl('Duplicate row to keep', keep), deduplicateSubmit, deduplicateStatus);
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
    configureColumnInput(columnSelectColumns, workingColumns, { multiple: true });
    const columnSelectMode = createElement('select', 'modal-select');
    columnSelectMode.name = 'mode';
    const keepColumns = createElement('option');
    keepColumns.value = 'keep';
    keepColumns.textContent = 'Keep only these columns';
    const dropColumns = createElement('option');
    dropColumns.value = 'drop';
    dropColumns.textContent = 'Drop these columns';
    columnSelectMode.append(keepColumns, dropColumns);
    const columnSelectSubmit = actionButton('Add stage', () => {});
    columnSelectSubmit.type = 'submit';
    const columnSelectStatus = createElement('p', 'prepare-workspace__policy-status');
    columnSelectStatus.setAttribute('aria-live', 'polite');
    addColumnSelect.append(columnSelectTitle,
        labeledControl('Columns to keep or drop', columnSelectColumns, 'Separate column names with commas. The time column is required.'),
        labeledControl('Column selection mode', columnSelectMode), columnSelectSubmit, columnSelectStatus);
    addColumnSelect.addEventListener('submit', (event) => {
        event.preventDefault();
        const columns = columnSelectColumns.value.split(',').map((column) => column.trim()).filter(Boolean);
        if (columns.length === 0 || new Set(columns).size !== columns.length) {
            columnSelectStatus.textContent = 'Choose one or more unique columns.';
            return;
        }
        const mode = columnSelectMode.value as 'keep' | 'drop';
        if (mode === 'drop' && columns.includes(plan.timeColumn)) {
            columnSelectStatus.textContent = 'Keep the time column so the dataset can be plotted.';
            return;
        }
        if (mode === 'keep' && !columns.includes(plan.timeColumn)) columns.unshift(plan.timeColumn);
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
    configureColumnInput(sortColumns, workingColumns, { multiple: true });
    const sortDescending = checkbox('Sort descending', 'descending', false);
    const sortNullsLast = checkbox('Place nulls last', 'nullsLast', true);
    const sortSubmit = actionButton('Add stage', () => {});
    sortSubmit.type = 'submit';
    const sortStatus = createElement('p', 'prepare-workspace__policy-status');
    sortStatus.setAttribute('aria-live', 'polite');
    addSort.append(sortTitle, labeledControl('Columns to sort by', sortColumns, 'Separate names with commas, in sort priority order.'), sortDescending, sortNullsLast, sortSubmit, sortStatus);
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
    configureColumnInput(fillColumns, workingColumns, { multiple: true });
    const fillStrategy = createElement('select', 'modal-select'); fillStrategy.name = 'strategy';
    for (const [value, label] of [['forward', 'Forward fill'], ['backward', 'Backward fill']] as const) { const option = createElement('option'); option.value = value; option.textContent = label; fillStrategy.appendChild(option); }
    const fillLimit = createElement('input', 'modal-input'); fillLimit.name = 'limit'; fillLimit.type = 'number'; fillLimit.min = '1'; fillLimit.placeholder = 'Maximum consecutive fills (optional)';
    const fillSubmit = actionButton('Add stage', () => {}); fillSubmit.type = 'submit';
    const fillStatus = createElement('p', 'prepare-workspace__policy-status'); fillStatus.setAttribute('aria-live', 'polite');
    addFill.append(fillTitle,
        labeledControl('Columns to fill', fillColumns, 'Separate column names with commas.'),
        labeledControl('Fill direction', fillStrategy),
        labeledControl('Maximum consecutive fills', fillLimit, 'Optional. Leave blank for no limit.'), fillSubmit, fillStatus);
    addFill.addEventListener('submit', (event) => { event.preventDefault(); const columns = fillColumns.value.split(',').map((column) => column.trim()).filter(Boolean); const limit = fillLimit.value ? Number(fillLimit.value) : null; if (!hasEnabledTimeSort(plan)) { fillStatus.textContent = 'Add and enable a stable sort on the time column before ordered null fill.'; return; } if (columns.length === 0 || new Set(columns).size !== columns.length || (limit != null && (!Number.isInteger(limit) || limit <= 0))) { fillStatus.textContent = 'Choose unique columns and an optional positive integer limit.'; return; } const strategy = fillStrategy.value as 'forward' | 'backward'; cleaningPlanStore.addStage({ kind: 'fillNull', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: (strategy === 'forward' ? 'Forward' : 'Backward') + ' fill nulls in ' + columns.join(', '), columns, strategy, limit }); deps.onPlanChanged?.(); });
    const addResample = createElement('form', 'prepare-workspace__policy-form');
    const resampleTitle = createElement('h3'); resampleTitle.textContent = 'Add fixed-duration resampling';
    const resampleEvery = createElement('input', 'modal-input'); resampleEvery.name = 'every'; resampleEvery.placeholder = 'Fixed interval, for example 15m'; resampleEvery.required = true;
    const resampleAggregations = createElement('input', 'modal-input'); resampleAggregations.name = 'aggregations'; resampleAggregations.placeholder = 'value:mean, volume:sum'; resampleAggregations.required = true;
    configureColumnInput(resampleAggregations, numericColumns, { multiple: true, aggregation: true });
    const resampleSubmit = actionButton('Add stage', () => {}); resampleSubmit.type = 'submit';
    const resampleStatus = createElement('p', 'prepare-workspace__policy-status'); resampleStatus.setAttribute('aria-live', 'polite');
    addResample.append(resampleTitle,
        labeledControl('Resampling interval', resampleEvery, 'Use a fixed interval such as 15m or 1h.'),
        labeledControl('Column aggregations', resampleAggregations, 'Use column:method pairs, separated by commas. Methods: mean, sum, min, max, last.'),
        resampleSubmit, resampleStatus);
    addResample.addEventListener('submit', (event) => {
        event.preventDefault();
        const every = normalizeFixedDuration(resampleEvery.value);
        const aggregations = parseResampleAggregations(resampleAggregations.value, plan.timeColumn);
        if (!hasAscendingTimeSortBefore(plan)) { resampleStatus.textContent = 'Add an ascending stable sort with the time column first before resampling.'; return; }
        if (!every || !aggregations) { resampleStatus.textContent = 'Use a positive fixed interval and unique entries such as value:mean, volume:sum.'; return; }
        cleaningPlanStore.addStage({ kind: 'resample', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: 'Resample every ' + every, every, aggregations });
        deps.onPlanChanged?.();
    });
    const addCalculation = createElement('form', 'prepare-workspace__policy-form');
    addCalculation.dataset.stageComposerKind = 'derivedColumn';
    const calculationTitle = createElement('h3');
    calculationTitle.textContent = 'Combine columns or calculate a value';
    const expressionField = textInput('Expression', '', 'expression');
    const expressionInput = expressionField.querySelector('input')!;
    expressionInput.required = true;
    expressionInput.placeholder = numericColumns.length > 1 ? `${numericColumns[0]} + ${numericColumns[1]}` : `${numericColumns[0] ?? 'value'} * 2`;
    const outputField = textInput('Output column', '', 'outputColumn');
    outputField.querySelector('input')!.required = true;
    const calculationHint = createElement('p', 'prepare-workspace__copy');
    calculationHint.id = 'prepare-calculation-hint';
    expressionInput.setAttribute('aria-describedby', calculationHint.id);
    calculationHint.textContent = 'Use +, −, *, /, %, parentheses, abs(), sqrt(), log(), and other math functions. Earlier calculated columns can be used in later steps. Reusing a column name replaces its values.';
    const calculationStatus = createElement('p', 'prepare-workspace__policy-status');
    calculationStatus.setAttribute('aria-live', 'polite');
    const calculationSubmit = actionButton('Add calculation', () => {});
    calculationSubmit.type = 'submit';
    addCalculation.append(calculationTitle, expressionField, outputField, calculationHint, calculationSubmit, calculationStatus);
    addCalculation.addEventListener('submit', async (event) => {
        event.preventDefault();
        calculationSubmit.disabled = true;
        calculationStatus.textContent = 'Checking calculation…';
        try {
            const name = outputField.querySelector('input')!.value.trim();
            await addDerivedColumn(cleaningPlanStore, expressionInput.value, name);
            const selection = deps.workspace?.getSnapshot().selection;
            if (selection) deps.workspace?.setSelection?.([...selection.columns, name], selection.colorColumn);
            deps.onPlanChanged?.();
        } catch (error) {
            calculationStatus.textContent = error instanceof Error ? error.message : 'Could not add the calculation.';
        } finally {
            calculationSubmit.disabled = false;
        }
    });
    const stageStatus = createElement('p', 'prepare-workspace__policy-status');
    stageStatus.id = 'prepare-stage-status';
    stageStatus.setAttribute('role', 'alert');
    const list = createElement('ol', 'prepare-workspace__stage-list');
    list.setAttribute('aria-label', 'Pipeline stages in execution order');
    if (plan.stages.length === 0) {
        const empty = createElement('li', 'prepare-workspace__empty');
        empty.textContent = 'No transformations have been added yet. Create one from Signals or open the workbench.';
        list.append(empty);
    }
    for (const [index, stage] of plan.stages.entries()) {
        const item = createElement('li', 'prepare-workspace__stage');
        item.dataset.stageId = stage.id;
        item.tabIndex = -1;
        const number = createElement('span', 'prepare-workspace__stage-number');
        number.textContent = String(index + 1);
        number.setAttribute('aria-hidden', 'true');
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
        label.id = `prepare-stage-label-${stage.id}`;
        item.setAttribute('aria-labelledby', label.id);
        const detail = createElement('span');
        detail.textContent = stageSummary(stage) + (stage.enabled ? '' : ' · disabled');
        const impact = createElement('span', 'prepare-workspace__stage-impact');
        const exactImpact = previewState.result?.stageImpacts.find((entry) => entry.stageId === stage.id);
        impact.textContent = !stage.enabled ? 'Disabled · not applied'
            : stage.executionClass === 'annotation' ? 'Annotation · no data changes'
            : exactImpact?.executed
                ? `${exactImpact.rowsAfter.toLocaleString()} rows after this stage · ${exactImpact.rowsRemoved.toLocaleString()} removed`
                : (stage.kind === 'sort' ? 'Changes row order' : stage.kind === 'fillNull' ? 'Fills values' : stage.scope === 'schema' ? 'Changes columns' : 'Changes rows') + ' · preview for exact impact';
        summary.append(label, detail, impact);
        const controls = createElement('details', 'prepare-workspace__stage-controls');
        controls.id = `prepare-stage-actions-${stage.id}`;
        controls.open = !window.matchMedia('(max-width: 680px)').matches;
        const controlsSummary = createElement('summary');
        controlsSummary.textContent = 'Stage actions';
        const controlsList = createElement('div', 'prepare-workspace__stage-actions');
        const editStage = actionButton('Edit', () => {
            const trigger = document.getElementById('open-cleaning-plan-btn');
            if (trigger) { trigger.dataset.planStageId = stage.id; trigger.click(); }
        });
        const toggleStage = actionButton(stage.enabled ? 'Disable' : 'Enable', () => {
                const stages = plan.stages.map((candidate) => candidate.id === stage.id
                    ? { ...candidate, enabled: !stage.enabled } as CleaningPlan['stages'][number]
                    : candidate);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { stageStatus.textContent = error; return; }
                cleaningPlanStore.setStageEnabled(stage.id, !stage.enabled);
                deps.onPlanChanged?.();
            });
        const moveTo = (target: number): boolean => {
                const stages = [...plan.stages];
                stages.splice(target, 0, stages.splice(index, 1)[0]);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { stageStatus.textContent = error; return false; }
                cleaningPlanStore.reorderStage(stage.id, target);
                deps.onPlanChanged?.();
                return true;
        };
        const moveUp = actionButton('Move up', () => { moveTo(index - 1); }, index === 0);
        const moveDown = actionButton('Move down', () => { moveTo(index + 1); }, index === plan.stages.length - 1);
        const position = createElement('select', 'modal-select');
        position.setAttribute('aria-label', `Position of ${stage.label || stageSummary(stage)}`);
        position.disabled = plan.stages.length < 2;
        plan.stages.forEach((_, target) => {
            const option = createElement('option');
            option.value = String(target);
            option.textContent = `${target + 1} of ${plan.stages.length}`;
            option.selected = target === index;
            position.append(option);
        });
        position.addEventListener('change', () => {
            if (!moveTo(Number(position.value))) position.value = String(index);
        });
        const positionField = labeledControl('Position', position);
        positionField.classList.add('prepare-workspace__stage-position');
        const removeStage = actionButton('Remove', () => {
                if (typeof window.confirm === 'function'
                    && !window.confirm(`Remove '${stage.label || stageSummary(stage)}'? You can restore it with Undo.`)) return;
                const stages = plan.stages.filter((candidate) => candidate.id !== stage.id);
                const error = resampleOrderingError({ ...plan, stages });
                if (error) { stageStatus.textContent = error; return; }
                cleaningPlanStore.removeStage(stage.id);
                deps.onPlanChanged?.();
            });
        if (moveUp.disabled) moveUp.title = plan.stages.length === 1 ? 'Cannot move the only remaining stage' : 'Already the first stage';
        if (moveDown.disabled) moveDown.title = plan.stages.length === 1 ? 'Cannot move the only remaining stage' : 'Already the last stage';
        removeStage.title = 'Remove this stage; Undo restores it';
        for (const [key, control] of Object.entries({ edit: editStage, toggle: toggleStage, up: moveUp, down: moveDown, remove: removeStage, position })) {
            control.dataset.prepareKey = `stage-${stage.id}-${key}`;
            if (control instanceof HTMLButtonElement) control.setAttribute('aria-label', `${control.textContent}: ${stage.label || stageSummary(stage)}`);
        }
        controlsList.append(editStage, toggleStage, moveUp, moveDown, positionField, removeStage);
        controls.append(controlsSummary, controlsList);
        item.append(number, summary, controls);
        list.append(item);
    }
    const composer = createElement('div', 'prepare-workspace__composer');
    const composerHeading = createElement('div', 'prepare-workspace__composer-heading');
    const composerCopy = createElement('p', 'prepare-workspace__copy');
    composerCopy.textContent = 'Choose one transformation, configure it, then add it to the ordered plan.';
    const composerSelect = createElement('select', 'modal-select');
    composerSelect.id = 'prepare-transformation';
    composerSelect.setAttribute('aria-label', 'Transformation to add');
    const forms = [addPolicy, addDeduplicate, addColumnSelect, addSort, addFill, addResample, addCalculation];
    const formLabels = ['Missing values', 'Duplicate rows', 'Column selection', 'Stable sort', 'Ordered null fill', 'Fixed-duration resampling', 'Calculate / combine columns'];
    formLabels.forEach((label, index) => {
        const option = createElement('option');
        option.value = String(index);
        option.textContent = label;
        composerSelect.append(option);
        forms[index]!.hidden = index !== 0;
    });
    composerSelect.addEventListener('change', () => {
        forms.forEach((form, index) => { form.hidden = index !== Number(composerSelect.value); });
    });
    composerHeading.append(composerCopy, labeledControl('Transformation to add', composerSelect));
    composer.append(composerHeading, ...forms);
    stagesSection.append(stageTitle, stageCopy, stageStatus, list, composer);
    const exportSection = createElement('section', 'prepare-workspace__stages');
    exportSection.id = 'prepare-export';
    const exportTitle = createElement('h2');
    exportTitle.textContent = 'Export dataset and pipeline';
    const exportCopy = createElement('p', 'prepare-workspace__copy');
    exportCopy.textContent = 'Download all rows and columns after the enabled steps as Parquet. Export the same pipeline as JSON or Python / Rust code, or download a bundle with the plan, code, and provenance. Exporting does not require creating a prepared dataset.';
    exportSection.append(exportTitle, exportCopy, createPipelineExportControls(() => cleaningPlanStore.getSnapshot()));
    root.append(header, toolbar, identity, qualitySection, graphSection, stagesSection, exportSection, insightSection, signalsFilterSection);
}

/** Lazy page surface for orienting a data scientist before opening the editor overlay. */
export function initPreparePage(deps: PreparePageDeps = {}): () => void {
    const root = document.getElementById('prepare-workspace');
    if (!root) return () => {};
    root.classList.add('prepare-workspace');
    let disposed = false;
    let request = new AbortController();
    let profileMetadata: DatasetMetadata | null = null;
    let profileStatus: DatasetProfileResponse['status'] = 'not_started';
    let profileKind: 'exact' | 'sampled' = 'exact';
    let profileJobId: string | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let disposeHelp = () => {};
    let disposeNavigation = () => {};
    let renderedPlan: CleaningPlan | null = null;
    let restoredSection = false;
    const datasetKey = (plan: CleaningPlan | null) => JSON.stringify(plan && [plan.sourceVersionId, plan.datasetRevision, plan.datasetFingerprint, plan.schemaFingerprint]);
    const preview = createPreparationPreview({
        getPlan: () => cleaningPlanStore.getSnapshot(),
        onChange: () => render(),
        onApplied: async () => {
            await deps.refreshDatasetAfterMutation?.();
            deps.onPlanChanged?.();
        },
    });
    const render = () => {
        if (disposed) return;
        const plan = cleaningPlanStore.getSnapshot();
        const savedView = capturePreparationView(root);
        const sameDataset = datasetKey(plan) === datasetKey(renderedPlan);
        const addedStage = sameDataset ? plan?.stages.find((stage) => !renderedPlan?.stages.some((previous) => previous.id === stage.id)) : undefined;
        renderedPlan = plan;
        preview.getState();
        disposeNavigation();
        disposeHelp();
        renderPrepareWorkspace(
            root,
            plan,
            deps,
            profileMetadata ?? deps.workspace?.getSnapshot().dataset.metadata ?? null,
            profileStatus,
            profileKind,
            requestExactProfile,
            requestSampleProfile,
            cancelProfile,
            preview,
        );
        keyPreparationControls(root);
        if (sameDataset) restorePreparationView(root, savedView, addedStage?.id);
        disposeNavigation = initPreparationNavigation(root);
        disposeHelp = initPageHelp('prepare', PREPARE_HELP);
        if (!restoredSection) {
            restoredSection = true;
            const section = new URLSearchParams(window.location.hash.slice(1)).get('section');
            if (section?.startsWith('prepare-')) queueMicrotask(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
        }
    };
    const acceptProfile = (response: DatasetProfileResponse, kind: 'exact' | 'sampled', owner: AbortController) => {
        if (disposed || owner.signal.aborted || owner !== request) return false;
        const plan = cleaningPlanStore.getSnapshot();
        if (!plan || response.sourceVersion?.id !== plan.sourceVersionId || response.sourceVersion.revision !== plan.datasetRevision) return false;
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
    let sourceId = datasetKey(cleaningPlanStore.getSnapshot());
    const unsubscribe = cleaningPlanStore.subscribe(() => {
        const nextSource = datasetKey(cleaningPlanStore.getSnapshot());
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
        preview.dispose();
        request.abort();
        unsubscribeWorkspace?.();
        if (pollTimer != null) clearTimeout(pollTimer);
        disposeHelp();
        disposeNavigation();
        unsubscribe();
    };
}
