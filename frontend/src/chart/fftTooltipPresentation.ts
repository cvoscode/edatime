import { formatCyclesPerDay, formatFrequencyInUnit, type FrequencyUnit, useCyclesPerDayFrequencyAxis } from '../utils/spectralPresets.js';
import { tooltipRow, tooltipWrap } from './chartInteractions.js';

/** Fields of an ECharts axis-tooltip item the FFT tooltip reads. */
interface FftTooltipPoint {
    seriesName?: unknown;
    value?: unknown;
    dataIndex?: number;
    series?: { _preLog?: number[]; _raw?: number[] };
}

export function formatFftTooltip(
    params: unknown,
    options: { xMax: number; unit: FrequencyUnit; scaleMode: string; scaleLabel: string },
): string {
    const list = (Array.isArray(params) ? params : [params])
        .filter((point): point is FftTooltipPoint => typeof point === 'object' && point !== null);
    if (!list.length) return '';
    const coordinate = (point: FftTooltipPoint, axis: 0 | 1) => Number(Array.isArray(point.value) ? point.value[axis] : Number.NaN);
    const x = coordinate(list[0]!, 0);
    const freqLabel = Number.isFinite(x)
        ? (useCyclesPerDayFrequencyAxis(options.xMax) ? formatCyclesPerDay(x, 2) : formatFrequencyInUnit(x, options.unit))
        : '';
    const rows = list.map((point) => {
        const name = String(point.seriesName ?? '');
        const y = coordinate(point, 1);
        const index = point.dataIndex ?? -1;
        const preLog = point.series?._preLog?.[index];
        const raw = point.series?._raw?.[index];
        const lines = [tooltipRow(name, Number.isFinite(y) ? y.toFixed(4) : '')];
        if (preLog !== undefined && Number.isFinite(preLog) && options.scaleMode !== 'none') lines.push(tooltipRow(' pre-scale', preLog.toFixed(4)));
        if (raw !== undefined && Number.isFinite(Number(raw))) lines.push(tooltipRow(' raw', Number(raw).toExponential(3)));
        return lines.join('');
    }).join('');
    return freqLabel ? tooltipWrap(`${freqLabel}<br>${options.scaleLabel}`, rows) : rows;
}
