/**
 * Scatter domain types — config, state, and filter params for scatter analytics.
 *
 * ScatterConfig and ScatterFilterParams are defined in types/domains.ts.
 * This module defines local-only types and re-exports the shared ones.
 */
import type { ScatterConfig, ScatterFilterParams } from '../../types/domains';

export type { ScatterConfig, ScatterFilterParams } from '../../types/domains';

// ScatterState represents the full scatter state stored in scatterStore.
// Note: scatterStore (stores/scatterStore.ts) owns the actual state and
// scatterDomain (domain/scatter/store.ts) wraps it — this type documents
// the expected shape.
export interface ScatterState {
    config: ScatterConfig;
    view: 'plot' | 'matrix';
    zoomLevel: number;
    matrixColumns: string[];
    isLoading: boolean;
    correlations: Record<string, { pearson: number | null; spearman: number | null }>;
    suggestions: Array<{ column: string; count: number; pearson: number | null; spearman: number | null }>;
    suggestionThreshold: number;
    scatterPoints: [number, number][];
    colorValues: number[] | null;
    colorLabels: (string | null)[] | null;
    colorMin: number | null;
    colorMax: number | null;
    sizeValues: number[] | null;
    sizeMin: number | null;
    sizeMax: number | null;
    totalPoints: number;
    returnedPoints: number;
    renderMode: 'scatter' | 'density';
}

// =============================================================================
// Color scale info returned by useScatterColorScale
// =============================================================================

export interface NumericColorScale {
    isNumeric: true;
    min: number;
    max: number;
}

export interface CategoricalColorScale {
    isNumeric: false;
    categories: string[];
}

export type ColorScaleInfo = NumericColorScale | CategoricalColorScale;