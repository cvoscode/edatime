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
    const shellWidth = Math.max(containerWidth, 480);
    const usableWidth = Math.max(labelWidth + minCell * columnCount + 8, shellWidth - 56);
    const fitCell = Math.floor((usableWidth - labelWidth - 2 * (columnCount - 1)) / Math.max(1, columnCount));
    const responsiveCell = fitToScreen
        ? Math.max(minCell, fitCell)
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
