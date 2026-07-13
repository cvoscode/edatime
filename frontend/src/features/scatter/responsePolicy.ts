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
    state.totalPoints = Number(response.total_points ?? points.length);
    state.allPoints = points;
    state.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
    state.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
    state.colorColumn = response.color || '';
    state.colorCardinality = response.color_cardinality ?? null;
}
