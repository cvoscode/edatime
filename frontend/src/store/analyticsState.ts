/**
 * analyticsState — rolling bands, anomaly overlays, spectral filter preview.
 *
 * Consumed by app.ts (for overlay wiring) and timeseriesPage.ts (for render).
 */
import type { AnomalyRegionData, SummaryStats } from '../types/api.js';
import type { RollingBandData, SpectralFilterPreview } from '../types/analytics.js';

export type { AnomalyRegionData, SummaryStats } from '../types/api.js';
export type { RollingBandData, SpectralFilterPreview } from '../types/analytics.js';

export type RollingDisplayMode = 'raw' | 'smooth' | 'both';

export interface AnalyticsState {
    rollingEnabled: boolean;
    rollingWindow: number;
    rollingDisplayMode: RollingDisplayMode;
    rollingBands: RollingBandData[] | null;
    anomalyEnabled: boolean;
    anomalyGlobalEnabled: boolean;
    anomalyMethod: string;
    anomalyThreshold: number;
    anomalyRegions: AnomalyRegionData[] | null;
    anomalySummaryStats: SummaryStats | null;
    spectralFilterPreview: SpectralFilterPreview | null;
}

export const analyticsState: AnalyticsState = {
    rollingEnabled: false,
    rollingWindow: 50,
    rollingDisplayMode: 'both',
    rollingBands: null,
    anomalyEnabled: false,
    anomalyGlobalEnabled: true,
    anomalyMethod: 'zscore',
    anomalyThreshold: 3.0,
    anomalyRegions: null,
    anomalySummaryStats: null,
    spectralFilterPreview: null,
};

/* ── Mutations ──────────────────────────────────────────── */

export function setRollingEnabled(v: boolean): void {
    const previous = analyticsState.rollingEnabled;
    analyticsState.rollingEnabled = v;
    emitStoreEvent('analytics:rollingEnabled', { previous, next: v });
}

export function setRollingWindow(n: number): void {
    const previous = analyticsState.rollingWindow;
    analyticsState.rollingWindow = n;
    emitStoreEvent('analytics:rollingWindow', { previous, next: n });
}

export function setRollingDisplayMode(mode: RollingDisplayMode): void {
    const previous = analyticsState.rollingDisplayMode;
    analyticsState.rollingDisplayMode = mode;
    emitStoreEvent('analytics:rollingDisplayMode', { previous, next: mode });
}

export function setRollingBands(bands: RollingBandData[] | null): void {
    const previous = analyticsState.rollingBands;
    analyticsState.rollingBands = bands ? bands.map((band) => ({ ...band })) : null;
    emitStoreEvent('analytics:rollingBands', { previous, next: analyticsState.rollingBands });
}

export function setAnomalyEnabled(v: boolean): void {
    const previous = analyticsState.anomalyEnabled;
    analyticsState.anomalyEnabled = v;
    emitStoreEvent('analytics:anomalyEnabled', { previous, next: v });
}

export function setAnomalyGlobalEnabled(v: boolean): void {
    const previous = analyticsState.anomalyGlobalEnabled;
    analyticsState.anomalyGlobalEnabled = v;
    emitStoreEvent('analytics:anomalyGlobalEnabled', { previous, next: v });
}

export function setAnomalyMethod(m: string): void {
    const previous = analyticsState.anomalyMethod;
    analyticsState.anomalyMethod = m;
    emitStoreEvent('analytics:anomalyMethod', { previous, next: m });
}

export function setAnomalyThreshold(t: number): void {
    const previous = analyticsState.anomalyThreshold;
    analyticsState.anomalyThreshold = t;
    emitStoreEvent('analytics:anomalyThreshold', { previous, next: t });
}

export function setAnomalyRegions(regions: AnomalyRegionData[] | null): void {
    const previous = analyticsState.anomalyRegions;
    analyticsState.anomalyRegions = regions ? regions.map((region) => ({ ...region })) : null;
    emitStoreEvent('analytics:anomalyRegions', { previous, next: analyticsState.anomalyRegions });
}

export function setAnomalySummaryStats(stats: SummaryStats | null): void {
    const previous = analyticsState.anomalySummaryStats;
    analyticsState.anomalySummaryStats = stats ? { ...stats } : null;
    emitStoreEvent('analytics:anomalySummaryStats', { previous, next: analyticsState.anomalySummaryStats });
}

export function setSpectralFilterPreview(preview: SpectralFilterPreview | null): void {
    const previous = analyticsState.spectralFilterPreview;
    analyticsState.spectralFilterPreview = preview ? { ...preview } : null;
    emitStoreEvent('analytics:spectralFilterPreview', { previous, next: analyticsState.spectralFilterPreview });
}
import { emitStoreEvent } from './events.js';
