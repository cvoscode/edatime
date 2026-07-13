import type { GridLayout } from './chartInteractions.js';

export interface ChartCoordinateMapInput {
    clientX: number;
    clientY: number;
    rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
    grid: GridLayout;
    xRange: { min: number; max: number } | null;
    yRange: { min: number; max: number } | null;
}

export function mapCssPointToChartData(input: ChartCoordinateMapInput): { x: number; y: number } | null {
    const { xRange, yRange } = input;
    if (!xRange || !yRange || !Number.isFinite(xRange.min) || !Number.isFinite(xRange.max)
        || !Number.isFinite(yRange.min) || !Number.isFinite(yRange.max)
        || xRange.max <= xRange.min || yRange.max <= yRange.min) return null;
    const localX = input.clientX - input.rect.left;
    const localY = input.clientY - input.rect.top;
    const plotRight = Math.max(input.grid.left + 1, input.rect.width - input.grid.right);
    const plotBottom = Math.max(input.grid.top + 1, input.rect.height - input.grid.bottom);
    if (localX < input.grid.left || localX > plotRight || localY < input.grid.top || localY > plotBottom) return null;
    const xNorm = (localX - input.grid.left) / Math.max(1, plotRight - input.grid.left);
    const yNorm = (localY - input.grid.top) / Math.max(1, plotBottom - input.grid.top);
    return {
        x: xRange.min + xNorm * (xRange.max - xRange.min),
        y: yRange.max - yNorm * (yRange.max - yRange.min),
    };
}
