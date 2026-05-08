/**
 * analyticsState — rolling bands, anomaly overlays, spectral filter preview.
 *
 * Consumed by app.ts (for overlay wiring) and timeseriesPage.ts (for render).
 */

export interface RollingBandData {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}

export interface AnomalyRegionData {
    column: string;
    method: string;
    start_ms: number;
    end_ms: number;
    score: number;
}

export interface SpectralFilterPreview {
    column: string;
    ts: number[];
    values: number[];
    filterType: string;
    lowHz?: number;
    highHz?: number;
}

export interface AnalyticsState {
    rollingEnabled: boolean;
    rollingWindow: number;
    rollingBands: RollingBandData[] | null;
    anomalyEnabled: boolean;
    anomalyMethod: string;
    anomalyThreshold: number;
    anomalyRegions: AnomalyRegionData[] | null;
    spectralFilterPreview: SpectralFilterPreview | null;
}

export const analyticsState: AnalyticsState = {
    rollingEnabled: false,
    rollingWindow: 50,
    rollingBands: null,
    anomalyEnabled: false,
    anomalyMethod: 'zscore',
    anomalyThreshold: 3.0,
    anomalyRegions: null,
    spectralFilterPreview: null,
};

/* ── Mutations ──────────────────────────────────────────── */

export function setRollingEnabled(v: boolean): void {
    analyticsState.rollingEnabled = v;
}

export function setRollingWindow(n: number): void {
    analyticsState.rollingWindow = n;
}

export function setRollingBands(bands: RollingBandData[] | null): void {
    analyticsState.rollingBands = bands;
}

export function setAnomalyEnabled(v: boolean): void {
    analyticsState.anomalyEnabled = v;
}

export function setAnomalyMethod(m: string): void {
    analyticsState.anomalyMethod = m;
}

export function setAnomalyThreshold(t: number): void {
    analyticsState.anomalyThreshold = t;
}

export function setAnomalyRegions(regions: AnomalyRegionData[] | null): void {
    analyticsState.anomalyRegions = regions;
}

export function setSpectralFilterPreview(preview: SpectralFilterPreview | null): void {
    analyticsState.spectralFilterPreview = preview;
}