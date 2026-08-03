import type { ScatterPointsResponse } from '../../types/scatter.js';

export interface ScatterResponseState {
    totalPoints: number;
    allPoints: [number, number][];
    allColorValues: number[] | null;
    allColorLabels: unknown[] | null;
    colorColumn: string;
    colorCardinality: { requested: number; used: number; bucketed: number } | null;
}

/** Apply the transport response as the canonical, pre-render Scatter state. */
export function applyScatterPointsResponse(
    state: ScatterResponseState,
    response: ScatterPointsResponse,
): void {
    const points: [number, number][] = Array.isArray(response.points) ? response.points : [];
    const reportedTotal = Number(response.total_points);
    // Transport metadata must never make the UI claim an empty result while
    // the response contains renderable rows. `total_points` describes the
    // pre-sampling population, so it is necessarily at least points.length.
    state.totalPoints = Number.isFinite(reportedTotal)
        ? Math.max(0, reportedTotal, points.length)
        : points.length;
    state.allPoints = points;
    state.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
    state.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
    state.colorColumn = response.color || '';
    state.colorCardinality = response.color_cardinality ?? null;
}
