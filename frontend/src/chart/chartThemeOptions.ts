import { CHART_PALETTES, getSetting } from '../utils/settings.js';
import { getChartPalette } from '../utils/theme.js';

export function getChartGpuColorPalette(): string[] {
    const paletteName = String(getSetting('defaultPalette') ?? 'default');
    const colors = CHART_PALETTES[paletteName] ?? CHART_PALETTES.default;
    return Array.isArray(colors) ? [...colors] : [...CHART_PALETTES.default];
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
