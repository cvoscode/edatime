import type { DatasetMetadata } from '../types.js';

export const ANALYTICS_CHIP_COLORS = ['#7ad151', '#4ac3e8', '#f97316', '#e879f9', '#facc15', '#60a5fa', '#f43f5e'];

export function getNumericColumns(metadata: DatasetMetadata | null): string[] {
    const timeCol = String(metadata?.time_column || '').trim().toLowerCase();
    return ((metadata?.numeric_columns || []) as string[])
        .filter((column: string) => {
            const lower = String(column || '').trim().toLowerCase();
            return lower && lower !== 'ts' && lower !== timeCol;
        });
}

export function getDefaultTimeseriesColumns(metadata: DatasetMetadata | null): string[] {
    return getNumericColumns(metadata).slice(0, 3);
}

export function getAnalyticsChipColor(column: string, fallbackIndex: number, overrides?: Record<string, string>): string {
    return overrides?.[column] || ANALYTICS_CHIP_COLORS[Math.max(0, fallbackIndex) % ANALYTICS_CHIP_COLORS.length];
}