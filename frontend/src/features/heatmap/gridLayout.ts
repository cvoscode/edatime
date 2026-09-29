export interface HeatmapGridLayout {
    labelWidth: number;
    responsiveCell: number;
    headerCellSize: number;
    useVerticalHeaders: boolean;
    colTemplate: string;
    rowTemplate: string;
}

export function buildHeatmapGridLayout(options: {
    columnCount: number;
    preferredCellSize: number;
    containerWidth: number;
    fitToScreen: boolean;
}): HeatmapGridLayout {
    const { columnCount, preferredCellSize, containerWidth, fitToScreen } = options;
    const labelWidth = Math.max(84, Math.min(180, Math.round(preferredCellSize * 2.5)));
    const minCell = 24;
    const maxCell = Math.max(minCell, preferredCellSize);
    const maxFittedCell = 180;
    const shellWidth = Math.max(containerWidth, 480);
    // Reserve the 230px legend and 12px shell gap before fitting the matrix.
    // Fit mode is intentionally width-driven: constraining it by the short
    // dimension of a wide viewport makes the plot unreadably small and leaves
    // most of the panel empty. A modest upper bound keeps small matrices from
    // turning into oversized tiles; taller results scroll with the page.
    const legendSlot = 242;
    const usableWidth = Math.max(labelWidth + minCell * columnCount + 8, shellWidth - legendSlot);
    const fitCell = Math.floor((usableWidth - labelWidth - 2 * columnCount) / Math.max(1, columnCount));
    const responsiveCell = fitToScreen
        ? Math.max(minCell, Math.min(maxFittedCell, fitCell))
        : Math.max(minCell, Math.min(maxCell, fitCell));
    const colTemplate = [`${labelWidth}px`, ...Array.from({ length: columnCount }, () => `${responsiveCell}px`)].join(' ');
    return {
        labelWidth,
        responsiveCell,
        headerCellSize: responsiveCell,
        useVerticalHeaders: responsiveCell < 40,
        colTemplate,
        rowTemplate: colTemplate,
    };
}
