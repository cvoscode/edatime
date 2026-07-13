import { describe, expect, it } from 'vitest';
import type { DriftInvestigationResponse, DriftResponse } from './viewModels.js';
import { buildDriftCsv, buildDriftJsonExport } from './exportPayloads.js';

const response = {
    column: 'temperature',
    windows: [{
        label: 'Jan 1', start_ms: 1, end_ms: 2, count: 8, mean: 1.2, std: 0.2, quantiles: [0, 1, 1.1],
        ks_stat: 0.1, ks_pvalue: 0.02, es_stat: 0.12, es_pvalue: 0.03, wasserstein: 0.4, psi: 0.26,
        jensen_shannon: 0.05, completeness_delta: 0, trigger_reasons: ['psi_major'], drift_level: 'red',
    }],
} as DriftResponse;

describe('drift export payloads', () => {
    it('serializes evaluated windows to CSV with summary columns', () => {
        const csv = buildDriftCsv(new Map([['temperature', response]]));

        expect(csv).toContain('column,window,start_ms');
        expect(csv).toContain('temperature,Jan 1,1,2,8,1.200000');
        expect(csv).toContain('"psi_major",red,red,red,1');
    });

    it('includes evaluation context and filtered data in the JSON export', () => {
        const json = buildDriftJsonExport({ columns: {} } as DriftInvestigationResponse, 'temperature', 'latest-n', 2, new Map([['temperature', response]]));
        const parsed = JSON.parse(json);

        expect(parsed).toMatchObject({ activeColumn: 'temperature', evaluationMode: 'latest-n', latestWindowCount: 2 });
        expect(parsed.filteredColumns.temperature.column).toBe('temperature');
    });
});
