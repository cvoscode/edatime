import { formatTwoDecimals } from '../../formatUtils.js';
import { escapeHtml, formatValueForColumn } from './helpers.js';

export function buildScatterTooltipHtml(options: {
    xColumn: string | null;
    yColumn: string | null;
    colorColumn: string | null;
    point: unknown;
    seriesName: unknown;
    dataIndex: unknown;
    xSpan: number;
    ySpan: number;
    columnTypes: Map<string, string>;
    colorLabels: unknown[] | null;
    colorValues: unknown[] | null;
}): string {
    const point = Array.isArray(options.point) ? options.point : [];
    const x = Number(point[0]);
    const y = Number(point[1]);
    const xColumn = options.xColumn || 'X';
    const yColumn = options.yColumn || 'Y';
    const parts = [
        `<div><span style="opacity:0.85;">${escapeHtml(xColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(xColumn, x, Math.max(1, options.xSpan), options.columnTypes))}</span></div>`,
        `<div><span style="opacity:0.85;">${escapeHtml(yColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(yColumn, y, Math.max(1, options.ySpan), options.columnTypes))}</span></div>`,
    ];
    if (options.colorColumn && Array.isArray(options.colorLabels) && options.seriesName) {
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(options.colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(options.seriesName))}</span></div>`);
    } else if (options.colorColumn && Array.isArray(options.colorValues)) {
        const value = Number(options.colorValues[Number(options.dataIndex)]);
        if (Number.isFinite(value)) parts.push(`<div><span style="opacity:0.85;">${escapeHtml(options.colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(value))}</span></div>`);
    }
    return parts.join('');
}
