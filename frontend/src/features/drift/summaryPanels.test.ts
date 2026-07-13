import { describe, expect, it } from 'vitest';
import type { DriftResponse } from './viewModels.js';
import { buildDriftSummaryPanelHtml } from './summaryPanels.js';

const response = {
    column: 'temperature',
    windows: [{
        label: 'Jan 1', psi: 0.26, wasserstein: 0.4, ks_pvalue: 0.02, es_pvalue: 0.03,
        drift_level: 'red', trigger_reasons: ['psi_major'],
    }],
} as DriftResponse;

describe('drift summary panels', () => {
    it('renders global and column summaries from evaluated responses', () => {
        const panels = buildDriftSummaryPanelHtml(new Map([['temperature', response]]));

        expect(panels.summaryStrip).toContain('Any drift detected?');
        expect(panels.summaryStrip).toContain('drift-red');
        expect(panels.columnSummary).toContain('temperature');
        expect(panels.columnSummary).toContain('Latest PSI/Wass: 0.260');
        expect(panels.columnSummary).toContain('Flagged windows: 1/1');
    });

    it('clears both summaries with no responses', () => {
        expect(buildDriftSummaryPanelHtml(new Map())).toEqual({ summaryStrip: '', columnSummary: '' });
    });
});
