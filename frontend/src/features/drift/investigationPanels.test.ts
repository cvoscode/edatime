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
    it('renders overview data and legacy context from an investigation response', () => {
        const panels = buildDriftInvestigationPanelHtml(investigation, true);

        expect(panels.overview).toContain('Using /api/drift/stats compatibility mode');
        expect(panels.overview).toContain('temperature');
        expect(panels.overview).toContain('drift-red');
        expect(panels.segments).toContain('No segment breakdown returned.');
        expect(panels.quality).toContain('No quality issues detected.');
        expect(panels.relationships).toContain('No relationship drift detected.');
    });

    it('clears every panel when no investigation is available', () => {
        expect(buildDriftInvestigationPanelHtml(null, false)).toEqual({
            overview: '',
            segments: '',
            quality: '',
            relationships: '',
        });
    });
});
