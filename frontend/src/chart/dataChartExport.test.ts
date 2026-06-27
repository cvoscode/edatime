import { describe, expect, it, vi } from 'vitest';

import { exportDataChartSVG } from './dataChartExport.js';

describe('dataChartExport', () => {
    it('wraps the baked chart PNG in an SVG download', async () => {
        const toDataURL = vi.fn(() => 'data:image/png;base64,AAAA');
        const canvas = { width: 640, height: 320, toDataURL } as unknown as HTMLCanvasElement;
        const getCanvas = vi.fn().mockResolvedValue(canvas);
        const downloadBlob = vi.fn();

        await exportDataChartSVG({
            getCanvas,
            downloadBlob,
            filename: 'chart.svg',
        });

        expect(getCanvas).toHaveBeenCalledWith(true);
        expect(toDataURL).toHaveBeenCalledWith('image/png');
        expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
});
