export interface HeatmapEntrypointDeps {
    showPage: (pageName: string) => void;
}

export function createHeatmapEntrypoint(deps: HeatmapEntrypointDeps) {
    return {
        init: async () => {
            const { initHeatmapPage } = await import('../../pages/heatmapPage.js');
            initHeatmapPage(deps);
        },
    };
}
