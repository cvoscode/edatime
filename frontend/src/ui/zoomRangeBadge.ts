import type { ViewSnapshot } from '../types/chart.js';

/** Formats the visible X-range as a share of the dataset's initial view. */
export function formatZoomRangeBadge(
    initialView: ViewSnapshot | null,
    currentStart: number | null,
    currentEnd: number | null,
): string {
    if (!initialView || !Number.isFinite(currentStart) || !Number.isFinite(currentEnd)) return '—';
    const initialRange = Number(initialView.xMax) - Number(initialView.xMin);
    const currentRange = Number(currentEnd) - Number(currentStart);
    if (!Number.isFinite(initialRange) || initialRange <= 0 || !Number.isFinite(currentRange)) return '—';
    return `Viewing ${((currentRange / initialRange) * 100).toFixed(0)}%`;
}
