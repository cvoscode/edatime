import type { HeatmapPageDeps } from '../../pages/heatmapPage.js';
import { initHeatmapPage } from '../../pages/heatmapPage.js';

export interface HeatmapEntrypointDeps {
    initHeatmapPage: (deps: HeatmapPageDeps) => Promise<void>;
    deps: HeatmapPageDeps;
}

export function createHeatmapEntrypoint(deps: HeatmapEntrypointDeps) {
    return {
        init: () => deps.initHeatmapPage(deps.deps),
    };
}