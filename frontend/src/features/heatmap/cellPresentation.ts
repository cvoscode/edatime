import { correlationColor, correlationTextColor, correlationToneClass } from './colorScale.js';

export interface HeatmapCellPresentation {
    toneClass: string;
    signedValue: string;
    background: string;
    textColor: string;
    tooltip: string;
    interactive: boolean;
}

export function buildHeatmapCellPresentation(options: {
    value: number | null;
    colorDomainMax: number;
    rowName: string;
    columnName: string;
    interactive: boolean;
}): HeatmapCellPresentation {
    const { value, colorDomainMax, rowName, columnName, interactive } = options;
    const signedValue = value === null || !Number.isFinite(value)
        ? '—'
        : `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(2)}`;
    const preciseValue = value === null || !Number.isFinite(value)
        ? 'unavailable'
        : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(4)}`;
    return {
        toneClass: correlationToneClass(value),
        signedValue,
        background: value === null ? 'transparent' : correlationColor(value, colorDomainMax),
        textColor: correlationTextColor(value, colorDomainMax),
        tooltip: `${rowName} × ${columnName}: ${preciseValue}${interactive ? ' — click for pair details' : ''}`,
        interactive,
    };
}
