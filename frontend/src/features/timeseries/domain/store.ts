/**
 * Timeseries domain - viewport, series selection, filters, drawings, chart metadata.
 *
 * Single source of truth for timeseries-specific state.
 * Viewport is NOT duplicated here - it lives in chartController.
 */
import { createStore } from 'solid-js/store';
import type { ChartViewport, RollingBandData, AnomalyRegionData, Drawing } from '@/types/domains';

// ---- Types ----

export type DrawMode = 'pan' | 'zoom' | 'select' | 'arrow' | 'box';

export interface TimeseriesFilters {
    [column: string]: { min: number; max: number };
}

export interface TimeseriesState {
    viewport: ChartViewport;
    initialView: ChartViewport | null;
    zoomHistory: { zoomStack: ChartViewport[]; currentIndex: number };

    selectedColumns: string[];
    hiddenColumns: string[];
    seriesVisibility: Record<string, boolean>;
    colors: Record<string, string>;
    colorColumn: string | null;

    filters: TimeseriesFilters;

    drawings: Drawing[];
    drawMode: DrawMode;

    rollingBands: RollingBandData[];
    anomalyRegions: AnomalyRegionData[];

    chartTitle: string;
    xAxisLabel: string;
    yAxisLabel: string;

    isLoading: boolean;
    isDownsampled: boolean;
    lastDataYMin: number | null;
    lastDataYMax: number | null;
}

// ---- Default state ----

const DEFAULT_VIEWPORT: ChartViewport = {
    xMin: 0,
    xMax: 100,
    yMin: 0,
    yMax: 1,
};

const initialState: TimeseriesState = {
    viewport: { ...DEFAULT_VIEWPORT },
    initialView: null,
    zoomHistory: { zoomStack: [{ ...DEFAULT_VIEWPORT }], currentIndex: 0 },

    selectedColumns: [],
    hiddenColumns: [],
    seriesVisibility: {},
    colors: {},
    colorColumn: null,

    filters: {},

    drawings: [],
    drawMode: 'pan' as DrawMode,

    rollingBands: [],
    anomalyRegions: [],

    chartTitle: '',
    xAxisLabel: '',
    yAxisLabel: '',

    isLoading: false,
    isDownsampled: false,
    lastDataYMin: null,
    lastDataYMax: null,
};

// ---- Store ----

const [state, setState] = createStore<TimeseriesState>(initialState);

// ---- Viewport actions ----

export function setViewport(viewport: ChartViewport) {
    setState('viewport', { ...viewport });
}

export function setInitialView(viewport: ChartViewport) {
    setState('initialView', { ...viewport });
    setState('viewport', { ...viewport });
    setState('zoomHistory', { zoomStack: [{ ...viewport }], currentIndex: 0 });
}

export function pushViewport(viewport: ChartViewport) {
    const stack = [...state.zoomHistory.zoomStack].slice(0, state.zoomHistory.currentIndex + 1);
    stack.push({ ...state.viewport });
    if (stack.length > 5) stack.shift();
    setState('zoomHistory', { zoomStack: stack, currentIndex: stack.length - 1 });
    setState('viewport', { ...viewport });
}

export function stepBackZoom() {
    const { currentIndex, zoomStack } = state.zoomHistory;
    if (currentIndex > 0) {
        setState('zoomHistory', 'currentIndex', currentIndex - 1);
        setState('viewport', { ...zoomStack[currentIndex - 1] });
    }
}

export function resetZoom() {
    if (state.initialView) {
        setState('zoomHistory', { zoomStack: [{ ...state.initialView }], currentIndex: 0 });
        setState('viewport', { ...state.initialView });
    }
}

// ---- Series selection ----

export function setSelectedColumns(cols: string[]) {
    setState('selectedColumns', cols);
}

export function setHiddenColumns(cols: string[]) {
    setState('hiddenColumns', cols);
}

export function toggleColumnVisibility(col: string) {
    setState('seriesVisibility', col, v => v !== false);
}

export function setColumnColor(col: string, color: string) {
    setState('colors', col, color);
}

export function setColorColumn(col: string | null) {
    setState('colorColumn', col);
}

// ---- Filters ----

export function setFilter(col: string, range: { min: number; max: number }) {
    setState('filters', col, range);
}

export function removeFilter(col: string) {
    setState('filters', (f) => {
        const copy = { ...f };
        delete copy[col];
        return copy;
    });
}

export function clearAllFilters() {
    setState('filters', {});
}

// ---- Drawings ----

export function setDrawMode(mode: DrawMode) {
    setState('drawMode', mode);
}

export function addDrawing(drawing: Drawing) {
    setState('drawings', (d) => [...d, drawing]);
}

export function removeDrawing(id: string) {
    setState('drawings', (d) => d.filter(dr => dr.id !== id));
}

export function clearDrawings() {
    setState('drawings', []);
}

// ---- Analytics overlays ----

export function setRollingBands(bands: RollingBandData[]) {
    setState('rollingBands', bands);
}

export function setAnomalyRegions(regions: AnomalyRegionData[]) {
    setState('anomalyRegions', regions);
}

// ---- Chart metadata ----

export function setChartTitle(title: string) {
    setState('chartTitle', title);
}

export function setAxisLabels(x: string, y: string) {
    setState('xAxisLabel', x);
    setState('yAxisLabel', y);
}

// ---- Status ----

export function setLoading(loading: boolean) {
    setState('isLoading', loading);
}

export function setDownsampled(downsampled: boolean) {
    setState('isDownsampled', downsampled);
}

export function setLastDataYRange(min: number, max: number) {
    setState('lastDataYMin', min);
    setState('lastDataYMax', max);
}

// ---- Store accessor ----

export const timeseriesStore = {
    get state() { return state; },
    setViewport,
    setInitialView,
    pushViewport,
    stepBackZoom,
    resetZoom,
    setSelectedColumns,
    setHiddenColumns,
    toggleColumnVisibility,
    setColumnColor,
    setColorColumn,
    setFilter,
    removeFilter,
    clearAllFilters,
    setDrawMode,
    addDrawing,
    removeDrawing,
    clearDrawings,
    setRollingBands,
    setAnomalyRegions,
    setChartTitle,
    setAxisLabels,
    setLoading,
    setDownsampled,
    setLastDataYRange,
};
