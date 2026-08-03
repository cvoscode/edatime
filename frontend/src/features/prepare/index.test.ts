import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initPreparePage } from './index.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { datasetState } from '../../store/datasetState.js';

describe('Prepare page', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="open-cleaning-plan-btn"></button><div id="prepare-workspace"></div>';
        cleaningPlanStore.clear();
        datasetState.metadata = null;
    });

    afterEach(() => cleaningPlanStore.clear());

    it('renders the canonical graph and opens the shared workbench for editing', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Window', startMs: 1, endMs: 2, mode: 'keepInside',
        });
        const opened = vi.fn();
        document.getElementById('open-cleaning-plan-btn')!.addEventListener('click', opened);
        const dispose = initPreparePage();

        expect(document.querySelector('.pipeline-graph')).not.toBeNull();
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('source-1');
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Open Pipeline Workbench')!.click();
        expect(opened).toHaveBeenCalledTimes(1);

        dispose();
    });

    it('stays source-first until a dataset establishes a plan', () => {
        const dispose = initPreparePage();
        const open = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Open Pipeline Workbench')!;

        expect(open.disabled).toBe(true);
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Load a dataset');

        dispose();
    });

    it('provides the same page-level help contract as every analysis page', () => {
        const dispose = initPreparePage();
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
        const dispose = initPreparePage({ onPlanChanged });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Down')!.click();
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

    it('creates a valid missing-value policy without leaving Prepare', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ onPlanChanged });
        const form = document.querySelector('form.prepare-workspace__policy-form') as HTMLFormElement;
        (form.elements.namedItem('column') as HTMLInputElement).value = 'value';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'missingValue', column: 'value', dropNulls: true, dropNonFinite: true,
        }]);
        expect(onPlanChanged).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('turns an exact null-value finding into one reversible policy stage', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        datasetState.metadata = {
            column_profiles: [
                { name: 'temperature', dtype: 'Float64', null_count: 12 },
                { name: 'category', dtype: 'String', null_count: 2 },
            ],
        } as any;
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ onPlanChanged });

        const temperatureFinding = document.querySelector<HTMLElement>('[data-quality-column="temperature"]')!;
        expect(temperatureFinding.textContent).toContain('12 null values');
        Array.from(temperatureFinding.querySelectorAll('button')).find((button) => button.textContent === 'Add null policy')!.click();

        expect(cleaningPlanStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'missingValue', column: 'temperature', dropNulls: true, dropNonFinite: true,
        }]);
        expect(onPlanChanged).toHaveBeenCalledTimes(1);
        expect(temperatureFinding.querySelector('button')?.textContent).toBe('Add null policy');
        expect(document.querySelector<HTMLElement>('[data-quality-column="temperature"] button')?.textContent).toBe('Policy already added');
        dispose();
    });

    it('does not present deferred schema metadata as a clean quality profile', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        datasetState.metadata = { profile_status: 'immediate', column_profiles: [] } as any;
        const dispose = initPreparePage();

        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Column quality findings are pending the exact profile');
        dispose();
    });

    it('surfaces completed time-order and duplicate facts without inventing a repair', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        datasetState.metadata = {
            profile_status: 'exact',
            column_profiles: [],
            time_quality: {
                non_null_count: 4,
                null_count: 1,
                unique_timestamp_count: 3,
                duplicate_timestamp_count: 1,
                is_monotonic_non_decreasing: false,
                out_of_order_count: 1,
                min_gap_ms: 2_000,
                median_gap_ms: 2_000,
                max_gap_ms: 2_000,
            },
        } as any;
        const dispose = initPreparePage();

        const finding = document.querySelector<HTMLElement>('[data-quality-kind="time"]')!;
        expect(finding.textContent).toContain('3 unique timestamps');
        expect(finding.textContent).toContain('1 duplicate timestamp');
        expect(finding.textContent).toContain('1 out-of-order transition');
        expect(finding.textContent).toContain('median observed gap 2000 ms');
        expect(finding.querySelector('button')).toBeNull();
        dispose();
    });

    it('surfaces constant numeric columns as completed-profile findings', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        datasetState.metadata = {
            profile_status: 'exact',
            column_profiles: [{
                name: 'flatline', dtype: 'Float64', null_count: 0,
                is_constant: true, finite_count: 12, zero_count: 12,
            }],
        } as any;
        const dispose = initPreparePage();

        const finding = document.querySelector<HTMLElement>('[data-quality-column="flatline"][data-quality-kind="constant"]')!;
        expect(finding.textContent).toContain('constant numeric values');
        expect(finding.textContent).toContain('12 finite values');
        expect(finding.textContent).toContain('12 zeros');
        expect(finding.querySelector('button')).toBeNull();
        dispose();
    });

    it('turns an exact non-finite finding into a reversible non-finite policy', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        datasetState.metadata = { column_profiles: [{ name: 'temperature', dtype: 'Float64', null_count: 0, non_finite_count: 3 }] } as any;
        const dispose = initPreparePage();

        const finding = document.querySelector<HTMLElement>('[data-quality-column="temperature"][data-quality-kind="nonFinite"]')!;
        expect(finding.textContent).toContain('3 non-finite values');
        Array.from(finding.querySelectorAll('button')).find((button) => button.textContent === 'Add non-finite policy')!.click();

        expect(cleaningPlanStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'missingValue', column: 'temperature', dropNulls: false, dropNonFinite: true,
        }]);
        dispose();
    });

    it('replaces immediate findings with the requested exact quality report', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        datasetState.metadata = { column_profiles: [{ name: 'preview_only', dtype: 'Float64', null_count: 1 }] } as any;
        const startProfile = vi.fn(async () => ({
            algorithmVersion: 'exact-v1',
            sourceVersion: { id: 'source-1', revision: 3, datasetFingerprint: 'data' },
            status: 'ready' as const,
            job: null,
            metadata: { column_profiles: [{ name: 'exact_nulls', dtype: 'Float64', null_count: 4 }] } as any,
        }));
        const dispose = initPreparePage({ startProfile });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Build exact quality report')!.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(startProfile).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-quality-column="exact_nulls"]')?.textContent).toContain('4 null values');
        expect(document.querySelector('[data-quality-column="preview_only"]')).toBeNull();
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Exact background-profile findings');
        dispose();
    });

    it('labels sampled quality findings as estimates and retains the exact-report action', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        datasetState.metadata = { profile_status: 'immediate', column_profiles: [] } as any;
        const startSampleProfile = vi.fn(async () => ({
            algorithmVersion: 'sample-v1',
            sourceVersion: { id: 'source-1', revision: 3, datasetFingerprint: 'data' },
            status: 'ready' as const,
            job: null,
            metadata: {
                profile_status: 'sampled', profile_sample_rows: 10_000,
                column_profiles: [{ name: 'temperature', dtype: 'Float64', null_count: 7 }],
            } as any,
        }));
        const dispose = initPreparePage({ startSampleProfile });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Build sampled quality report')!.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(startSampleProfile).toHaveBeenCalledTimes(1);
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Sampled quality findings are estimates from 10000 rows');
        expect(document.querySelector('[data-quality-column="temperature"]')?.textContent).toContain('7 null values');
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

        expect(cancelProfile).toHaveBeenCalledWith('profile-job');
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Immediate source findings are shown while the exact background quality report runs');
        dispose();
    });

    it('creates stable duplicate resolution from explicit key columns', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const dispose = initPreparePage();
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
        const dispose = initPreparePage();
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
        const dispose = initPreparePage();
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
        const dispose = initPreparePage({ onPlanChanged });
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
        const dispose = initPreparePage();
        const form = document.querySelectorAll<HTMLFormElement>('form.prepare-workspace__policy-form')[5];
        (form.elements.namedItem('every') as HTMLInputElement).value = '1h';
        (form.elements.namedItem('aggregations') as HTMLInputElement).value = 'value:last';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages).toHaveLength(0);
        expect(form.textContent).toContain('ascending stable sort');
        dispose();
    });
});
