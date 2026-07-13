import { formatTwoDecimals } from '../../formatUtils.js';

export interface ScatterColorbarPresentation {
    visible: boolean;
    name: string;
    minLabel: string;
    maxLabel: string;
    cardinalityLabel: string | null;
}

export function buildScatterColorbarPresentation(options: {
    activeView: string;
    renderMode: string;
    colormap: string;
    colorScale: string;
    selectedColorColumn: string | null;
    colorValues: unknown[] | null;
    colorMin: number | null;
    colorMax: number | null;
    cardinality: { used: number; bucketed: number } | null;
}): ScatterColorbarPresentation {
    const density = options.renderMode === 'density';
    const continuous = !!options.selectedColorColumn
        && Array.isArray(options.colorValues) && options.colorValues.length > 0
        && Number.isFinite(options.colorMin) && Number.isFinite(options.colorMax)
        && options.colorMax! > options.colorMin!;
    const visible = options.activeView === 'plot' && (density || continuous);
    if (!visible) return { visible: false, name: '', minLabel: '', maxLabel: '', cardinalityLabel: null };
    if (density) return { visible: true, name: `Density (${options.colormap})`, minLabel: 'Low', maxLabel: 'High', cardinalityLabel: null };
    const cardinality = options.cardinality;
    return {
        visible: true,
        name: `${options.selectedColorColumn} (${options.colorScale})`,
        minLabel: formatTwoDecimals(options.colorMin!),
        maxLabel: formatTwoDecimals(options.colorMax!),
        cardinalityLabel: cardinality && cardinality.bucketed > 0 ? `${cardinality.used} shown · ${cardinality.bucketed} other` : null,
    };
}
