import { describe, expect, it } from 'vitest';
import { buildDriftInvestigationRequest, normalizeDriftThreshold } from './requestPayload.js';

describe('drift investigation request payload', () => {
    it('normalizes finite thresholds and builds the versioned investigation request', () => {
        const payload = buildDriftInvestigationRequest({
            columns: ['temperature'],
            window: '',
            referenceStart: '2025-01-01T00:00',
            referenceEnd: '2025-01-02T00:00',
            segmentBy: 'site',
            ksPvalueThreshold: '0.02',
            esPvalueThreshold: 'invalid',
            psiMinorThreshold: '0.1',
            psiMajorThreshold: '0.2',
            wassersteinStdMultiplier: '0.3',
        });

        expect(payload).toMatchObject({
            columns: ['temperature'],
            window: 'daily',
            referenceStart: new Date('2025-01-01T00:00').toISOString(),
            referenceEnd: new Date('2025-01-02T00:00').toISOString(),
            comparisonStart: new Date('2025-01-02T00:00').toISOString(),
            ksPvalueThreshold: 0.02,
            esPvalueThreshold: 0.05,
            segmentBy: 'site',
            includeQuality: true,
        });
        expect(normalizeDriftThreshold('bad', 0.2)).toBe(0.2);
    });

    it('omits an empty segment and uses default thresholds', () => {
        const payload = buildDriftInvestigationRequest({
            columns: ['temperature'], window: 'weekly', referenceStart: '2025-01-01', referenceEnd: '2025-01-02', segmentBy: '',
            ksPvalueThreshold: undefined, esPvalueThreshold: undefined, psiMinorThreshold: undefined, psiMajorThreshold: undefined, wassersteinStdMultiplier: undefined,
        });

        expect(payload).not.toHaveProperty('segmentBy');
        expect(payload).toMatchObject({ window: 'weekly', psiMinorThreshold: 0.1, psiMajorThreshold: 0.2, wassersteinStdMultiplier: 0.1 });
    });
});
