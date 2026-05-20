/**
 * domain/timeseries/store.ts
 * SolidJS store for timeseries domain state.
 *
 * Mirrors chartStore for viewport/zoom and adds timeseries-specific state
 * (selectedColumns, colorColumn, drawMode, drawings, chart meta, status).
 *
 * NOTE: Viewport/zoom are mirrored FROM chartStore so both stores stay in sync.
 * Components should prefer chartStore for viewport actions to avoid duplication.
 */
import { createStore } from 'solid-js/store';
import { createSignal } from 'solid-js';
import type { TimeseriesState } from './types';
import type { Drawing } from '../../types/domains';
import type { ChartViewport } from '../../types/domains';
import type { RollingBandData, AnomalyRegionData, AdaptiveLineFilter } from '../../types/domains';
import { DEFAULT_VIEWPORT } from './constants';

// =============================================================================
// Initial state
// =============================================================================

const initialState: TimeseriesState = {
  viewport: { ...DEFAULT_VIEWPORT },
  zoomHistory: { zoomStack: [{ ...DEFAULT_VIEWPORT }], currentIndex: 0 },
  initialView: null,

  selectedColumns: [],
  hiddenColumns: [],
  colorColumn: null,
  seriesVisibility: {},
  colors: {},
  filters: {},

  drawMode: 'pan',
  drawings: [],

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

// =============================================================================
// Store
// =============================================================================

const [state, setState] = createStore<TimeseriesState>(initialState);

// =============================================================================
// UI Signals (ephemeral state not persisted in store)
// =============================================================================

export const [drawTool, setDrawTool] = createSignal<'none' | 'zoom' | 'arrow' | 'box'>('none');
export const [drawColor, setDrawColor] = createSignal('#ff0055');
export const [drawWidth, setDrawWidth] = createSignal(2);

export const [showAnalytics, setShowAnalytics] = createSignal(false);
export const [showLabelsDrawer, setShowLabelsDrawer] = createSignal(false);
export const [showExportMore, setShowExportMore] = createSignal(false);
export const [chartEngine, setChartEngine] = createSignal<string>('');

export const [filterModalOpen, setFilterModalOpen] = createSignal(false);
export const [filterModalColumn, setFilterModalColumn] = createSignal<string | null>(null);

export const [showSkeleton, setShowSkeleton] = createSignal(false);

export const [showAdaptivePopup, setShowAdaptivePopup] = createSignal(false);
export const [adaptiveFilterPoints, setAdaptiveFilterPoints] = createSignal<{
  x1: number; y1: number; x2: number; y2: number;
  screenX: number; screenY: number;
} | null>(null);

export const [popupScreenPos, setPopupScreenPos] = createSignal<{ x: number; y: number } | null>(null);

// =============================================================================
// Store actions
// =============================================================================

export const timeseriesStore = {
  get state() { return state; },

  // ---- Viewport (synced with chartStore via syncViewportFromChartStore) ----

  setViewport(viewport: ChartViewport) {
    setState('viewport', { ...viewport });
  },

  setInitialView(viewport: ChartViewport) {
    setState('initialView', { ...viewport });
    setState('viewport', { ...viewport });
    setState('zoomHistory', { zoomStack: [{ ...viewport }], currentIndex: 0 });
  },

  syncFromChartStore(viewport: ChartViewport, zoomHistory: { zoomStack: ChartViewport[]; currentIndex: number }, initialView: ChartViewport | null) {
    setState('viewport', { ...viewport });
    setState('zoomHistory', { ...zoomHistory });
    setState('initialView', initialView ? { ...initialView } : null);
  },

  // ---- Series selection ----

  setSelectedColumns(columns: string[]) {
    setState('selectedColumns', columns);
  },

  setColorColumn(col: string | null) {
    setState('colorColumn', col);
  },

  setHiddenColumns(columns: string[]) {
    setState('hiddenColumns', columns);
  },

  setColumnColor(col: string, color: string) {
    setState('colors', col, color);
  },

  setFilter(col: string, range: { min: number; max: number }) {
    setState('filters', col, range);
  },

  removeFilter(col: string) {
    setState('filters', col, undefined as any);
  },

  toggleSeriesVisibility(col: string) {
    setState('seriesVisibility', col, !state.seriesVisibility[col]);
  },

  // ---- Drawing ----

  setDrawMode(mode: 'pan' | 'zoom' | 'arrow' | 'box') {
    setState('drawMode', mode);
    setDrawTool(mode === 'pan' ? 'none' : mode);
  },

  addDrawing(drawing: Drawing) {
    setState('drawings', (prev) => [...prev, drawing]);
  },

  clearDrawings() {
    setState('drawings', []);
  },

  removeDrawing(id: string) {
    setState('drawings', (prev) => prev.filter(d => d.id !== id));
  },

  // ---- Overlays ----

  setRollingBands(bands: RollingBandData[]) {
    setState('rollingBands', bands);
  },

  setAnomalyRegions(regions: AnomalyRegionData[]) {
    setState('anomalyRegions', regions);
  },

  // ---- Chart meta ----

  setChartTitle(title: string) {
    setState('chartTitle', title);
  },

  setAxisLabels(x: string, y: string) {
    setState('xAxisLabel', x);
    setState('yAxisLabel', y);
  },

  // ---- Status ----

  setLoading(loading: boolean) {
    setState('isLoading', loading);
  },

  setDownsampled(downsampled: boolean) {
    setState('isDownsampled', downsampled);
  },

  setLastDataRange(yMin: number, yMax: number) {
    setState('lastDataYMin', yMin);
    setState('lastDataYMax', yMax);
  },

  // ---- Drawing tool state (signals-based) ----

  getDrawTool() { return drawTool; },
  getDrawColor() { return drawColor; },
  getDrawWidth() { return drawWidth; },

  setDrawToolSignal(tool: 'none' | 'zoom' | 'arrow' | 'box') { setDrawTool(tool); },
  setDrawColorSignal(color: string) { setDrawColor(color); },
  setDrawWidthSignal(width: number) { setDrawWidth(width); },

  // ---- UI signal accessors ----

  getShowAnalytics() { return showAnalytics(); },
  getShowLabelsDrawer() { return showLabelsDrawer(); },
  getShowExportMore() { return showExportMore; },
  getChartEngine() { return chartEngine(); },
  getFilterModalOpen() { return filterModalOpen(); },
  getFilterModalColumn() { return filterModalColumn(); },
  getShowSkeleton() { return showSkeleton(); },
  getShowAdaptivePopup() { return showAdaptivePopup(); },
  getAdaptiveFilterPoints() { return adaptiveFilterPoints(); },
  getPopupScreenPos() { return popupScreenPos(); },

  setShowAnalyticsSignal(v: boolean) { setShowAnalytics(v); },
  setShowLabelsDrawerSignal(v: boolean) { setShowLabelsDrawer(v); },
  setShowExportMoreSignal(v: boolean) { setShowExportMore(v); },
  setChartEngineSignal(name: string) { setChartEngine(name); },
  setFilterModalOpenSignal(v: boolean) { setFilterModalOpen(v); },
  setFilterModalColumnSignal(col: string | null) { setFilterModalColumn(col); },
  setShowSkeletonSignal(v: boolean) { setShowSkeleton(v); },
  setShowAdaptivePopupSignal(v: boolean) { setShowAdaptivePopup(v); },
  setAdaptiveFilterPointsSignal(pts: typeof adaptiveFilterPoints extends () => infer R ? R : never) { setAdaptiveFilterPoints(pts); },
  setPopupScreenPosSignal(pos: { x: number; y: number } | null) { setPopupScreenPos(pos); },
};