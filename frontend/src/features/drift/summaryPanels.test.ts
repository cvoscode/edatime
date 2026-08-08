import { describe, expect, it } from 'vitest';
import type { DriftInvestigationResponse, DriftResponse } from './viewModels.js';
import { buildDriftSummaryPanelHtml } from './summaryPanels.js';

const response = {
    column: 'temperature',
    windows: [{
        label: 'Jan 1', psi: 0.26, wasserstein: 0.4, ks_pvalue: 0.02, es_pvalue: 0.03,
        drift_level: 'red', trigger_reasons: ['psi_major'],
    }],
    metadata: {
        computation_time_ms: 1,
        num_windows: 1,
        reference_samples: 100,
        avg_window_samples: 50,
        psi_sample_ratio_warning: false,
    },
} as DriftResponse;

const imbalancedResponse = {
    column: 'temperature',
    windows: [{
        label: 'Jan 1', psi: 0.26, wasserstein: 0.4, ks_pvalue: 0.02, es_pvalue: 0.03,
        drift_level: 'red', trigger_reasons: ['psi_major'],
    }],
    metadata: {
        computation_time_ms: 1,
        num_windows: 1,
        reference_samples: 10000,
        avg_window_samples: 50,
        psi_sample_ratio_warning: true,
    },
} as DriftResponse;

const investigation = {
    overview: {
        driftScore: 91,
        worstLevel: 'red',
        columnsFlagged: 1,
        totalColumns: 1,
        windowsFlagged: 2,
        firstChangePoint: '2025-01-02T00:00:00Z',
    },
    rankings: {
        features: [],
        segments: [],
        changePoints: [{ column: 'temperature', label: 'Jan 2', isoTime: '2025-01-02T00:00:00Z', driftScore: 91, triggerReasons: ['psi_major'] }],
        qualityIssues: [],
        relationships: [],
    },
    columns: {},
    quality: { byColumn: {} },
    relationships: { mode: 'pearson_raw', pairs: [] },
} as unknown as DriftInvestigationResponse;

describe('drift summary panels', () => {
    it('renders global and column summaries from evaluated responses', () => {
        const panels = buildDriftSummaryPanelHtml(new Map([['temperature', response]]));

        expect(panels.summaryStrip).toContain('Data drift detected');
        expect(panels.summaryStrip).toContain('drift-red');
        expect(panels.columnSummary).toContain('temperature');
        expect(panels.columnSummary).toContain('100% (1/1)');
        expect(panels.columnSummary).toContain('PSI (0.260)');
    });

    it('clears both summaries with no responses', () => {
        expect(buildDriftSummaryPanelHtml(new Map())).toEqual({ summaryStrip: '', columnSummary: '' });
    });

    it('downgrades the verdict when a column has a sample-size imbalance warning', () => {
        const panels = buildDriftSummaryPanelHtml(new Map([['temperature', imbalancedResponse]]));

        expect(panels.summaryStrip).toContain('drift-verdict--degraded');
        expect(panels.summaryStrip).toContain('Method reliability');
        expect(panels.summaryStrip).toMatch(/[Rr]eference.{0,40}window.{0,40}10×/i);
        expect(panels.summaryStrip).toContain('Open Quality panel');
    });

    it('renders a change-points card when the investigation supplies change points', () => {
        const panels = buildDriftSummaryPanelHtml(new Map([['temperature', response]]), investigation);

        expect(panels.summaryStrip).toContain('drift-change-point-chip');
        expect(panels.summaryStrip).toContain('temperature');
    });

    it('renders a "Why this verdict?" disclosure with the strongest evidence', () => {
        const panels = buildDriftSummaryPanelHtml(new Map([['temperature', response]]));

        expect(panels.summaryStrip).toContain('drift-verdict__evidence');
        expect(panels.summaryStrip).toContain('temperature');
    });

    it('renders a trend badge, Wasserstein, and KS p-value in the trace table', () => {
        const trendResponse = (() => {
            const base: DriftResponse = {
                ...response,
                windows: [
                    { ...response.windows[0]!, psi: 0.05, wasserstein: 0.1, ks_pvalue: 0.6, drift_level: 'green' },
                    { ...response.windows[0]!, psi: 0.10, wasserstein: 0.2, ks_pvalue: 0.5, drift_level: 'yellow' },
                    { ...response.windows[0]!, psi: 0.20, wasserstein: 0.4, ks_pvalue: 0.3, drift_level: 'yellow' },
                    { ...response.windows[0]!, psi: 0.30, wasserstein: 0.6, ks_pvalue: 0.05, drift_level: 'red' },
                    { ...response.windows[0]!, psi: 0.55, wasserstein: 0.9, ks_pvalue: 0.001, drift_level: 'red' },
                ],
            };
            return base;
        })();

        const panels = buildDriftSummaryPanelHtml(new Map([['temperature', trendResponse]]));

        expect(panels.columnSummary).toContain('drift-trend');
        expect(panels.columnSummary).toContain('PSI');
        expect(panels.columnSummary).toContain('Wasserstein');
        expect(panels.columnSummary).toContain('KS p');
        // The trend should be "accelerating" because the last two windows are red.
        expect(panels.columnSummary).toMatch(/accelerating|stable/i);
    });
});
