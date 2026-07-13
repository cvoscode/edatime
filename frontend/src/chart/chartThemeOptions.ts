import { getActiveSeriesPalette } from '../utils/seriesColors.js';
import { getChartPalette } from '../utils/theme.js';

export function getChartGpuColorPalette(): string[] {
    return [...getActiveSeriesPalette()];
}

export function buildChartGpuTheme() {
    const palette = getChartPalette();
    return {
        backgroundColor: palette.background,
        textColor: palette.text,
        axisLineColor: palette.borderHi,
        axisTickColor: palette.textDim,
        gridLineColor: palette.border,
        colorPalette: getChartGpuColorPalette(),
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
    };
}

export function withChartGpuTheme<T extends Record<string, unknown>>(options: T): T {
    return { ...options, theme: buildChartGpuTheme(), palette: getChartGpuColorPalette() };
}
