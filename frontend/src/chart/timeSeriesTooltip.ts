import { formatTwoDecimals } from '../formatUtils.js';
import { escapeHtml } from '../utils/dom.js';
import { formatTimeTooltip } from './ticks.js';
import { baseSeriesName } from './colorScale.js';

interface TooltipEntry {
    seriesName?: string;
    value?: [number, number];
}

export function formatTimeSeriesTooltip(
    params: unknown,
    domain: { min: number; max: number },
): string {
    const rawList: unknown[] = Array.isArray(params) ? params : [params];
    const seen = new Set<string>();
    const entries = rawList.filter((value): value is TooltipEntry => {
        const entry = value as TooltipEntry;
        const base = baseSeriesName(entry?.seriesName ?? '');
        if (!base || seen.has(base)) return false;
        seen.add(base);
        return true;
    });
    if (entries.length === 0) return '';

    const first = entries[0];
    const x = Number(first.value?.[0]);
    const spanMs = Number.isFinite(domain.min) && Number.isFinite(domain.max)
        ? Math.max(1, domain.max - domain.min) : 86_400_000;
    const header = Number.isFinite(x) ? formatTimeTooltip(x, spanMs) : '';
    const rows = entries.map((entry) => {
        const name = escapeHtml(baseSeriesName(entry.seriesName ?? 'series') || 'series');
        const value = escapeHtml(formatTwoDecimals(entry.value?.[1] ?? NaN));
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${value}</span></div>`;
    }).join('');
    return header ? `<div style="opacity:0.8;margin-bottom:6px;">${escapeHtml(header)}</div>${rows}` : rows;
}
