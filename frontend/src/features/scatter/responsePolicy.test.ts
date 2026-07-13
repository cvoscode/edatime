import { describe, expect, it } from 'vitest';

import { applyScatterPointsResponse, type ScatterResponseState } from './responsePolicy.js';

function state(): ScatterResponseState {
    return {
        totalPoints: 0,
        allPoints: [],
        allColorValues: [99],
        allColorLabels: ['stale'],
        colorColumn: 'stale',
        colorCardinality: { requested: 1, used: 1, bucketed: 0 },
    };
}

describe('applyScatterPointsResponse', () => {
    it('maps all render-relevant response fields into Scatter state', () => {
        const target = state();
        applyScatterPointsResponse(target, {
            points: [[1, 2]],
            total_points: 10,
            color_values: [0.25],
            color_labels: ['low'],
            color: 'temperature',
            color_cardinality: { requested: 12, used: 8, bucketed: 4 },
        } as any);

        expect(target).toEqual({
            totalPoints: 10,
            allPoints: [[1, 2]],
            allColorValues: [0.25],
            allColorLabels: ['low'],
            colorColumn: 'temperature',
            colorCardinality: { requested: 12, used: 8, bucketed: 4 },
        });
    });

    it('clears optional color state and derives total points when omitted', () => {
        const target = state();
        applyScatterPointsResponse(target, { points: [[1, 2], [3, 4]] } as any);

        expect(target).toEqual({
            totalPoints: 2,
            allPoints: [[1, 2], [3, 4]],
            allColorValues: null,
            allColorLabels: null,
            colorColumn: '',
            colorCardinality: null,
        });
    });
});
