import { buildCategoricalColorGroups, normalizeCategoryLabel, paletteForScale, sampleGradient } from './helpers.js';

export interface ScatterSeriesControls {
    x: string | null;
    y: string | null;
    selectedColorColumn: string | null;
    colorScale: string;
}

export interface ScatterColorState {
    colorValues: unknown[] | null;
    allColorValues: unknown[] | null;
    colorLabels: unknown[] | null;
    colorMin: number | null;
    colorMax: number | null;
}

export function buildNormalScatterSeries(
    points: [number, number][],
    controls: ScatterSeriesControls,
    colorState: ScatterColorState,
    defaultColor: string,
): any[] {
    const colorColumn = controls.selectedColorColumn;
    const categoricalGroups = colorColumn ? buildCategoricalColorGroups(colorState.colorLabels) : null;
    if (categoricalGroups) {
        return categoricalGroups.categories.map((label) => {
            const data = points.filter((_, index) => normalizeCategoryLabel(colorState.colorLabels?.[index]) === label);
            return { type: 'scatter', name: label, data, symbolSize: 3, color: categoricalGroups.colorByLabel.get(label) || defaultColor, sampling: 'none' };
        }).filter((series: any) => series.data.length > 0);
    }
    const fallback = () => [{ type: 'scatter', name: `${controls.x || 'x'} vs ${controls.y || 'y'}`, data: points, symbolSize: 3, color: defaultColor, sampling: 'none' }];
    if (!colorColumn || !Array.isArray(colorState.colorValues) || colorState.colorValues.length === 0) return fallback();
    const { colorMin: min, colorMax: max } = colorState;
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max! > min!)) return fallback();
    const bins = 64;
    const grouped: [number, number][][] = Array.from({ length: bins }, () => []);
    const valueCount = Math.min(points.length, colorState.allColorValues?.length ?? points.length);
    const span = max! - min!;
    points.forEach((point, index) => {
        const value = index < valueCount ? Number(colorState.allColorValues?.[index]) : Number.NaN;
        if (!Number.isFinite(value)) return;
        const bin = Math.max(0, Math.min(bins - 1, Math.floor(((value - min!) / span) * bins)));
        grouped[bin]!.push(point);
    });
    const gradient = paletteForScale(controls.colorScale);
    return grouped.flatMap((data, bin) => data.length === 0 ? [] : [{
        type: 'scatter', name: colorColumn, data, symbolSize: 3, color: sampleGradient(gradient, (bin + 0.5) / bins), sampling: 'none',
    }]);
}
