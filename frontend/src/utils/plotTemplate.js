"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLOT_TEMPLATES = void 0;
exports.getActivePlotTemplate = getActivePlotTemplate;
exports.toChartGPUTheme = toChartGPUTheme;
exports.toEChartsTheme = toEChartsTheme;
exports.getPlotTemplateBg = getPlotTemplateBg;
exports.getPlotTemplateText = getPlotTemplateText;
exports.getPlotTemplateGrid = getPlotTemplateGrid;
exports.getPlotTemplateAccent = getPlotTemplateAccent;
exports.PLOT_TEMPLATES = {
    dark: {
        id: 'dark',
        background: '#0f0f0f',
        surface: '#1a1a1a',
        text: '#e0e0e0',
        textMuted: '#888888',
        grid: '#2a2a2a',
        gridAlt: '#1e1e1e',
        axis: '#666666',
        axisTick: '#444444',
        border: '#2a2a2a',
        accent: '#4a9eff',
        danger: '#ff4a4a',
        seriesPalette: [
            '#00E5FF', '#FF2D95', '#B026FF', '#00F5A0',
            '#FFD300', '#FF6B00', '#4D5BFF', '#FF3D3D',
        ],
    },
    light: {
        id: 'light',
        background: '#FFFFFF',
        surface: '#F8F9FA',
        text: '#1a1a1a',
        textMuted: '#666666',
        grid: '#E0E0E0',
        gridAlt: '#F0F0F0',
        axis: '#888888',
        axisTick: '#BBBBBB',
        border: '#D1D5DB',
        accent: '#2563EB',
        danger: '#DC2626',
        seriesPalette: [
            '#1F77B4', '#FF7F0E', '#2CA02C', '#D62728',
            '#9467BD', '#8C564B', '#E377C2', '#17BECF',
        ],
    },
};
function getActivePlotTemplate(mode, uiTheme) {
    if (mode === 'auto') {
        var resolved = uiTheme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
            : (uiTheme === 'light' ? 'light' : 'dark');
        return exports.PLOT_TEMPLATES[resolved];
    }
    return exports.PLOT_TEMPLATES[mode];
}
function toChartGPUTheme(template, seriesPalette) {
    return {
        backgroundColor: template.background,
        textColor: template.text,
        axisLineColor: template.axis,
        axisTickColor: template.axisTick,
        gridLineColor: template.grid,
        colorPalette: seriesPalette.length > 0 ? seriesPalette : template.seriesPalette,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 12,
    };
}
function toEChartsTheme(template) {
    return {
        darkMode: template.id === 'dark',
        backgroundColor: template.background,
        textStyle: { color: template.text },
        title: {
            textStyle: { color: template.text },
            subtextStyle: { color: template.textMuted },
        },
        legend: {
            textStyle: { color: template.text },
            pageTextStyle: { color: template.textMuted },
        },
        tooltip: {
            backgroundColor: template.surface,
            borderColor: template.border,
            textStyle: { color: template.text },
        },
        axisPointer: {
            lineStyle: { color: template.accent },
            crossStyle: { color: template.accent },
            label: { backgroundColor: template.surface, color: template.text },
        },
        valueAxis: {
            axisLine: { lineStyle: { color: template.axis } },
            splitLine: { lineStyle: { color: template.grid } },
            axisTick: { lineStyle: { color: template.axisTick } },
            axisLabel: { color: template.textMuted },
            splitArea: { areaStyle: { color: template.gridAlt } },
        },
        timeAxis: {
            axisLine: { lineStyle: { color: template.axis } },
            splitLine: { lineStyle: { color: template.grid } },
            axisTick: { lineStyle: { color: template.axisTick } },
            axisLabel: { color: template.textMuted },
            splitArea: { areaStyle: { color: template.gridAlt } },
        },
        categoryAxis: {
            axisLine: { lineStyle: { color: template.axis } },
            splitLine: { lineStyle: { color: template.grid } },
            axisTick: { lineStyle: { color: template.axisTick } },
            axisLabel: { color: template.textMuted },
            splitArea: { areaStyle: { color: template.gridAlt } },
        },
        color: template.seriesPalette,
    };
}
function getPlotTemplateBg(template) {
    return template.background;
}
function getPlotTemplateText(template) {
    return template.text;
}
function getPlotTemplateGrid(template) {
    return template.grid;
}
function getPlotTemplateAccent(template) {
    return template.accent;
}
