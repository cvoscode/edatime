import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppliedPlanHistoryResponse } from '../cleaning/api.js';
import type { CleaningPlan } from '../cleaning/types.js';
import { makeWorkspaceSnapshot } from '../workspace/workspaceStore.js';
import {
    buildExportProvenance,
    configureExportProvenance,
    recordExportForProvenance,
    type ExportProvenanceDeps,
} from './exportProvenance.js';
import { beginCompletedAnalysisExportContext } from './exportProvenanceContext.js';

const plan: CleaningPlan = {
    schemaVersion: 1,
    id: 'draft-1',
    planRevision: 3,
    sourceVersionId: 'version-7',
    datasetRevision: 7,
    datasetFingerprint: 'fingerprint-7',
    schemaFingerprint: 'schema-7',
    timeColumn: 'date',
    sourceName: 'ETTm2.csv',
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:01:00.000Z',
    stages: [{
        id: 'range-1', kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
        sourcePage: 'manual', label: 'Trim time range', startMs: 1000, endMs: 2000, mode: 'keepInside',
        createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:01:00.000Z',
    }],
};

function makeDeps(historyStatus: AppliedPlanHistoryResponse['historyStatus'] = 'available'): ExportProvenanceDeps {
    const metadata = {
        source_name: 'ETTm2.csv', source_version_id: 'version-7', source_version_revision: 7,
        dataset_fingerprint: 'fingerprint-7', schema_fingerprint: 'schema-7', total_rows: 69_680,
        columns: [{ name: 'date', dtype: 'Datetime[ns]' }, { name: 'OT', dtype: 'Float64' }],
        numeric_columns: ['OT'], time_column: 'date', time_range: { min: 1467331200000, max: 1530403200000 },
        column_profiles: [],
    } as any;
    return {
        workspace: {
            getSnapshot: () => makeWorkspaceSnapshot({
                dataset: { metadata, revision: 7, activeSourceVersionId: 'version-7', sourceFingerprint: 'fingerprint-7' },
                selection: { columns: ['OT'], colorColumn: 'OT' },
                filters: { columnRanges: { OT: { from: -10, to: 10 } }, adaptiveLines: [] },
                viewport: { xMin: 1, xMax: 100, yMin: -5, yMax: 5 },
            }),
        },
        cleaningPlanStore: { getSnapshot: () => plan, isDirty: () => true },
        getData: () => ({
            ts: new Float64Array(), values: {}, color: null, color_column: null,
            _meta: { downsampled: false, downsampleKnown: true, returnedRows: 69_680, targetPoints: 69_680,
                executionIdentity: { sourceVersionId: 'version-7', sourceRevision: 7, schemaFingerprint: 'schema-7', planHash: 'fnv1a-draft' } },
        }),
        loadAppliedPlanHistory: vi.fn(async (versionId: string) => ({
            sourceVersion: { id: versionId, sourceName: 'ETTm2.csv', displayName: 'ETTm2.csv · prepared v7' }, appliedPlan: plan, historyStatus,
        } as AppliedPlanHistoryResponse)),
    };
}

