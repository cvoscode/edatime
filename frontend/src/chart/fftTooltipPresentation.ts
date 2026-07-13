import { formatCyclesPerDay, formatFrequencyInUnit, type FrequencyUnit, useCyclesPerDayFrequencyAxis } from '../utils/spectralPresets.js';
import { tooltipRow, tooltipWrap } from './chartInteractions.js';

export function formatFftTooltip(
    params: unknown,
    options: { xMax: number; unit: FrequencyUnit; scaleMode: string; scaleLabel: string },
): string {
    const list = Array.isArray(params) ? params : [params as any];
    if (!list.length) return '';
    const x = Number((list[0] as any)?.value?.[0]);
    const freqLabel = Number.isFinite(x)
        ? (useCyclesPerDayFrequencyAxis(options.xMax) ? formatCyclesPerDay(x, 2) : formatFrequencyInUnit(x, options.unit))
        : '';
    const rows = list.map((point: any) => {
        const name = String(point?.seriesName ?? '');
        const y = Number(point?.value?.[1]);
        const index = point?.dataIndex;
        const series = point?.series as any;
        const preLog = series?._preLog as number[] | undefined;
        const raw = series?._raw as number[] | undefined;
        const lines = [tooltipRow(name, Number.isFinite(y) ? y.toFixed(4) : '')];
        if (preLog && Number.isFinite(preLog[index]) && options.scaleMode !== 'none') lines.push(tooltipRow(' pre-scale', preLog[index].toFixed(4)));
        if (raw && Number.isFinite(Number(raw[index]))) lines.push(tooltipRow(' raw', Number(raw[index]).toExponential(3)));
        return lines.join('');
    }).join('');
    return freqLabel ? tooltipWrap(`${freqLabel}<br>${options.scaleLabel}`, rows) : rows;
}
