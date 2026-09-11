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

    it('ranks tied features by a differentiating drift metric', () => {
        const withMetrics = {
            ...investigation,
            rankings: {
                ...investigation.rankings,
                features: [
                    { column: 'a', driftScore: 100, latestLevel: 'red', flaggedWindows: 2, firstChangePoint: null },
                    { column: 'b', driftScore: 100, latestLevel: 'red', flaggedWindows: 2, firstChangePoint: null },
                ],
            },
            columns: {
                a: { column: 'a', windows: [{ psi: 0.2, wasserstein: 0.4 }] },
                b: { column: 'b', windows: [{ psi: 0.8, wasserstein: 0.6 }] },
            },
        } as unknown as DriftInvestigationResponse;

        const overview = buildDriftInvestigationPanelHtml(withMetrics).overview;
        expect(overview.indexOf('#1 · b')).toBeLessThan(overview.indexOf('#2 · a'));
        expect(overview).toContain('Peak PSI: 0.800');
        expect(overview).toContain('Peak Wasserstein: 0.600');
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

    it('renders every ranked column and aggregates a shared reliability warning', () => {
        const columnNames = ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'];
        const fullInvestigation = {
            ...investigation,
            overview: {
                ...investigation.overview,
                columnsFlagged: columnNames.length,
                totalColumns: columnNames.length,
            },
            rankings: {
                ...investigation.rankings,
                features: columnNames.map((column, index) => ({
                    column,
                    driftScore: 100 - index,
                    latestLevel: 'red' as const,
                    flaggedWindows: index + 1,
                    firstChangePoint: null,
                })),
                changePoints: columnNames.map((column, index) => ({
                    column,
                    windowIndex: index,
                    isoTime: `2025-01-0${index + 1}T00:00:00Z`,
                    label: `Window ${index + 1}`,
                    triggerReasons: ['ks'],
                })),
            },
            columns: Object.fromEntries(columnNames.map((column) => [column, {
                column,
                windows: [],
                metadata: {
                    computation_time_ms: 1,
                    num_windows: 0,
                    reference_samples: 1000,
                    avg_window_samples: 50,
                    psi_sample_ratio_warning: true,
                },
            }])),
        } as unknown as DriftInvestigationResponse;

        const panels = buildDriftInvestigationPanelHtml(fullInvestigation);

        for (const column of columnNames) {
            expect(panels.overview).toContain(`· ${column}</strong>`);
            expect(panels.quality).toContain(column);
        }
        expect(panels.overview.match(/class="drift-column-card__header"/g)).toHaveLength(19);
        expect(panels.quality).toContain('<strong>All 7 columns</strong>');
        expect(panels.quality.match(/class="drift-column-card__header"/g)).toHaveLength(1);
    });

    it('splits a change-point range into complete start and end rows', () => {
        const withChangePoint = {
            ...investigation,
            rankings: {
                ...investigation.rankings,
                changePoints: [{
                    column: 'temperature',
                    label: '2025-01-01 00:00 - 2025-01-02 00:00',
                    isoTime: '2025-01-01T00:00:00Z',
                    driftScore: 80,
                    triggerReasons: ['psi'],
                }],
            },
        } as DriftInvestigationResponse;
        const overview = buildDriftInvestigationPanelHtml(withChangePoint).overview;

        expect(overview).toContain('<strong>Start:</strong> 2025-01-01 00:00');
        expect(overview).toContain('<strong>End:</strong> 2025-01-02 00:00');
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