describe('export provenance sidecars', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('captures matching dataset, selected traces, sampling, preparation, and current analysis settings', async () => {
        document.body.innerHTML = `
            <section data-page-name="fft">
                <select id="fft-scale"><option value="log" selected>Log</option></select>
                <input id="fft-window" type="number" value="512">
                <label class="series-chip"><input type="checkbox" checked value="OT" aria-label="Toggle OT series"></label>
                <span id="fft-sampling-badge">FFT sampled 4,096 values</span>
            </section>
            <section data-page-name="timeseries" hidden>
                <div id="timeseries-sampling-indicator">Exact source rows</div>
            </section>
            <section data-page-name="spectrogram" hidden>
                <div id="spectrogram-sampling-context">Hidden context</div>
            </section>`;
        const deps = makeDeps();
        const provenance = await buildExportProvenance('edatime_spectrum.csv', 'text/csv', deps);

        expect(provenance.export).toEqual({ filename: 'edatime_spectrum.csv', mimeType: 'text/csv' });
        expect(provenance.dataset).toMatchObject({
            name: 'ETTm2.csv · prepared v7', sourceVersionId: 'version-7', sourceRevision: 7,
            datasetFingerprint: 'fingerprint-7', totalRows: 69_680,
            timeRange: { start: '2016-07-01T00:00:00.000Z', end: '2018-07-01T00:00:00.000Z' },
        });
        expect(provenance.selection).toMatchObject({ columns: ['OT'], colorColumn: 'OT', visibleTraceCheckboxes: ['OT'] });
        expect(provenance.filters.columnRanges).toEqual({ OT: { from: -10, to: 10 } });
        expect(provenance.viewport).toEqual({ xMin: 1, xMax: 100, yMin: -5, yMax: 5 });
        expect(provenance.analysis).toEqual({ page: 'fft', controls: { 'fft-scale': 'log', 'fft-window': 512 } });
        expect(provenance.sampling).toEqual({ signals: null, spectrum: 'FFT sampled 4,096 values', timeFrequency: null });
        expect(provenance.preparation.draftIsDirty).toBe(true);
        expect(provenance.preparation.draftPlanHash).toMatch(/^fnv1a-/);
        expect(provenance.preparation.appliedPlanHistory).toMatchObject({ status: 'available', plan: { id: 'draft-1' } });
        expect(provenance.result.matchesActiveDataset).toBeNull();
        expect(deps.loadAppliedPlanHistory).toHaveBeenCalledWith('version-7');
    });

    it('exports the completed Drift parameters and identity after live controls change', async () => {
        document.body.innerHTML = `
            <section data-page-name="drift">
                <input id="drift-psi-major-threshold" type="number" value="0.99">
            </section>`;
        const deps = makeDeps();
        const dispose = configureExportProvenance(deps);
        const complete = beginCompletedAnalysisExportContext({
            pageName: 'drift',
            controls: { columns: 'OT', psiMajorThreshold: 0.2, referenceStart: '2024-01-01T00:00:00Z' },
        });
        complete({ sourceVersionId: 'version-7', sourceRevision: 7, schemaFingerprint: 'schema-7', planHash: 'none' });

        const provenance = await buildExportProvenance('drift.json', 'application/json', deps, 'drift');
        expect(provenance.analysis.controls).toEqual({
            columns: 'OT', psiMajorThreshold: 0.2, referenceStart: '2024-01-01T00:00:00Z',
        });
        expect(provenance.result.executionIdentity).toEqual({
            sourceVersionId: 'version-7', sourceRevision: 7, schemaFingerprint: 'schema-7', planHash: 'none',
        });
        dispose();
    });

    it('marks mismatched applied-plan history explicitly and exposes retry after the automatic sidecar download', async () => {
        document.body.innerHTML = `
            <section data-page-name="fft"></section>
            <div id="export-provenance-retry" hidden>
                <span class="export-provenance-retry__message"></span>
                <button id="retry-export-provenance-btn" hidden></button>
                <button id="dismiss-export-provenance-btn"></button>
            </div>`;
        const deps = makeDeps();
        deps.loadAppliedPlanHistory = vi.fn(async () => ({
            sourceVersion: { id: 'another-version' }, appliedPlan: plan, historyStatus: 'available',
        } as AppliedPlanHistoryResponse));
        const provenance = await buildExportProvenance('dataset.parquet', 'application/vnd.apache.parquet', deps);
        expect(provenance.preparation.appliedPlanHistory).toEqual({ status: 'mismatched', plan: null });

        const createObjectURL = vi.fn(() => 'blob:sidecar');
        vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const dispose = configureExportProvenance(deps);
        recordExportForProvenance('dataset.parquet', 'application/vnd.apache.parquet');
        await vi.waitFor(() => expect(document.getElementById('export-provenance-retry')?.hidden).toBe(false));
        expect(document.querySelector('.export-provenance-retry__message')?.textContent).toContain('dataset.provenance.json');
        const retry = document.getElementById('retry-export-provenance-btn') as HTMLButtonElement;
        expect(retry.hidden).toBe(false);
        const clickCount = click.mock.calls.length;
        retry.click();
        expect(click.mock.calls.length).toBe(clickCount + 1);
        dispose();
    });
});
