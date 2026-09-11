import { createAccessibilitySummaryTable, type SeriesSummary } from './accessibilityTable.js';
import type { FftDataModel } from './fftDataModel.js';
import type { SpectralScaleOptions } from '../utils/spectralScaling.js';

export function createFftAccessibilitySummary(
    model: Pick<FftDataModel, 'series'>,
    mode: string,
    logScale: boolean,
    scaleOptions: SpectralScaleOptions,
): HTMLTableElement | null {
    const summaries: SeriesSummary[] = model.series.flatMap((series) => {
        const values = series.data.map((point) => point[1]).filter(Number.isFinite);
        if (values.length === 0) return [];
        let total = 0;
        let min = values[0];
        let max = values[0];
        for (const value of values) {
            total += value;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        const mean = total / values.length;
        const sorted = [...values].sort((left, right) => left - right);
        const midpoint = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
            ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2
            : sorted[midpoint]!;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        return [{
            name: series.name,
            count: values.length,
            min,
            max,
            mean,
            std: Math.sqrt(variance),
            median,
        }];
    });
    if (summaries.length === 0) return null;

    const table = createAccessibilitySummaryTable('FFT chart', summaries);
    const quantity = mode === 'psd' ? 'PSD' : 'magnitude';
    const scale = scaleOptions.mode === 'none' ? '' : `, ${scaleOptions.mode} normalized`;
    const caption = table.querySelector('caption');
    if (caption) caption.textContent = `Statistical summary for FFT chart (${logScale ? 'log10 ' : ''}${quantity}${scale})`;
    table.dataset.chartSummary = 'fft';
    return table;
}
