import { describe, expect, it } from 'vitest';
import type { DriftInvestigationResponse } from './viewModels.js';
import { buildDriftInvestigationPanelHtml } from './investigationPanels.js';

const investigation = {
    overview: {
        driftScore: 42,
        worstLevel: 'red',
        columnsFlagged: 1,
        totalColumns: 2,
        windowsFlagged: 3,
        firstChangePoint: '2025-01-02T00:00:00Z',
    },
    rankings: {
        features: [{ column: 'temperature', driftScore: 42, latestLevel: 'red', flaggedWindows: 3, firstChangePoint: null }],
        segments: [],
        changePoints: [],
        qualityIssues: [],
        relationships: [],
    },
    columns: {},
    quality: { byColumn: {} },
    relationships: { mode: 'full', pairs: [] },
} as DriftInvestigationResponse;

describe('drift investigation panels', () => {
    it('renders overview data and empty panel states from an investigation response', () => {
        const panels = buildDriftInvestigationPanelHtml(investigation);

        expect(panels.overview).toContain('temperature');
        expect(panels.overview).toContain('drift-red');
        expect(panels.segments).toContain('No segment breakdown returned.');
        expect(panels.quality).toContain('No data-quality issues detected.');
        expect(panels.relationships).toContain('No relationship drift detected.');
    });

    it('renders a method reliability card when a column has a sample-size imbalance', () => {
        const imbalancedInvestigation = {
            ...investigation,
            columns: {
                temperature: {
                    column: 'temperature',
                    windows: [],
                    reference: {
                        start_ms: 0, end_ms: 1, label: 'ref', count: 10000, null_count: 0,
                        completeness: 1, mean: 1, std: 1, min: 0, max: 2,
                        quantiles: [], hist_bins: [], hist_counts: [], ecdf_x: [], ecdf_y: [],
                    },
                    thresholds: {
                        ks_pvalue_threshold: 0.05, es_pvalue_threshold: 0.05,
                        wasserstein_threshold: 0.2, psi_minor_threshold: 0.1, psi_major_threshold: 0.2,
                    },
                    metadata: {
                        computation_time_ms: 1, num_windows: 0, reference_samples: 10000,
                        avg_window_samples: 50, psi_sample_ratio_warning: true,
                    },
                },
            },
        } as unknown as DriftInvestigationResponse;

        const panels = buildDriftInvestigationPanelHtml(imbalancedInvestigation);
        expect(panels.quality).toContain('Method reliability');
        expect(panels.quality).toContain('temperature');
        expect(panels.quality).toMatch(/200×/);
    });

    it('clears every panel when no investigation is available', () => {
        expect(buildDriftInvestigationPanelHtml(null)).toEqual({
            overview: '',
            segments: '',
            quality: '',
            relationships: '',
        });
    });
});
