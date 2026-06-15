import { describe, expect, it } from 'vitest';

import { resolveOptions } from '../../libs/chartgpu/dist/index.js';

describe('ChartGPU option resolver', () => {
    it('preserves explicit scatter density rawBounds for viewport-scaled binning', () => {
        const viewportBounds = { xMin: 0, xMax: 100, yMin: 0, yMax: 100 };
        const resolved = resolveOptions({
            series: [{
                type: 'scatter',
                name: 'density',
                mode: 'density',
                sampling: 'none',
                rawBounds: viewportBounds,
                data: [[20, 20], [30, 30], [40, 40]],
            }],
        } as any);

        expect((resolved.series[0] as any).rawBounds).toEqual(viewportBounds);
    });
});
