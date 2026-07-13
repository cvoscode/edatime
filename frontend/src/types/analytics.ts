/** Analysis result projections that are rendered as chart overlays. */

export interface RollingBandData {
    column: string;
    color?: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}

export interface SpectralFilterPreview {
    column: string;
    ts: number[];
    values: number[];
    filterType: string;
    lowHz?: number;
    highHz?: number;
}
