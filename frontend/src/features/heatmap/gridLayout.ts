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
    containerHeight?: number;
    fitToScreen: boolean;
}): HeatmapGridLayout {
    const { columnCount, preferredCellSize, containerWidth, containerHeight = 0, fitToScreen } = options;
    const labelWidth = Math.max(84, Math.min(180, Math.round(preferredCellSize * 2.5)));
    const minCell = 24;
    const maxCell = Math.max(minCell, preferredCellSize);
    const shellWidth = Math.max(containerWidth, 480);
    // Leave a fixed inline slot for the color scale and its gap. This keeps
    // the scale directly beside the matrix rather than outside the first
    // visible scroll position when the matrix is fitted to its panel.
    const usableWidth = Math.max(labelWidth + minCell * columnCount + 8, shellWidth - 84);
    const fitCell = Math.floor((usableWidth - labelWidth - 2 * (columnCount - 1)) / Math.max(1, columnCount));
    // The first grid row uses labelWidth (rowTemplate mirrors colTemplate),
    // followed by one cell row per column. Account for that fixed header,
    // the 2 px grid gaps, and the shell's 10 px vertical padding explicitly.
    // Treating all rows as equally sized allows the last rows to escape the
    // viewport whenever width would otherwise produce very large cells.
    const verticalChrome = 20 + labelWidth + 2 * columnCount;
    const fitHeight = containerHeight > 0
        ? Math.floor((containerHeight - verticalChrome) / Math.max(1, columnCount))
        : Number.POSITIVE_INFINITY;
    const responsiveCell = fitToScreen
        ? Math.max(minCell, Math.min(fitCell, fitHeight))
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
