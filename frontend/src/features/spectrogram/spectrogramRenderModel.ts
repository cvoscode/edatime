import type { SpectrogramResult } from '../../services/api/index.js';
import { findDominantFrequencyBand } from './spectrogramAnalysis.js';
import {
    buildSpectrogramGridModel,
    getSpectrogramDisplayBounds,
    getVisibleSpectrogramPoints,
    type SpectrogramGridModel,
} from './spectrogramGridModel.js';
import { buildSpectrogramChartOptions } from './spectrogramChartOptions.js';

/** Caches spectrogram grid buffers and projects them into a chart redraw. */
export function createSpectrogramRenderModel() {
    let cachedGrid: SpectrogramGridModel | null = null;

    return {
        build(input: {
            result: SpectrogramResult;
            logRequested: boolean;
            allowLogScale: boolean;
            scaleLabel: string;
            palette: readonly string[];
            range?: { min: number; max: number } | null;
        }) {
            const logScale = input.logRequested && input.allowLogScale;
            const mode = logScale ? 'log' : 'linear';
            if (!cachedGrid || cachedGrid.result !== input.result) {
                cachedGrid = buildSpectrogramGridModel(input.result);
            }
            const bounds = getSpectrogramDisplayBounds(cachedGrid, mode);
            const points = getVisibleSpectrogramPoints(cachedGrid, mode, input.range ?? null, bounds);
            const chart = buildSpectrogramChartOptions({
                result: input.result,
                points,
                bounds,
                logScale,
                scaleLabel: input.scaleLabel,
                palette: input.palette,
            });
            return {
                ...chart,
                bounds,
                logScale,
                dominantBand: findDominantFrequencyBand(input.result),
            };
        },
    };
}
