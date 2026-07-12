const MIN_INTERACTIVE_SCATTER_POINTS = 25_000;
const MAX_INTERACTIVE_SCATTER_POINTS = 200_000;
const POINTS_PER_PIXEL = 0.25;

export function computeInteractiveScatterLimit(
    container: HTMLElement | null,
    options: {
        devicePixelRatio?: number;
        minPoints?: number;
        maxPoints?: number;
    } = {},
): number {
    const devicePixelRatio = Math.max(1, options.devicePixelRatio ?? window.devicePixelRatio ?? 1);
    const minPoints = Math.max(1, options.minPoints ?? MIN_INTERACTIVE_SCATTER_POINTS);
    const maxPoints = Math.max(minPoints, options.maxPoints ?? MAX_INTERACTIVE_SCATTER_POINTS);

    const rect = container?.getBoundingClientRect?.();
    const width = Math.max(0, Number(rect?.width ?? 0));
    const height = Math.max(0, Number(rect?.height ?? 0));
    if (!(width > 0) || !(height > 0)) return minPoints;

    const derived = Math.round(width * height * devicePixelRatio * POINTS_PER_PIXEL);
    return Math.max(minPoints, Math.min(maxPoints, derived));
}
