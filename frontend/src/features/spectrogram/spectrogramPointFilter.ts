export type SpectrogramPoint = [number, number, number, number];
export type SpectrogramMode = 'linear' | 'log';
export type SpectrogramValueRange = { min: number; max: number };

export function isSpectrogramColorFilterActive(
    range: SpectrogramValueRange | null,
    bounds: SpectrogramValueRange | null,
): range is SpectrogramValueRange {
    return !!range && !!bounds && !(range.min <= bounds.min && range.max >= bounds.max);
}

export function fillVisibleSpectrogramPoints(
    source: readonly SpectrogramPoint[],
    target: SpectrogramPoint[],
    range: SpectrogramValueRange,
): SpectrogramPoint[] {
    let writeIndex = 0;
    for (const point of source) {
        if (point[2] < range.min || point[2] > range.max) continue;
        target[writeIndex++] = point;
    }
    target.length = writeIndex;
    return target;
}
