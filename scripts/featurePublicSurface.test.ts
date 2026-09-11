import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('feature public composition surfaces', () => {
    it('loads every analysis page through its feature index', () => {
        const pageModules = readRepoFile('frontend/src/app/pageModules.ts');

        for (const feature of ['fft', 'heatmap', 'spectrogram', 'causal', 'drift']) {
            expect(pageModules).toContain(`../features/${feature}/index.js`);
            expect(pageModules).not.toContain(`../features/${feature}/page.js`);
        }
        expect(pageModules).toContain('../features/heatmap/pairPlot/index.js');
        expect(pageModules).not.toContain('../features/scatter/index.js');
    });

    it('keeps app composition on the Timeseries public surface', () => {
        const app = readRepoFile('frontend/src/app.ts');

        expect(app).toContain("from './features/timeseries/index.js'");
        expect(app).not.toContain("from './features/timeseries/module.js'");
        expect(app).not.toContain("from './features/timeseries/columnSelection.js'");
    });
});
