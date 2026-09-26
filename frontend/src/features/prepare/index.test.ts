import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleaningApi = vi.hoisted(() => ({
    previewCleaningPlan: vi.fn(),
    applyCleaningPlan: vi.fn(),
    cancelSessionJob: vi.fn(),
    exportCleaningData: vi.fn(),
    exportCleaningPlan: vi.fn(),
    exportCleaningCode: vi.fn(),
    exportCleaningBundle: vi.fn(),
    validateCleaningPlan: vi.fn(),
}));

vi.mock('../../cleaning/api.js', () => cleaningApi);

import { formatPipelinePreviewCaption, initPreparePage } from './index.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import type { DatasetMetadata, DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
let workspace = createWorkspaceStore();
let profileTestSequence = 0;

function selectProfileTestSource(metadata?: Partial<DatasetMetadata>) {
    const sequence = ++profileTestSequence;
    const id = `prepare-profile-${sequence}`;
    const datasetFingerprint = `prepare-data-${sequence}`;
    cleaningPlanStore.resetForDataset({
        sourceVersionId: id, datasetRevision: 3, datasetFingerprint, schemaFingerprint: 'profile-schema', timeColumn: 'ts',
    });
    if (metadata) {
        workspace.commitDataset(workspace.beginDatasetSession(), {
            source_version_id: id, revision: 3, source_version_revision: 3,
            dataset_fingerprint: datasetFingerprint, profile_status: 'immediate',
            total_rows: 10, columns: [], numeric_columns: [], time_column: 'ts', time_range: null, column_profiles: [],
            ...metadata,
        } as DatasetMetadata, 3);
    }
    return { id, datasetFingerprint, revision: 3 };
}

function profileResponse(
    source: { id: string; revision: number; datasetFingerprint: string },
    status: DatasetProfileResponse['status'],
    kind: 'exact' | 'sampled' = 'exact',
): DatasetProfileResponse {
    return {
        algorithmVersion: kind === 'exact' ? 'exact-v1' : 'sample-v1',
        sourceVersion: source,
        status,
        job: status === 'running' || status === 'queued' || status === 'cancelling'
            ? { id: 'profile-job', status, progressPercent: 5, message: null }
            : null,
        metadata: status === 'ready' ? {
            profile_status: kind, total_rows: 10,
            columns: [{ name: 'exact_value', dtype: 'Float64' }], numeric_columns: ['exact_value'],
            time_column: 'ts', time_range: null,
            column_profiles: [{ name: 'exact_value', dtype: 'Float64', non_null_count: 9, null_count: 1, min: -2, max: 4 }],
        } as DatasetMetadata : null,
    };
}

