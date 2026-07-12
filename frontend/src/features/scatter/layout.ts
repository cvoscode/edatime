export interface ScatterPlotGrid {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export const SCATTER_PLOT_GRID: ScatterPlotGrid = Object.freeze({
    left: 72,
    right: 72,
    top: 24,
    bottom: 50,
});

export const SCATTER_MARGINAL_X_HEIGHT = 64;

export function scaleScatterPlotGrid(scale: number): ScatterPlotGrid {
    return {
        left: SCATTER_PLOT_GRID.left * scale,
        right: SCATTER_PLOT_GRID.right * scale,
        top: SCATTER_PLOT_GRID.top * scale,
        bottom: SCATTER_PLOT_GRID.bottom * scale,
    };
}

export function getScatterPlotMetrics(width: number, height: number, grid: ScatterPlotGrid = SCATTER_PLOT_GRID) {
    const plotLeft = grid.left;
    const plotRight = Math.max(plotLeft + 1, width - grid.right);
    const plotTop = grid.top;
    const plotBottom = Math.max(plotTop + 1, height - grid.bottom);

    return {
        width,
        height,
        grid: { ...grid },
        plotLeft,
        plotRight,
        plotTop,
        plotBottom,
        plotWidth: Math.max(1, plotRight - plotLeft),
        plotHeight: Math.max(1, plotBottom - plotTop),
    };
}

export function getScatterMarginalXMetrics(width: number) {
    const plotLeft = SCATTER_PLOT_GRID.left;
    const plotRight = Math.max(plotLeft + 1, width - SCATTER_PLOT_GRID.right);

    return {
        plotLeft,
        plotRight,
        plotWidth: Math.max(1, plotRight - plotLeft),
    };
}

export function getScatterMarginalYMetrics(height: number) {
    const plotTop = SCATTER_PLOT_GRID.top;
    const plotBottom = Math.max(plotTop + 1, height - SCATTER_PLOT_GRID.bottom);

    return {
        plotTop,
        plotBottom,
        plotHeight: Math.max(1, plotBottom - plotTop),
    };
}
