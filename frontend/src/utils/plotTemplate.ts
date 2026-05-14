import type { ColorScaleName } from './colorScale';

export interface PlotTemplate {
  id: 'light' | 'dark';
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  grid: string;
  gridAlt: string;
  axis: string;
  axisTick: string;
  border: string;
  accent: string;
  danger: string;
  seriesPalette: string[];
}

export type PlotThemeMode = 'auto' | 'light' | 'dark';

export const PLOT_TEMPLATES: Record<'light' | 'dark', PlotTemplate> = {
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

export function getActivePlotTemplate(
  mode: PlotThemeMode,
  uiTheme: 'dark' | 'light' | 'system'
): PlotTemplate {
  if (mode === 'auto') {
    const resolved = uiTheme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : (uiTheme === 'light' ? 'light' : 'dark');
    return PLOT_TEMPLATES[resolved];
  }
  return PLOT_TEMPLATES[mode];
}

export interface ChartGPUThemeConfig {
  backgroundColor: string;
  textColor: string;
  axisLineColor: string;
  axisTickColor: string;
  gridLineColor: string;
  colorPalette: string[];
  fontFamily: string;
  fontSize: number;
}

export function toChartGPUTheme(template: PlotTemplate, seriesPalette: string[]): ChartGPUThemeConfig {
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

export interface EChartsThemeObject {
  darkMode: boolean;
  backgroundColor: string;
  textStyle: { color: string; fontFamily?: string };
  title: {
    textStyle: { color: string };
    subtextStyle: { color: string };
  };
  legend: {
    textStyle: { color: string };
    pageTextStyle: { color: string };
  };
  tooltip: {
    backgroundColor: string;
    borderColor: string;
    textStyle: { color: string };
  };
  axisPointer: {
    lineStyle: { color: string };
    crossStyle: { color: string };
    label: { backgroundColor: string; color: string };
  };
  valueAxis: {
    axisLine: { lineStyle: { color: string } };
    splitLine: { lineStyle: { color: string } };
    axisTick: { lineStyle: { color: string } };
    axisLabel: { color: string };
    splitArea: { areaStyle: { color: string } };
  };
  timeAxis: {
    axisLine: { lineStyle: { color: string } };
    splitLine: { lineStyle: { color: string } };
    axisTick: { lineStyle: { color: string } };
    axisLabel: { color: string };
    splitArea: { areaStyle: { color: string } };
  };
  categoryAxis: {
    axisLine: { lineStyle: { color: string } };
    splitLine: { lineStyle: { color: string } };
    axisTick: { lineStyle: { color: string } };
    axisLabel: { color: string };
    splitArea: { areaStyle: { color: string } };
  };
  color: string[];
}

export function toEChartsTheme(template: PlotTemplate): EChartsThemeObject {
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

export function getPlotTemplateBg(template: PlotTemplate): string {
  return template.background;
}

export function getPlotTemplateText(template: PlotTemplate): string {
  return template.text;
}

export function getPlotTemplateGrid(template: PlotTemplate): string {
  return template.grid;
}

export function getPlotTemplateAccent(template: PlotTemplate): string {
  return template.accent;
}