describe('Prepare page', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="open-cleaning-plan-btn"></button><div id="prepare-workspace"></div>';
        cleaningPlanStore.clear();
        workspace = createWorkspaceStore();
        cleaningApi.previewCleaningPlan.mockReset().mockImplementation(async (plan) => ({
            sourceVersion: { id: plan.sourceVersionId }, datasetRevision: plan.datasetRevision,
            rowsBefore: 100, rowsAfter: 80, columnsBefore: 8, columnsAfter: 8,
            warnings: [], stageImpacts: plan.stages.map((stage: { id: string }) => ({ stageId: stage.id, executed: true, rowsBefore: 100, rowsAfter: 80, rowsRemoved: 20 })),
        }));
        cleaningApi.applyCleaningPlan.mockReset();
        cleaningApi.validateCleaningPlan.mockReset().mockResolvedValue({});
    });

    afterEach(() => {
        cleaningPlanStore.clear();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('limits the visible pipeline caption to three stages while retaining the full hover text', () => {
        const stages = Array.from({ length: 5 }, (_, index) => ({
            id: `stage-${index}`,
            kind: 'timeRange' as const,
            executionClass: 'polarsExpression' as const,
            scope: 'row' as const,
            enabled: true,
            sourcePage: 'timeseries' as const,
            label: `Window ${index}`,
            createdAt: 'now',
            updatedAt: 'now',
            startMs: index,
            endMs: index + 1,
            mode: 'keepInside' as const,
        }));

        const caption = formatPipelinePreviewCaption(stages);
        expect(caption.text).toBe('After 5 stages: Keep time range → Keep time range → Keep time range → +2 more…');
        expect(caption.title.match(/Keep time range/g)).toHaveLength(5);
    });

    it('previews the canonical plan directly without opening the workbench', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Window', startMs: 1, endMs: 2, mode: 'keepInside',
        });
        const dispose = initPreparePage({ workspace });

        expect(document.querySelector('.pipeline-graph')).toBeNull();
        expect(document.getElementById('prepare-pipeline-preview')?.textContent).toContain('After 1 stage');
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('source-1');
        expect(document.getElementById('prepare-workspace')?.textContent).not.toContain('Open workbench');
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Preview changes')!.click();
        await vi.waitFor(() => {
            expect(cleaningApi.previewCleaningPlan).toHaveBeenCalledOnce();
            expect(document.getElementById('prepare-preview-status')?.textContent).toContain('80 of 100 rows');
        });

        dispose();
    });

    it('materializes the current plan from the page and refreshes the dataset', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Window', startMs: 1, endMs: 2, mode: 'keepInside',
        });
        cleaningApi.applyCleaningPlan.mockResolvedValue({
            jobId: 'job-1',
            sourceVersion: { id: 'prepared-1' },
            datasetRevision: 4,
            planHash: 'plan-hash',
        });
        const refreshDatasetAfterMutation = vi.fn();
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ workspace, refreshDatasetAfterMutation, onPlanChanged });

        const materialize = () => document.getElementById('prepare-materialize-button') as HTMLButtonElement;
        expect(materialize().disabled).toBe(true);
        materialize().click();
        expect(cleaningApi.applyCleaningPlan).not.toHaveBeenCalled();
        document.getElementById('prepare-preview-button')!.click();
        await vi.waitFor(() => expect(materialize().disabled).toBe(false));
        materialize().click();

        await vi.waitFor(() => {
            expect(cleaningApi.applyCleaningPlan).toHaveBeenCalledOnce();
            expect(refreshDatasetAfterMutation).toHaveBeenCalledOnce();
            expect(onPlanChanged).toHaveBeenCalledOnce();
        });
        dispose();
    });

    it('shows raw and working examples with source/result columns beside the preview approval gate', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep interval', startMs: 0, endMs: 10, mode: 'keepInside',
        });
        cleaningApi.previewCleaningPlan.mockResolvedValueOnce({
            sourceVersion: { id: 'source-1' }, datasetRevision: 3, planHash: 'preview-hash',
            rowsBefore: 100, rowsAfter: 100, rowsRemoved: 0, columnsBefore: 2, columnsAfter: 3,
            sourceColumns: ['ts', 'value'], resultColumns: ['ts', 'value', 'value_squared'],
            examples: {
                raw: [{ rowNumber: 0, timestamp: '2024-01-01T00:00:00Z', values: { value: '2.0' } }],
                working: [{ rowNumber: 0, timestamp: '2024-01-01T00:00:00Z', values: { value: '2.0', value_squared: '4.0' } }],
            },
            stageImpacts: [{ stageId: cleaningPlanStore.getSnapshot()!.stages[0]!.id, executed: true, rowsBefore: 100, rowsAfter: 100, rowsRemoved: 0 }],
            warnings: [],
        } as any);
        const dispose = initPreparePage({ workspace });

        const materialize = document.getElementById('prepare-materialize-button') as HTMLButtonElement;
        expect(materialize.disabled).toBe(true);
        document.getElementById('prepare-preview-button')!.click();
        await vi.waitFor(() => expect(document.querySelector('.cleaning-plan-preview-evidence')).not.toBeNull());

        const evidence = document.querySelector<HTMLElement>('.prepare-workspace__preview-evidence')!;
        expect(evidence.querySelector('h3')?.textContent).toBe('Source and working data examples');
        expect(evidence.textContent).toContain('Source columns: ts, value');
        expect(evidence.textContent).toContain('Working columns: ts, value, value_squared');
        expect(evidence.textContent).toContain('Raw examples (1)');
        expect(evidence.textContent).toContain('Working examples (1)');
        expect(evidence.textContent).toContain('value_squared=4.0');
        expect((document.getElementById('prepare-materialize-button') as HTMLButtonElement).disabled).toBe(false);
        dispose();
    });

    it('stays source-first until a dataset establishes a plan', () => {
        const showPage = vi.fn();
        const dispose = initPreparePage({ workspace, showPage });

        expect(document.getElementById('prepare-workspace')?.textContent).not.toContain('Open workbench');
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Load a dataset');
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Load a dataset')!.click();
        expect(showPage).toHaveBeenCalledWith('upload');

        dispose();
    });

    it('shows shared adaptive filters from Signals', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({
            kind: 'adaptiveLine', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Adaptive HULL', column: 'HULL',
            x1Ms: 1, y1: 2, x2Ms: 3, y2: 4, keepAbove: true, applyWithinSegmentOnly: true,
        });
        workspace.setFilters({
            columnRanges: {},
            adaptiveLines: [{ id: 'adaptive-1', column: 'HULL', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: true }],
        });

        const dispose = initPreparePage({ workspace });

        expect(document.getElementById('prepare-signals-filters')?.textContent).toContain('HULL: keep above the drawn line');
        expect(document.getElementById('prepare-pipeline-preview')?.textContent).toContain('Keep above line for HULL');
        dispose();
    });

    it('updates Prepare workspace slices without rebuilding unrelated controls', () => {
        const source = selectProfileTestSource({
            columns: [{ name: 'value', dtype: 'Float64' }],
            numeric_columns: ['value'],
            column_profiles: [],
        });
        workspace.setSelection(['initial']);
        const getProfile = vi.fn(async () => profileResponse(source, 'not_started'));
        const getSampleProfile = vi.fn(async () => profileResponse(source, 'not_started', 'sampled'));
        const dispose = initPreparePage({ workspace, getProfile, getSampleProfile });
        const root = document.getElementById('prepare-workspace')!;
        const header = root.querySelector('.prepare-workspace__header');
        const stageEditor = root.querySelector('.prepare-workspace__stage-editor');
        const columns = root.querySelector<HTMLInputElement>('#prepare-insight-columns')!;

        columns.focus();
        columns.value = 'unsaved user entry';
        workspace.setSelection(['selected elsewhere']);
        expect(document.activeElement).toBe(columns);
        expect(columns.value).toBe('unsaved user entry');

        (root.querySelector('#prepare-transformation') as HTMLSelectElement).focus();
        workspace.setSelection(['value']);
        expect(columns.value).toBe('value');
        expect(document.activeElement?.id).toBe('prepare-transformation');

        workspace.setFilters({
            columnRanges: { value: { from: 1, to: 2 } },
            adaptiveLines: [],
        });
        expect(root.querySelector('#prepare-signals-filters')?.textContent).toContain('Keep value between 1 and 2');
        expect(root.querySelector('#prepare-signals-filters')?.hasAttribute('hidden')).toBe(false);
        expect(root.querySelector('[data-prepare-section="prepare-signals-filters"]')).not.toBeNull();

        workspace.setViewport({ xMin: 100, xMax: 200, yMin: null, yMax: null });
        expect((root.querySelector('#prepare-keep-window') as HTMLButtonElement).disabled).toBe(false);
        expect(root.querySelector('.prepare-workspace__header')).toBe(header);
        expect(root.querySelector('.prepare-workspace__stage-editor')).toBe(stageEditor);

        workspace.setAppearance({ chartText: { title: 'Unrelated chart title', xLabel: '', yLabel: '' } });
        expect(root.querySelector('.prepare-workspace__header')).toBe(header);
        expect(root.querySelector('.prepare-workspace__stage-editor')).toBe(stageEditor);

        workspace.setFilters({ columnRanges: {}, adaptiveLines: [] });
        expect(root.querySelector('#prepare-signals-filters')?.hasAttribute('hidden')).toBe(true);
        expect(root.querySelector('[data-prepare-section="prepare-signals-filters"]')).toBeNull();
        expect(root.querySelector('#prepare-section option[value="prepare-signals-filters"]')).toBeNull();
        dispose();
    });

    it('updates profile progress in place and keeps page controls mounted', async () => {
        const source = selectProfileTestSource({
            columns: [{ name: 'value', dtype: 'Float64' }],
            numeric_columns: ['value'],
            column_profiles: [],
        });
        const getProfile = vi.fn(async () => profileResponse(source, 'not_started'));
        const getSampleProfile = vi.fn(async () => profileResponse(source, 'not_started', 'sampled'));
        const startProfile = vi.fn(() => new Promise<DatasetProfileResponse>(() => {}));
        const dispose = initPreparePage({ workspace, getProfile, getSampleProfile, startProfile });
        const root = document.getElementById('prepare-workspace')!;
        const header = root.querySelector('.prepare-workspace__header');
        const stageEditor = root.querySelector('.prepare-workspace__stage-editor');
        const help = root.querySelector('#prepare-help-btn');
        const build = Array.from(root.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Build exact quality report')!;

        build.focus();
        build.click();

        expect(startProfile).toHaveBeenCalledOnce();
        expect(root.querySelector('#prepare-profile-findings [role="status"]')?.textContent).toContain('Starting exact quality report');
        expect(root.querySelector('.prepare-workspace__header')).toBe(header);
        expect(root.querySelector('.prepare-workspace__stage-editor')).toBe(stageEditor);
        expect(root.querySelector('#prepare-help-btn')).toBe(help);
        expect(root.querySelector('#prepare-profile-findings')?.contains(document.activeElement)).toBe(true);
        dispose();
    });

    it('provides the same page-level help contract as every analysis page', () => {
        const dispose = initPreparePage({ workspace });
        const trigger = document.getElementById('prepare-help-btn') as HTMLButtonElement;

        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Preparation page');
        trigger.click();
        expect(document.getElementById('page-help-modal')?.textContent).toContain('Recommended order');

        dispose();
    });

    it('edits ordered stages and history through the canonical store', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const first = cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'First', startMs: 1, endMs: 2, mode: 'keepInside',
        });
        const second = cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Second', startMs: 3, endMs: 4, mode: 'keepInside',
        });
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ workspace, onPlanChanged });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Move down')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([second.id, first.id]);
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Disable')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages[0].enabled).toBe(false);
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Undo')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages[0].enabled).toBe(true);
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Remove')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages).toHaveLength(1);
        expect(onPlanChanged).toHaveBeenCalledTimes(4);

        dispose();
    });

    it('blocks disabling, removing, or moving a time-sort prerequisite ahead of ordered fill', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const session = workspace.beginDatasetSession();
        workspace.commitDataset(session, {
            source_version_id: 'source-1', revision: 3, source_version_revision: 3,
            dataset_fingerprint: 'data', profile_status: 'immediate', total_rows: 10,
            columns: [{ name: 'ts', dtype: 'Int64' }, { name: 'value', dtype: 'Float64' }],
            numeric_columns: ['value'], time_column: 'ts', time_range: null, column_profiles: [],
        } as any, 3);
        const sort = cleaningPlanStore.addStage({
            kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true,
            sourcePage: 'manual', label: 'Sort by time', columns: ['ts'], descending: false, nullsLast: true,
        });
        const fill = cleaningPlanStore.addStage({
            kind: 'fillNull', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'manual', label: 'Fill value', columns: ['value'], strategy: 'forward', limit: null,
        });
        const historyLength = cleaningPlanStore.getHistory().length;
        vi.stubGlobal('confirm', vi.fn(() => true));
        const dispose = initPreparePage({ workspace });

        document.querySelector<HTMLButtonElement>(`[data-prepare-key="stage-${sort.id}-toggle"]`)!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages.find((stage) => stage.id === sort.id)?.enabled).toBe(true);
        expect(document.getElementById('prepare-stage-status')?.textContent).toContain('Ordered null fill requires');
        expect(cleaningPlanStore.getHistory()).toHaveLength(historyLength);

        document.querySelector<HTMLButtonElement>(`[data-prepare-key="stage-${sort.id}-remove"]`)!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([sort.id, fill.id]);
        expect(cleaningPlanStore.getHistory()).toHaveLength(historyLength);

        const fillPosition = document.querySelector<HTMLSelectElement>(`[data-prepare-key="stage-${fill.id}-position"]`)!;
        fillPosition.value = '0';
        fillPosition.dispatchEvent(new Event('change'));
        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([sort.id, fill.id]);
        expect(fillPosition.value).toBe('1');
        expect(document.getElementById('prepare-stage-status')?.textContent).toContain('Ordered null fill requires');
        expect(cleaningPlanStore.getHistory()).toHaveLength(historyLength);

        Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Undo')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([sort.id]);
        dispose();
    });

    it('rejects moving a column drop before fill when it removes a referenced fill column', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const session = workspace.beginDatasetSession();
        workspace.commitDataset(session, {
            source_version_id: 'source-1', revision: 3, source_version_revision: 3,
            dataset_fingerprint: 'data', profile_status: 'immediate', total_rows: 10,
            columns: [{ name: 'ts', dtype: 'Int64' }, { name: 'value', dtype: 'Float64' }],
            numeric_columns: ['value'], time_column: 'ts', time_range: null, column_profiles: [],
        } as any, 3);
        const sort = cleaningPlanStore.addStage({
            kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true,
            sourcePage: 'manual', label: 'Sort by time', columns: ['ts'], descending: false, nullsLast: true,
        });
        const fill = cleaningPlanStore.addStage({
            kind: 'fillNull', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'manual', label: 'Fill value', columns: ['value'], strategy: 'forward', limit: null,
        });
        const columnSelect = cleaningPlanStore.addStage({
            kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
            sourcePage: 'manual', label: 'Drop value', mode: 'drop', columns: ['value'],
        });
        const dispose = initPreparePage({ workspace });

        const position = document.querySelector<HTMLSelectElement>(`[data-prepare-key="stage-${columnSelect.id}-position"]`)!;
        position.value = '1';
        position.dispatchEvent(new Event('change'));

        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([sort.id, fill.id, columnSelect.id]);
        expect(position.value).toBe('2');
        expect(document.getElementById('prepare-stage-status')?.textContent).toContain('value');
        dispose();
    });

    it('creates a valid missing-value policy without leaving Prepare', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ workspace, onPlanChanged });
        const form = document.querySelector('form.prepare-workspace__policy-form') as HTMLFormElement;
        (form.elements.namedItem('column') as HTMLInputElement).value = 'value';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'missingValue', column: 'value', dropNulls: true, dropNonFinite: true,
        }]);
        expect(onPlanChanged).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('explains disabled moves, fades disabled stages, and confirms permanent removal', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({
            kind: 'missingValue', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'manual', label: 'Drop missing values from HUFL', column: 'HUFL',
            dropNulls: true, dropNonFinite: true,
        });
        const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
        vi.stubGlobal('confirm', confirm);
        const dispose = initPreparePage({ workspace });

        const findButton = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
            .find((candidate) => candidate.textContent === label)!;
        expect(findButton('Move up').title).toBe('Cannot move the only remaining stage');
        expect(findButton('Move down').title).toBe('Cannot move the only remaining stage');
        expect(findButton('Remove').title).toBe('Remove this stage; Undo restores it');

        findButton('Disable').click();
        expect(document.querySelector('.prepare-workspace__stage')?.classList.contains('is-disabled')).toBe(true);
        expect(findButton('Enable')).toBeTruthy();

        findButton('Remove').click();
        expect(confirm).toHaveBeenCalledWith("Remove 'Drop missing values from HUFL'? You can restore it with Undo.");
        expect(cleaningPlanStore.getSnapshot()?.stages).toHaveLength(1);
        findButton('Remove').click();
        expect(cleaningPlanStore.getSnapshot()?.stages).toHaveLength(0);
        dispose();
    });

    it('uses the shared Upload profile grid for the active quality report', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        workspace.commitDataset(workspace.beginDatasetSession(), {
            profile_status: 'exact',
            columns: [{ name: 'temperature', dtype: 'Float64' }],
            column_profiles: [{
                name: 'temperature', dtype: 'Float64', non_null_count: 88, null_count: 12,
                min: -2.5, max: 42.1, histogram: { counts: [2, 5, 8] },
            }],
        } as any, 0);
        const dispose = initPreparePage({ workspace });

        const report = document.getElementById('prepare-profile-findings')!;
        const row = document.querySelector<HTMLElement>('#prepare-profile-grid .profile-grid-row')!;
        expect(report.querySelector('.profile-grid')).toBeTruthy();
        expect(report.querySelector('.upload-preview-type-group')?.textContent).toContain('Show');
        expect(report.querySelector('.upload-preview-type-group')?.textContent).toContain('Datetime');
        expect(report.querySelector('.upload-preview-filter input')?.getAttribute('aria-label')).toBe('Filter profile columns');
        expect(report.querySelector('.prepare-workspace__quality-table')).toBeNull();
        expect(row.textContent).toContain('temperature');
        expect(row.textContent).toContain('88 (88.0%)');
        expect(row.textContent).toContain('12');
        expect(row.textContent).toContain('-2.5');
        expect(report.querySelectorAll('.profile-cell-check input')).toHaveLength(0);
        dispose();
    });

    it('keeps the immediate schema state visible until a completed profile is available', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        workspace.commitDataset(workspace.beginDatasetSession(), {
            profile_status: 'immediate',
            columns: [{ name: 'value', dtype: 'Float64' }],
            column_profiles: [],
        } as any, 0);
        const dispose = initPreparePage({ workspace });

        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Showing the active dataset schema; detailed profile values are pending');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('Pending');
        dispose();
    });

    it('does not render a second Prepare-only quality table for time or extended profile facts', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        workspace.commitDataset(workspace.beginDatasetSession(), {
            profile_status: 'exact',
            columns: [
                { name: 'timestamp', dtype: 'datetime64[ms]' },
                { name: 'flatline', dtype: 'Float64' },
                { name: 'temperature', dtype: 'Float64' },
            ],
            column_profiles: [
                { name: 'timestamp', dtype: 'datetime64[ms]', non_null_count: 4, null_count: 1 },
                { name: 'flatline', dtype: 'Float64', non_null_count: 12, null_count: 0, is_constant: true, finite_count: 12, zero_count: 12 },
                { name: 'temperature', dtype: 'Float64', non_null_count: 9, null_count: 0, non_finite_count: 3 },
            ],
            time_quality: {
                non_null_count: 4, null_count: 1, unique_timestamp_count: 3,
                duplicate_timestamp_count: 1, is_monotonic_non_decreasing: false,
                out_of_order_count: 1, median_gap_ms: 2_000,
            },
        } as any, 0);
        const dispose = initPreparePage({ workspace });

        expect(document.querySelectorAll('#prepare-profile-findings [data-quality-kind]')).toHaveLength(0);
        expect(document.querySelector('#prepare-profile-findings .prepare-workspace__quality-table')).toBeNull();
        expect(document.querySelectorAll('#prepare-profile-grid .profile-grid-row')).toHaveLength(3);
        dispose();
    });

    it('replaces immediate profile rows with the requested exact quality report', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        workspace.commitDataset(workspace.beginDatasetSession(), { columns: [{ name: 'preview_only', dtype: 'Float64' }], column_profiles: [{ name: 'preview_only', dtype: 'Float64', null_count: 1 }] } as any, 0);
        const startProfile = vi.fn(async () => ({
            algorithmVersion: 'exact-v1',
            sourceVersion: { id: 'source-1', revision: 3, datasetFingerprint: 'data' },
            status: 'ready' as const,
            job: null,
            metadata: { profile_status: 'exact', columns: [{ name: 'exact_nulls', dtype: 'Float64' }], column_profiles: [{ name: 'exact_nulls', dtype: 'Float64', non_null_count: 96, null_count: 4 }] } as any,
        }));
        const dispose = initPreparePage({ startProfile });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Build exact quality report')!.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(startProfile).toHaveBeenCalledTimes(1);
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('exact_nulls');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('4');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).not.toContain('preview_only');
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Exact background-profile findings');
        dispose();
    });

    it('shows pending state synchronously, coalesces duplicate starts, and keeps the completed grid visible', async () => {
        const source = selectProfileTestSource({
            profile_status: 'exact',
            columns: [{ name: 'exact_value', dtype: 'Float64' }], numeric_columns: ['exact_value'],
            column_profiles: [{ name: 'exact_value', dtype: 'Float64', non_null_count: 9, null_count: 1 }] as any,
        });
        let resolveStart!: (response: DatasetProfileResponse) => void;
        const startSampleProfile = vi.fn(() => new Promise<DatasetProfileResponse>((resolve) => { resolveStart = resolve; }));
        const getProfile = vi.fn(async () => profileResponse(source, 'not_started'));
        const getSampleProfile = vi.fn(async () => profileResponse(source, 'not_started', 'sampled'));
        const dispose = initPreparePage({ workspace, startSampleProfile, getProfile, getSampleProfile });

        Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Build sampled quality report')!.click();

        expect(document.querySelector('#prepare-profile-findings [role="status"]')?.textContent).toContain('Starting sampled quality report');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('exact_value');
        const pendingButton = Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Starting sampled report…')!;
        expect(pendingButton.disabled).toBe(true);
        pendingButton.click();
        expect(startSampleProfile).toHaveBeenCalledTimes(1);

        resolveStart(profileResponse(source, 'running', 'sampled'));
        await Promise.resolve();
        await Promise.resolve();
        expect(document.querySelector('#prepare-profile-findings button')?.textContent).toContain('Cancel sampled');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('exact_value');
        dispose();
    });

    it('shows a failed start cause and a retry action without replacing completed findings', async () => {
        const source = selectProfileTestSource({
            profile_status: 'exact',
            columns: [{ name: 'exact_value', dtype: 'Float64' }], numeric_columns: ['exact_value'],
            column_profiles: [{ name: 'exact_value', dtype: 'Float64', non_null_count: 9, null_count: 1 }] as any,
        });
        const startSampleProfile = vi.fn()
            .mockRejectedValueOnce(new Error('profile worker is unavailable'))
            .mockRejectedValueOnce(new Error('profile worker is unavailable'));
        const getProfile = vi.fn(async () => profileResponse(source, 'not_started'));
        const getSampleProfile = vi.fn(async () => profileResponse(source, 'not_started', 'sampled'));
        const dispose = initPreparePage({ workspace, startSampleProfile, getProfile, getSampleProfile });

        const startButton = () => Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Build sampled quality report' || button.textContent === 'Retry sampled quality report')!;
        startButton().click();
        await vi.waitFor(() => expect(document.querySelector('#prepare-profile-findings [role="alert"]')?.textContent).toContain('profile worker is unavailable'));
        expect(startButton().textContent).toBe('Retry sampled quality report');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('exact_value');

        startButton().click();
        await vi.waitFor(() => expect(startSampleProfile).toHaveBeenCalledTimes(2));
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('exact_value');
        dispose();
    });

    it('retains the poll failure cause and makes the report retryable', async () => {
        vi.useFakeTimers();
        const source = selectProfileTestSource();
        const notStarted = profileResponse(source, 'not_started');
        const getProfile = vi.fn()
            .mockResolvedValueOnce(notStarted)
            .mockRejectedValueOnce(new Error('profile poll connection timed out'))
            .mockResolvedValueOnce(profileResponse(source, 'running'));
        const getSampleProfile = vi.fn(async () => profileResponse(source, 'not_started', 'sampled'));
        const startProfile = vi.fn(async () => profileResponse(source, 'running'));
        const dispose = initPreparePage({ workspace, startProfile, getProfile, getSampleProfile });

        Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Build exact quality report')!.click();
        await Promise.resolve();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(500);

        expect(document.querySelector('#prepare-profile-findings [role="alert"]')?.textContent).toContain('profile poll connection timed out');
        const retry = Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Retry exact quality report status')!;
        retry.click();
        await vi.advanceTimersByTimeAsync(500);
        expect(document.querySelector('#prepare-profile-findings [role="alert"]')).toBeNull();
        expect(document.querySelector('#prepare-profile-findings [role="status"]')?.textContent).toContain('Exact report in progress');
        expect(startProfile).toHaveBeenCalledOnce();
        dispose();
    });

    it('finishes a cancelled report and restores the build action', async () => {
        vi.useFakeTimers();
        const source = selectProfileTestSource();
        const getProfile = vi.fn()
            .mockResolvedValueOnce(profileResponse(source, 'not_started'))
            .mockResolvedValueOnce(profileResponse(source, 'cancelled'));
        const getSampleProfile = vi.fn(async () => profileResponse(source, 'not_started', 'sampled'));
        const startProfile = vi.fn(async () => profileResponse(source, 'running'));
        const cancelProfile = vi.fn(async () => ({}));
        const dispose = initPreparePage({ workspace, startProfile, getProfile, getSampleProfile, cancelProfile });

        Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Build exact quality report')!.click();
        await Promise.resolve();
        await Promise.resolve();
        Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Cancel exact quality report')!.click();
        expect(Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .find((button) => button.textContent === 'Cancel exact quality report')?.disabled).toBe(true);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(500);

        expect(cancelProfile).toHaveBeenCalledOnce();
        expect(Array.from(document.querySelectorAll<HTMLButtonElement>('#prepare-profile-findings button'))
            .some((button) => button.textContent === 'Build exact quality report')).toBe(true);
        dispose();
    });

    it('labels sampled profile rows as estimates and retains the exact-report action', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        workspace.commitDataset(workspace.beginDatasetSession(), { profile_status: 'immediate', columns: [], column_profiles: [] } as any, 0);
        const startSampleProfile = vi.fn(async () => ({
            algorithmVersion: 'sample-v1',
            sourceVersion: { id: 'source-1', revision: 3, datasetFingerprint: 'data' },
            status: 'ready' as const,
            job: null,
            metadata: {
                profile_status: 'sampled', profile_sample_rows: 10_000,
                column_profiles: [{ name: 'temperature', dtype: 'Float64', non_null_count: 9_993, null_count: 7 }],
            } as any,
        }));
        const dispose = initPreparePage({ startSampleProfile });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Build sampled quality report')!.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(startSampleProfile).toHaveBeenCalledTimes(1);
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Sampled quality findings are estimates from 10,000 rows');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('temperature');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('7');
        expect(Array.from(document.querySelectorAll('button')).some((button) => button.textContent === 'Build exact quality report')).toBe(true);
        dispose();
    });

    it('cancels an in-flight exact quality report from Prepare', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const startProfile = vi.fn(async () => ({
            algorithmVersion: 'exact-v1', sourceVersion: { id: 'source-1', revision: 3, datasetFingerprint: 'data' },
            status: 'running' as const, job: { id: 'profile-job', status: 'running', progressPercent: 5, message: null }, metadata: null,
        }));
        const cancelProfile = vi.fn(async () => ({}));
        const dispose = initPreparePage({ startProfile, cancelProfile });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Build exact quality report')!.click();
        await Promise.resolve();
        await Promise.resolve();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Cancel exact quality report')!.click();
        await Promise.resolve();

        expect(cancelProfile).toHaveBeenCalledWith('profile-job', { signal: expect.any(AbortSignal) });
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Immediate source findings are shown while the exact background quality report runs');
        dispose();
    });

    it('creates stable duplicate resolution from explicit key columns', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const dispose = initPreparePage({ workspace });
        const forms = document.querySelectorAll<HTMLFormElement>('form.prepare-workspace__policy-form');
        const form = forms[1];
        (form.elements.namedItem('columns') as HTMLInputElement).value = 'device, ts';
        (form.elements.namedItem('keep') as HTMLSelectElement).value = 'last';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'deduplicate', columns: ['device', 'ts'], keep: 'last',
        }]);
        dispose();
    });

    it('creates explicit column selection without leaving Prepare', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const dispose = initPreparePage({ workspace });
        const form = document.querySelectorAll<HTMLFormElement>('form.prepare-workspace__policy-form')[2];
        (form.elements.namedItem('columns') as HTMLInputElement).value = 'ts, target';
        (form.elements.namedItem('mode') as HTMLSelectElement).value = 'keep';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'columnSelect', columns: ['ts', 'target'], mode: 'keep', scope: 'schema',
        }]);
        dispose();
    });

    it('requires a time sort before authoring ordered null fill', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const dispose = initPreparePage({ workspace });
        const form = document.querySelectorAll<HTMLFormElement>('form.prepare-workspace__policy-form')[4];
        (form.elements.namedItem('columns') as HTMLInputElement).value = 'value';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(cleaningPlanStore.getSnapshot()!.stages).toHaveLength(0);
        expect(form.textContent).toContain('stable sort on the time column');
        dispose();
    });

    it('authors explicit fixed-duration resampling after an ascending time sort', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({ kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'sort', columns: ['ts'], descending: false, nullsLast: true });
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ workspace, onPlanChanged });
        const form = document.querySelectorAll<HTMLFormElement>('form.prepare-workspace__policy-form')[5];
        (form.elements.namedItem('every') as HTMLInputElement).value = '15m';
        (form.elements.namedItem('aggregations') as HTMLInputElement).value = 'value:mean, volume:sum';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages[1]).toMatchObject({
            kind: 'resample', every: '15m',
            aggregations: [{ column: 'value', method: 'mean' }, { column: 'volume', method: 'sum' }],
        });
        expect(onPlanChanged).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('rejects resampling without the required ascending time sort', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const dispose = initPreparePage({ workspace });
        const form = document.querySelectorAll<HTMLFormElement>('form.prepare-workspace__policy-form')[5];
        (form.elements.namedItem('every') as HTMLInputElement).value = '1h';
        (form.elements.namedItem('aggregations') as HTMLInputElement).value = 'value:last';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages).toHaveLength(0);
        expect(form.textContent).toContain('ascending stable sort');
        dispose();
    });

    it('invalidates preview approval after edits and undo while retaining it across workspace refreshes', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const stage = cleaningPlanStore.addStage({ kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'Sort', columns: ['ts'], descending: false, nullsLast: true });
        const dispose = initPreparePage({ workspace });
        const materialize = () => document.getElementById('prepare-materialize-button') as HTMLButtonElement;
        document.getElementById('prepare-preview-button')!.click();
        await vi.waitFor(() => expect(materialize().disabled).toBe(false));
        expect(document.querySelector('.prepare-workspace__stage-impact')?.textContent).toContain('80 rows after this stage · 20 removed');
        workspace.setViewport({ xMin: 1, xMax: 2, yMin: null, yMax: null });
        expect(materialize().disabled).toBe(false);

        cleaningPlanStore.updateStage(stage.id, { descending: true });
        expect(materialize().disabled).toBe(true);
        expect(document.getElementById('prepare-preview-status')?.textContent).toContain('The plan changed');
        expect(document.querySelector('.prepare-workspace__stage-impact')?.textContent).not.toContain('80 rows');
        cleaningPlanStore.undo();
        expect(materialize().disabled).toBe(true);
        document.getElementById('prepare-preview-button')!.click();
        await vi.waitFor(() => expect(materialize().disabled).toBe(false));
        dispose();
    });

    it('ignores a late preview after switching datasets and never approves a failed preview', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const addSort = () => cleaningPlanStore.addStage({ kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'Sort', columns: ['ts'], descending: false, nullsLast: true });
        addSort();
        let finish!: (response: unknown) => void;
        cleaningApi.previewCleaningPlan.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
        const dispose = initPreparePage({ workspace });
        document.getElementById('prepare-preview-button')!.click();
        const signal = cleaningApi.previewCleaningPlan.mock.calls[0]![1].signal as AbortSignal;
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-2', datasetRevision: 4, datasetFingerprint: 'new', schemaFingerprint: 'schema', timeColumn: 'ts' });
        addSort();
        expect(signal.aborted).toBe(true);
        finish({ sourceVersion: { id: 'source-1' }, datasetRevision: 3, rowsAfter: 80, rowsBefore: 100, columnsAfter: 8, columnsBefore: 8, warnings: [], stageImpacts: [] });
        await Promise.resolve();
        expect((document.getElementById('prepare-materialize-button') as HTMLButtonElement).disabled).toBe(true);
        expect(document.getElementById('prepare-preview-status')?.textContent).not.toContain('80 of 100');
        cleaningApi.previewCleaningPlan.mockRejectedValueOnce(new Error('Preview failed'));
        document.getElementById('prepare-preview-button')!.click();
        await vi.waitFor(() => expect(document.getElementById('prepare-preview-status')?.textContent).toBe('Preview failed'));
        expect((document.getElementById('prepare-materialize-button') as HTMLButtonElement).disabled).toBe(true);
        expect((document.getElementById('prepare-preview-button') as HTMLButtonElement).disabled).toBe(false);
        dispose();
    });

    it('preserves the selected composer, typed values, text selection, and profile filters through refreshes', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        workspace.commitDataset(workspace.beginDatasetSession(), { profile_status: 'exact', column_profiles: [{ name: 'value', dtype: 'Float64', null_count: 0 }] } as any, 0);
        const dispose = initPreparePage({ workspace });
        const selector = document.getElementById('prepare-transformation') as HTMLSelectElement;
        selector.value = '4';
        selector.dispatchEvent(new Event('change'));
        const form = document.querySelectorAll<HTMLFormElement>('form')[4]!;
        const input = form.elements.namedItem('columns') as HTMLInputElement;
        input.value = 'value';
        input.focus();
        input.setSelectionRange(1, 3);
        const profileFilter = document.getElementById('prepare-profile-filter-input') as HTMLInputElement;
        profileFilter.value = 'not-a-column';
        profileFilter.dispatchEvent(new Event('input'));

        workspace.setViewport({ xMin: 1, xMax: 2, yMin: null, yMax: null });

        expect((document.getElementById('prepare-transformation') as HTMLSelectElement).value).toBe('4');
        const updated = document.querySelectorAll<HTMLFormElement>('form')[4]!;
        const updatedInput = updated.elements.namedItem('columns') as HTMLInputElement;
        expect(updated.hidden).toBe(false);
        expect(updatedInput.value).toBe('value');
        expect(document.activeElement).toBe(updatedInput);
        expect([updatedInput.selectionStart, updatedInput.selectionEnd]).toEqual([1, 3]);
        expect((document.getElementById('prepare-profile-filter-input') as HTMLInputElement).value).toBe('not-a-column');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-row')?.textContent).toContain('No columns match this filter');
        dispose();
    });

    it('focuses a newly added stage and keeps focus on its toggle after rerendering', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const dispose = initPreparePage({ workspace });
        const form = document.querySelector<HTMLFormElement>('form')!;
        const input = form.elements.namedItem('column') as HTMLInputElement;
        input.value = 'value';
        input.focus();
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(document.activeElement?.classList.contains('prepare-workspace__stage')).toBe(true);
        const toggle = document.querySelector<HTMLButtonElement>('[data-prepare-key$="-toggle"]')!;
        toggle.focus();
        toggle.click();
        expect(document.activeElement?.textContent).toBe('Enable');
        expect(document.activeElement).toBe(document.querySelector('[data-prepare-key$="-toggle"]'));
        dispose();
    });

    it('supports direct positioning and explains invalid ordering beside the stages', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const sort = cleaningPlanStore.addStage({ kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'Sort', columns: ['ts'], descending: false, nullsLast: true });
        const sample = cleaningPlanStore.addStage({ kind: 'resample', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: 'Resample', every: '15m', aggregations: [{ column: 'value', method: 'mean' }] });
        const note = cleaningPlanStore.addStage({ kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true, sourcePage: 'manual', label: 'Note' });
        const dispose = initPreparePage({ workspace });
        const invalid = document.querySelector<HTMLSelectElement>(`[data-prepare-key="stage-${sort.id}-position"]`)!;
        invalid.value = '2';
        invalid.dispatchEvent(new Event('change'));
        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([sort.id, sample.id, note.id]);
        expect(invalid.value).toBe('0');
        expect(document.getElementById('prepare-stage-status')?.textContent).toContain('Resampling requires');
        const position = document.querySelector<HTMLSelectElement>(`[data-prepare-key="stage-${note.id}-position"]`)!;
        position.focus();
        position.value = '0';
        position.dispatchEvent(new Event('change'));
        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([note.id, sort.id, sample.id]);
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Position of Note');
        expect(Array.from(document.querySelectorAll('.prepare-workspace__stage-number')).map((number) => number.textContent)).toEqual(['1', '2', '3']);
        dispose();
    });

    it('keeps the sampled report in the shared Upload grid shape', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const startSampleProfile = vi.fn(async () => ({
            algorithmVersion: 'sample-v1', sourceVersion: { id: 'source-1', revision: 3, datasetFingerprint: 'data' }, status: 'ready' as const, job: null,
            metadata: { profile_status: 'sampled', profile_sample_rows: 100, total_rows: 10000, column_profiles: [
                { name: 'clean', dtype: 'Float64', non_null_count: 100, null_count: 0, min: 39.11999893188477, max: 42 },
                { name: 'missing', dtype: 'Float64', non_null_count: 95, null_count: 5 },
            ] } as any,
        }));
        const dispose = initPreparePage({ startSampleProfile: startSampleProfile as any });
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Build sampled quality report')!.click();
        await vi.waitFor(() => expect(document.querySelector('#prepare-profile-grid .profile-grid-row'))?.not.toBeNull());
        const quality = document.getElementById('prepare-profile-findings')!;
        expect(quality.querySelector('.prepare-workspace__quality-table')).toBeNull();
        expect(quality.querySelectorAll('.profile-grid-header .profile-col')).toHaveLength(7);
        expect(quality.querySelectorAll('.profile-grid-row')).toHaveLength(2);
        expect(quality.textContent).toContain('5');
        const sections = Array.from(document.querySelectorAll('#prepare-workspace > section')).map((section) => section.id);
        expect(sections.indexOf('prepare-profile-findings')).toBeLessThan(sections.indexOf('prepare-pipeline-preview'));
        dispose();
    });
});
