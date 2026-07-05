import type { GridLayout } from './chartInteractions.js';

export const DEFAULT_CHART_GRID: GridLayout = {
    left: 84,
    right: 30,
    top: 24,
    bottom: 36,
};

interface ComputeChartGridInput {
    yTickLabels: string[];
    yAxisLabel: string;
    scale?: number;
}

export function computeChartGrid(input: ComputeChartGridInput): GridLayout {
    const scale = Number.isFinite(input.scale) && Number(input.scale) > 0 ? Number(input.scale) : 1;
    const fontPx = Math.max(10, Math.round(12 * scale));
    const labels = Array.isArray(input.yTickLabels) ? input.yTickLabels : [];
    const widestLabelChars = labels.reduce((max, label) => Math.max(max, String(label ?? '').trim().length), 0);
    const labelWidth = widestLabelChars * fontPx * 0.58;
    const yAxisAllowance = String(input.yAxisLabel ?? '').trim() ? (fontPx + (18 * scale)) : (8 * scale);
    const left = Math.max(
        DEFAULT_CHART_GRID.left * scale,
        Math.ceil(labelWidth + yAxisAllowance + (22 * scale)),
    );
    return {
        left,
        right: Math.round(DEFAULT_CHART_GRID.right * scale),
        top: Math.round(DEFAULT_CHART_GRID.top * scale),
        bottom: Math.round(DEFAULT_CHART_GRID.bottom * scale),
    };
}

export function scaleGridLayout(grid: GridLayout, scale: number): GridLayout {
    const nextScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return {
        left: grid.left * nextScale,
        right: grid.right * nextScale,
        top: grid.top * nextScale,
        bottom: grid.bottom * nextScale,
    };
}
