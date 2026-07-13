import type { AnnotationConfig, SeriesConfig } from '../../libs/chartgpu/dist/index.js';
import type { FilteredDataObject } from '../types/chart.js';
import { getSeriesColor } from '../utils/seriesColors.js';
import { analyzeColorValues, buildColorizedSeries, type ColorScaleInfo } from './colorScale.js';

export interface TimeSeriesDataModel {
    series: SeriesConfig[];
    annotations: AnnotationConfig[];
    displayYValues: number[];
    dataYMin: number | null;
    dataYMax: number | null;
    xDomainMin: number | null;
    xDomainMax: number | null;
    colorScaleInfo: ColorScaleInfo | null;
    hasColorCandidates: boolean;
}

export interface TimeSeriesDataModelInput {
    data: FilteredDataObject;
    columns: readonly string[];
    visibilityByName: ReadonlyMap<string, boolean>;
    selectedColorColumn: string | null;
    numericColumns: readonly string[];
    showMarkers: boolean;
}

interface ColorCandidate {
    column: string;
    visible: boolean;
    points: [number, number][];
    colorValues: unknown[];
}

export function buildTimeSeriesDataModel(input: TimeSeriesDataModelInput): TimeSeriesDataModel {
    const { data, columns, visibilityByName, selectedColorColumn, numericColumns, showMarkers } = input;
    const displayYValues: number[] = [];
    const annotations: AnnotationConfig[] = [];
    const baseSeries: SeriesConfig[] = [];
    const colorCandidates: ColorCandidate[] = [];
    let dataYMin = Number.POSITIVE_INFINITY;
    let dataYMax = Number.NEGATIVE_INFINITY;
    let xDomainMin = Number.POSITIVE_INFINITY;
    let xDomainMax = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < columns.length; index++) {
        const column = columns[index];
        const normalized = String(column || '').toLowerCase();
        if (normalized === 'ts' || normalized === 'timestamp' || normalized === 'time') continue;
        if (!data.values?.[column] && !data.series?.[column]) continue;

        const seriesData = data.series?.[column];
        const yValues = seriesData?.y ?? data.values?.[column];
        const xValues = seriesData?.x ?? data.ts;
        const points: [number, number][] = [];
        const count = Math.min(xValues?.length ?? 0, yValues?.length ?? 0);
        for (let pointIndex = 0; pointIndex < count; pointIndex++) {
            const x = Number(xValues![pointIndex]);
            const y = Number(yValues![pointIndex]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            points.push([x, y]);
            displayYValues.push(y);
            xDomainMin = Math.min(xDomainMin, x);
            xDomainMax = Math.max(xDomainMax, x);
            dataYMin = Math.min(dataYMin, y);
            dataYMax = Math.max(dataYMax, y);
        }

        const visible = visibilityByName.get(column) !== false;
        const colorValues = Array.isArray(data.colorByColumn?.[column]) ? data.colorByColumn[column] : data.color;
        const wantsColorBy = !!selectedColorColumn && Array.isArray(colorValues) && colorValues.length === points.length;
        if (wantsColorBy) {
            colorCandidates.push({ column, visible, points, colorValues });
            continue;
        }

        const numericIndex = numericColumns.indexOf(column);
        const color = getSeriesColor(column, numericIndex >= 0 ? numericIndex : index);
        baseSeries.push({ type: 'line', name: column, color, visible, data: points });
        if (showMarkers && visible) {
            for (const [x, y] of points) {
                annotations.push({ type: 'point', x, y, layer: 'aboveSeries', marker: { symbol: 'circle', size: 5, style: { color } } });
            }
        }
    }

    const colorScaleInfo = selectedColorColumn
        ? analyzeColorValues(colorCandidates.flatMap((candidate) => candidate.colorValues))
        : null;
    const decoratedSeries: SeriesConfig[] = [];
    if (colorScaleInfo) {
        for (const candidate of colorCandidates) {
            const result = buildColorizedSeries(
                candidate.column, candidate.points, candidate.colorValues, colorScaleInfo, candidate.visible, showMarkers,
            );
            decoratedSeries.push(...result.series as SeriesConfig[]);
            annotations.push(...result.annotations as AnnotationConfig[]);
        }
    }

    return {
        series: [...baseSeries, ...decoratedSeries],
        annotations,
        displayYValues,
        dataYMin: Number.isFinite(dataYMin) ? dataYMin : null,
        dataYMax: Number.isFinite(dataYMax) ? dataYMax : null,
        xDomainMin: Number.isFinite(xDomainMin) ? xDomainMin : null,
        xDomainMax: Number.isFinite(xDomainMax) ? xDomainMax : null,
        colorScaleInfo,
        hasColorCandidates: colorCandidates.length > 0,
    };
}
