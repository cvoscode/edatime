export interface ChartExportViewport {
    cssWidth: number;
    cssHeight: number;
    width: number;
    height: number;
    dpr: number;
}

export interface ChartExportDomains {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export function getChartExportViewport(
    rect: Pick<DOMRect, 'width' | 'height'> | undefined,
    fallbackCanvas: Pick<HTMLCanvasElement, 'width' | 'height'> | null,
    dpr: number,
): ChartExportViewport {
    const cssWidth = Math.max(1, Math.round(rect?.width ?? fallbackCanvas?.width ?? 1));
    const cssHeight = Math.max(1, Math.round(rect?.height ?? fallbackCanvas?.height ?? 1));
    const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    return {
        cssWidth,
        cssHeight,
        width: Math.max(1, Math.round(cssWidth * pixelRatio)),
        height: Math.max(1, Math.round(cssHeight * pixelRatio)),
        dpr: pixelRatio,
    };
}

export function getChartExportDomains(
    xRange: { min: number | null; max: number | null },
    fallbackXRange: { min: number | null; max: number | null },
    yRange: { min: number; max: number } | null,
): ChartExportDomains | null {
    const xMin = Number.isFinite(xRange.min) ? xRange.min : fallbackXRange.min;
    const xMax = Number.isFinite(xRange.max) ? xRange.max : fallbackXRange.max;
    const yMin = yRange?.min;
    const yMax = yRange?.max;
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax! <= xMin!) return null;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax! <= yMin!) return null;
    const pad = (yMax! - yMin!) * 0.04;
    return { xMin: xMin!, xMax: xMax!, yMin: yMin! - pad, yMax: yMax! + pad };
}
