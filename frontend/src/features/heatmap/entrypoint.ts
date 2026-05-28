import { initHeatmapPage } from '../../pages/heatmapPage.js';

export interface HeatmapEntrypointDeps {
    showPage: (pageName: string) => void;
}

export function createHeatmapEntrypoint(deps: HeatmapEntrypointDeps) {
    return {
        init: () => initHeatmapPage(deps),
    };
}