export interface ZoomPercentRange {
    start: number;
    end: number;
}

export function computeZoomPercentRange(
    domainMin: number,
    domainMax: number,
    viewMin: number | null,
    viewMax: number | null,
): ZoomPercentRange {
    if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax) || domainMax <= domainMin) {
        return { start: 0, end: 100 };
    }
    if (!Number.isFinite(viewMin) || !Number.isFinite(viewMax) || viewMax! <= viewMin!) {
        return { start: 0, end: 100 };
    }
    const span = domainMax - domainMin;
    const min = Math.min(domainMax, Math.max(domainMin, viewMin!));
    const max = Math.min(domainMax, Math.max(domainMin, viewMax!));
    if (max <= min) return { start: 0, end: 100 };
    return {
        start: Math.max(0, Math.min(100, ((min - domainMin) / span) * 100)),
        end: Math.max(0, Math.min(100, ((max - domainMin) / span) * 100)),
    };
}
