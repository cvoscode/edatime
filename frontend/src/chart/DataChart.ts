/**
 * DataChart — ChartGPU WebGPU adapter with drawing overlay,
 * mouse-selection zoom, and PNG / SVG / HTML export.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { DEBUG, dbg } from '../debug.js';
import { escapeHtml, downloadUrl, downloadBlob } from '../utils/dom.js';
import { defaultGpuPowerPreference } from '../utils/platform.js';
import { formatTwoDecimals } from '../formatUtils.js';
import { analyticsState } from '../store/analyticsState.js';
import { datasetState } from '../store/datasetState.js';
import { uiState } from '../store/uiState.js';
import { getSeriesColor } from '../utils/seriesColors.js';
import { buildAdaptiveLineY } from '../services/timeseries/filtering.js';
import { getAnnotationsForPage } from './annotations.js';
import type {
    AdaptiveLineFilter,
    ChartTextOverlays,
    DataObject,
    FilteredDataObject,
    RobustDisplayRangeOptions,
    ViewSnapshot,
} from '../types.js';
import { computeRobustDisplayBounds, normalizeRobustDisplayRange, suggestRobustDisplayRange } from './yRangePolicy.js';
import {
    type ChartGPUOptions,
    type ChartGPUCrosshairMovePayload,
    type SeriesConfig,
    type AnnotationConfig,
} from '../../libs/chartgpu/dist/index.js';

/* ── Typed wrapper for ChartGPUInstance methods we actually use ── */
interface ChartInstanceAPI {
    readonly disposed: boolean;
    readonly options: Readonly<ChartGPUOptions>;
    setOption(options: ChartGPUOptions): void;
    getZoomRange(): { start: number; end: number } | null;
    setZoomRange(start: number, end: number, source?: unknown): void;
    resize(): void;
    dispose(): void;
    on(eventName: 'crosshairMove', callback: (payload: ChartGPUCrosshairMovePayload) => void): void;
    on(eventName: 'click', callback: (payload: import('../../libs/chartgpu/dist/ChartGPU.js').ChartGPUEventPayload) => void): void;
    off(eventName: 'crosshairMove', callback: (payload: ChartGPUCrosshairMovePayload) => void): void;
    off(eventName: 'click', callback: (payload: import('../../libs/chartgpu/dist/ChartGPU.js').ChartGPUEventPayload) => void): void;
    setInteractionX?(x: number | null, source?: unknown): void;
    setCrosshairX?(x: number | null, source?: unknown): void;
    getInteractionX?(): number | null;
}

interface DrawItem {
    type: string;
    color: string;
    width: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

/**
 * Tracked window-level event listeners attached by the legend overlay.
 * Stored so destroy()/deepDispose() can remove them — without tracking, every
 * re-init of the chart would leak three listeners on `window`.
 */
import {
    analyzeColorValues, baseSeriesName,
    buildColorizedSeries, categoryColorFor, colorForScaleValue,
} from './colorScale.js';
import { CHART_PALETTES, getSetting } from '../utils/settings.js';
import type { ColorScaleName } from '../utils/settings.js';
import { getChartPalette, getResolvedTheme, onThemeChange, type ResolvedTheme } from '../utils/theme.js';
import {
    niceLinearTicks, niceTimeTicks, formatTimeTick, formatTimeTooltip,
} from './ticks.js';
import {
    type GridLayout,
    createCanvasOverlay, ensureRelativePosition,
    initBoxZoom,
    initCtrlPan,
} from './chartInteractions.js';
import { ChartOverlays } from './chartOverlays.js';
import { buildLegendEntries, clampLegendPosition, isShiftOnlyGesture, LegendWindowListenerScope, type LegendDragState, type LegendPosition } from './legendInteraction.js';
import { computeZoomPercentRange } from './zoomRangePolicy.js';
import { computeDisplayYRange } from './displayYRangePolicy.js';
import {
    DEFAULT_CHART_GRID,
    computeChartGrid,
    scaleGridLayout,
} from './gridLayout.js';
import {
    exportDataChartHTML,
    exportDataChartPNG,
    exportDataChartSVG,
} from './dataChartExport.js';

const CHART_GRID = DEFAULT_CHART_GRID;

/* ── DataChart class ──────────────────────────────────── */

export class DataChart {
    containerId: string;
    onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null;
    onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null;
    onZoomOutCallback: (() => void) | null;
    chartInstance: ChartInstanceAPI | null = null;

    _xMin: number | null = null;
    _xMax: number | null = null;
    _container: HTMLElement | null = null;
    _selectionBox: HTMLElement | null = null;
    _yMin: number | null = null;
    _yMax: number | null = null;
    _yAuto = true;
    /**
     * When true, the chart's lower Y bound is clamped at 0 (with no
     * negative headroom) so non-negative series render against a clean
     * baseline. Off by default so the legacy auto-fit behaviour is
     * preserved for users that rely on the negative headroom.
     */
    _stackFromZero = false;
    _robustDisplayRange: RobustDisplayRangeOptions | null = null;
    _lastDisplayYValues: number[] = [];
    _lastDataYMin: number | null = null;
    _lastDataYMax: number | null = null;
    _lastSeriesList: SeriesConfig[] | null = null;
    _lastXDomainMin: number | null = null;
    _lastXDomainMax: number | null = null;

    _chartTitle = '';
    _xAxisLabel = '';
    _yAxisLabel = '';
    _titleEl: HTMLElement | null = null;
    _xLabelEl: HTMLElement | null = null;
    _yLabelEl: HTMLElement | null = null;

    _overlayCanvas: HTMLCanvasElement | null = null;
    _overlayCtx: CanvasRenderingContext2D | null = null;
    _drawingResizeObserver: ResizeObserver | null = null;
    _chartResizeObserver: ResizeObserver | null = null;
    _drawings: DrawItem[] = [];
    _currentDraw: DrawItem | null = null;
    _drawMode: string = 'none';
    _drawColor = '#ff0055';
    _drawWidth = 2;
    _drawingRafId: number | null = null;
    _overlays: ChartOverlays | null = null;
    _lastChartOptions: ChartGPUOptions | null = null;
    _lastAppliedTheme: ResolvedTheme | null = null;
    _themeUnsub: (() => void) | null = null;
    _currentGrid: GridLayout = { ...DEFAULT_CHART_GRID };
    _legendEl: HTMLElement | null = null;
    _legendPosition: LegendPosition | null = null;
    _legendDragState: LegendDragState | null = null;
    _legendWindowListeners = new LegendWindowListenerScope();

    constructor(
        containerId: string,
        onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null = null,
        onZoomOutCallback: (() => void) | null = null,
    ) {
        this.containerId = containerId;
        this.onZoomCallback = onZoomCallback;
        this.onYRangeCallback = onYRangeCallback;
        this.onZoomOutCallback = onZoomOutCallback;
        this.chartInstance = null;
    }

    /* ── Public surface ─────────────────────────────────── */

    destroy(): void {
        if (this._drawingRafId !== null) {
            cancelAnimationFrame(this._drawingRafId);
            this._drawingRafId = null;
        }
        this._drawingResizeObserver?.disconnect();
        this._drawingResizeObserver = null;
        this._chartResizeObserver?.disconnect();
        this._chartResizeObserver = null;
        this._themeUnsub?.();
        this._themeUnsub = null;
        this._overlays = null;
        this._legendEl?.remove();
        this._legendEl = null;
        this._legendPosition = null;
        this._legendDragState = null;
        this._removeLegendWindowListeners();
        this.chartInstance = null;
    }

    /**
     * Full disposal — tears down the chart instance, canvas overlays, and all
     * bound elements. Safe to call when the GPU device is lost or the chart
     * container is being removed from the DOM.
     */
    deepDispose(): void {
        if (this._drawingRafId !== null) {
            cancelAnimationFrame(this._drawingRafId);
            this._drawingRafId = null;
        }
        this._drawingResizeObserver?.disconnect();
        this._drawingResizeObserver = null;
        this._chartResizeObserver?.disconnect();
        this._chartResizeObserver = null;

        // Remove overlay canvas from DOM and release its context.
        this._overlayCanvas?.remove();
        this._overlayCanvas = null;
        this._overlayCtx = null;

        // Remove selection box from DOM.
        this._selectionBox?.remove();
        this._selectionBox = null;

        this._container = null;
        this._titleEl = null;
        this._xLabelEl = null;
        this._yLabelEl = null;
        this._legendEl?.remove();
        this._legendEl = null;
        this._legendPosition = null;
        this._legendDragState = null;
        this._removeLegendWindowListeners();

        // Release ChartGPU instance (guards against device-lost scenarios).
        try {
            this.chartInstance?.dispose?.();
        } catch (_) {
            // dispose() may throw if the GPU device was already lost.
        }
        this.chartInstance = null;

        // Clear drawing state.
        this._drawings = [];
        this._currentDraw = null;
        this._drawMode = 'none';
        this._drawColor = '#ff0055';
        this._drawWidth = 2;

        // Reset bounds.
        this._xMin = null;
        this._xMax = null;
        this._yMin = null;
        this._yMax = null;
        this._lastDataYMin = null;
        this._lastDataYMax = null;
        this._robustDisplayRange = null;
        this._lastDisplayYValues = [];
        this._lastSeriesList = null;
        this._lastXDomainMin = null;
        this._lastXDomainMax = null;
        this._lastChartOptions = null;
        this._lastAppliedTheme = null;

        this._themeUnsub?.();
        this._themeUnsub = null;
    }

    setChartText(title: string, xLabel: string, yLabel: string): void {
        this._chartTitle = String(title ?? '').trim();
        this._xAxisLabel = String(xLabel ?? '').trim();
        this._yAxisLabel = String(yLabel ?? '').trim();
        this._syncTextOverlays();
        this._applyDisplayYRangeToChart();
    }

    setDrawMode(mode: string, color?: string, width?: number): void {
        this._drawMode = mode;
        if (color) this._drawColor = color;
        if (width) this._drawWidth = width;
        if (this._overlayCanvas) {
            this._overlayCanvas.style.pointerEvents = mode === 'none' ? 'none' : 'auto';
        }
    }

    clearDrawings(): void {
        this._drawings = [];
        this._currentDraw = null;
        this._renderDrawings();
    }

    requestOverlayRender(): void {
        this._renderDrawings();
    }

    resize(): void {
        this.chartInstance?.resize?.();
        if (this._legendEl && this._legendPosition) this._applyLegendPosition(this._legendPosition);
        this._renderDrawings();
    }

    /** Schedule a drawing render on the next animation frame (coalesces rapid calls). */
    private _scheduleDrawingRender(): void {
        if (this._drawingRafId !== null) return;
        this._drawingRafId = requestAnimationFrame(() => {
            this._drawingRafId = null;
            this._renderDrawings();
        });
    }

    setXRange(minMs: number, maxMs: number): void {
        if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return;
        this._xMin = minMs;
        this._xMax = maxMs;
        if (DEBUG) dbg('setXRange', { minMs, maxMs });
    }

    async init(): Promise<void> {
        const container = document.getElementById(this.containerId);
        if (!container) throw new Error(`Chart container not found: ${this.containerId}`);
        container.replaceChildren();
        this._container = container;
        const chartGrid = { ...this._updateCurrentGrid() };
        const chartOptions: ChartGPUOptions & Record<string, unknown> = {
            animation: false,
            grid: chartGrid,
            theme: this._buildChartGpuTheme(),
            palette: this._getChartColorPalette(),
            xAxis: { type: 'time' },
            yAxis: { type: 'value' },
            legend: { show: false },
            series: [],
        };
        const powerPreference = defaultGpuPowerPreference();
        if (powerPreference) chartOptions.powerPreference = powerPreference;
        this._lastChartOptions = chartOptions as ChartGPUOptions;
        this._lastAppliedTheme = getResolvedTheme();
        try {
            this.chartInstance = await createChart(container, chartOptions as unknown as ChartGPUOptions);
        } catch (e) {
            console.error('[edatime:chart] init failed:', e);
            this.chartInstance = null;
            return;
        }
        this._chartResizeObserver?.disconnect();
        this._chartResizeObserver = new ResizeObserver(() => this.resize());
        this._chartResizeObserver.observe(container);
        this._initDrawingOverlay();
        this._initTextOverlays();
        this._syncLegendOverlay();
        this._initMouseSelectionZoom();
        this._initCtrlPan();
        this._themeUnsub?.();
        this._themeUnsub = onThemeChange((next: ResolvedTheme) => {
            this._onThemeChanged(next);
        });
        requestAnimationFrame(() => this.resize());
    }

    private _onThemeChanged(theme: ResolvedTheme): void {
        if (this.chartInstance && this._lastChartOptions && theme !== this._lastAppliedTheme) {
            const nextOption = {
                ...this._lastChartOptions,
                theme: this._buildChartGpuTheme(),
                palette: this._getChartColorPalette(),
            };
            this._lastChartOptions = nextOption as ChartGPUOptions;
            this._lastAppliedTheme = theme;
            try {
                this.chartInstance.setOption(nextOption as ChartGPUOptions);
            } catch (e) {
                console.error('[edatime:chart] theme setOption failed', e);
            }
        } else {
            this._lastAppliedTheme = theme;
        }

        this._renderDrawings();
        this._syncTextOverlays();
    }

    supportsZoomControls(): boolean {
        return !!this.chartInstance;
    }

    getXDomain(): { min: number; max: number } | null {
        if (Number.isFinite(this._lastXDomainMin) && Number.isFinite(this._lastXDomainMax) && this._lastXDomainMax! > this._lastXDomainMin!) {
            return { min: this._lastXDomainMin!, max: this._lastXDomainMax! };
        }
        return null;
    }

    setYRange(min: number, max: number): void {
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        this._applyYRange(min, max, 'api', false);
        this._applyDisplayYRangeToChart();
    }

    /**
     * Clear any user-set y range (set via `setYRange` or box-zoom) so the
     * next render uses the data-driven fit. Without this, zoom-out,
     * zoom-reset, and the `fit` mode of `applyViewport` leave the user y
     * range in place — visually keeping the chart pinned at the last
     * zoomed-in y-range when it should be showing the full data span.
     * Triggers an immediate chart repaint.
     */
    resetYRange(): void {
        if (this._yMin === null && this._yMax === null) return;
        this._yMin = null;
        this._yMax = null;
        this._yAuto = true;
        this._applyDisplayYRangeToChart();
    }

    /**
     * Toggle the chart's "stack from zero" behaviour. When enabled, the
     * y-axis lower bound is clamped at 0 in the next render so a series
     * like OT (always positive) renders against a clean baseline. The
     * change is purely presentational; underlying data and zoom history
     * are unaffected.
     */
    setStackFromZero(on: boolean): void {
        this._stackFromZero = !!on;
        this._applyDisplayYRangeToChart();
    }

    isStackFromZero(): boolean {
        return this._stackFromZero;
    }

    setRobustDisplayRange(options: RobustDisplayRangeOptions | null): void {
        if (!options) {
            this._robustDisplayRange = null;
            this._applyDisplayYRangeToChart();
            return;
        }
        this._robustDisplayRange = normalizeRobustDisplayRange(options);
        this._applyDisplayYRangeToChart();
    }

    getYRange(): { min: number; max: number } | null {
        // Expose the active viewport first. The app uses `getYRange()` as the
        // global source of truth for chart gestures, zoom-history snapshots,
        // filter state, and exports. If a user-set y zoom exists, reporting the
        // raw data bounds here makes the rest of the app behave as though the
        // zoom never happened.
        if (Number.isFinite(this._yMin) && Number.isFinite(this._yMax) && this._yMax! > this._yMin!) {
            return { min: this._yMin!, max: this._yMax! };
        }
        if (Number.isFinite(this._lastDataYMin) && Number.isFinite(this._lastDataYMax) && this._lastDataYMax! > this._lastDataYMin!) {
            return { min: this._lastDataYMin!, max: this._lastDataYMax! };
        }
        return null;
    }

    getRobustDisplayRangeSuggestion(): RobustDisplayRangeOptions | null {
        return suggestRobustDisplayRange(this._lastDisplayYValues, this._lastDataYMin, this._lastDataYMax);
    }

    cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null {
        if (!this._container) return null;
        if (!Number.isFinite(this._xMin) || !Number.isFinite(this._xMax) || this._xMax! <= this._xMin!) return null;
        const yRange = this.getYRange();
        if (!yRange || yRange.max <= yRange.min) return null;

        const rect = this._container.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const grid = this._updateCurrentGrid();
        const plotLeft = grid.left;
        const plotTop = grid.top;
        const plotRight = Math.max(plotLeft + 1, rect.width - grid.right);
        const plotBottom = Math.max(plotTop + 1, rect.height - grid.bottom);
        if (localX < plotLeft || localX > plotRight || localY < plotTop || localY > plotBottom) return null;

        const xNorm = (localX - plotLeft) / Math.max(1, plotRight - plotLeft);
        const yNorm = (localY - plotTop) / Math.max(1, plotBottom - plotTop);
        return {
            x: this._xMin! + xNorm * (this._xMax! - this._xMin!),
            y: yRange.max - yNorm * (yRange.max - yRange.min),
        };
    }

    zoomY(_factor: number, _anchorNormalized = 0.5): void { /* intentionally blank */ }

    fitYToData(): void {
        if (!Number.isFinite(this._lastDataYMin) || !Number.isFinite(this._lastDataYMax)) return;
        if (this.onYRangeCallback) this.onYRangeCallback(this._lastDataYMin!, this._lastDataYMax!, 'data');
    }

    onCrosshairMove(callback: (data: ChartGPUCrosshairMovePayload) => void): void {
        this.chartInstance?.on('crosshairMove', callback);
    }

    onClick(callback: (data: import('../../libs/chartgpu/dist/ChartGPU.js').ChartGPUEventPayload) => void): void {
        this.chartInstance?.on('click', callback);
    }

    /* ── Data update ────────────────────────────────────── */

    updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void {
        if (!this.chartInstance) return;
        const showMarkers = dataObj._meta?.downsampled === false;
        const prevVisibility = this._getVisibilityByBaseNameFromChart();

        let dataYMin = Number.POSITIVE_INFINITY;
        let dataYMax = Number.NEGATIVE_INFINITY;
        let xDomainMin = Number.POSITIVE_INFINITY;
        let xDomainMax = Number.NEGATIVE_INFINITY;
        const displayYValues: number[] = [];
        /* Internal intermediate types for series building */
        interface ColorCandidateEntry {
            readonly __colorCandidate: true;
            readonly colName: string;
            readonly idx: number;
            readonly visible: boolean;
            readonly points: [number, number][];
            readonly colorValues: unknown[];
        }

        const seriesAnnotations: AnnotationConfig[] = [];

        const seriesList = columns
            .filter((colName) => {
                const name = String(colName || '').toLowerCase();
                if (name === 'ts' || name === 'timestamp' || name === 'time') return false;
                return dataObj.values?.[colName] || dataObj.series?.[colName];
            })
            .map((colName, idx) => {
                const seriesData = dataObj.series?.[colName];
                const yValues: Float64Array = seriesData ? seriesData.y : (dataObj.values?.[colName] ?? null as unknown as Float64Array);
                const xValues: Float64Array = seriesData ? seriesData.x : (dataObj.ts ?? null as unknown as Float64Array);

                const points: [number, number][] = [];
                const n = Math.min(xValues?.length ?? 0, yValues?.length ?? 0);
                for (let i = 0; i < n; i++) {
                    const x = Number(xValues[i]);
                    const y = Number(yValues[i]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                    points.push([x, y]);
                    displayYValues.push(y);
                    if (x < xDomainMin) xDomainMin = x;
                    if (x > xDomainMax) xDomainMax = x;
                    if (y < dataYMin) dataYMin = y;
                    if (y > dataYMax) dataYMax = y;
                }

                const visible = prevVisibility.get(colName) !== false;
                const seriesColors = Array.isArray(dataObj.colorByColumn?.[colName])
                    ? dataObj.colorByColumn[colName]
                    : dataObj.color;
                const wantsColorBy = !!uiState.selectedColorColumn
                    && Array.isArray(seriesColors)
                    && seriesColors.length === points.length;

                if (wantsColorBy) {
                    return [{ __colorCandidate: true, colName, idx, visible, points, colorValues: seriesColors }];
                }

                const numColIdx = datasetState.numericCols.indexOf(colName);
                const color = getSeriesColor(colName, numColIdx >= 0 ? numColIdx : idx);
                const lineSeries = { type: 'line' as const, name: colName, color, visible, data: points };
                if (showMarkers && visible) {
                    for (const pt of points) {
                        seriesAnnotations.push({ type: 'point', x: pt[0], y: pt[1], layer: 'aboveSeries', marker: { symbol: 'circle', size: 5, style: { color } } });
                    }
                }
                return [lineSeries];
            });

        const colorColumn = uiState.selectedColorColumn;
        const colorDecoratedSeries: SeriesConfig[] = [];
        const colorbarWrap = document.getElementById('timeseries-colorbar-wrap');
        const categoricalWrap = document.getElementById('timeseries-categorical-wrap');
        if (colorbarWrap) { colorbarWrap.hidden = true; colorbarWrap.style.display = 'none'; }
        if (categoricalWrap) { categoricalWrap.hidden = true; categoricalWrap.style.display = 'none'; }

        const colorCandidates: ColorCandidateEntry[] = [];
        const baseSeriesList: SeriesConfig[] = [];
        for (const entry of seriesList.flat()) {
            if ((entry as ColorCandidateEntry)?.__colorCandidate) colorCandidates.push(entry as ColorCandidateEntry);
            else baseSeriesList.push(entry as SeriesConfig);
        }

        const displayedColorValues = colorCandidates.flatMap((e) => e.colorValues || []);
        const scaleInfo = colorColumn ? analyzeColorValues(displayedColorValues) : null;

        if (colorColumn && scaleInfo && colorCandidates.length > 0) {
            for (const entry of colorCandidates) {
                const { series: colorSeries, annotations: colorAnnotations } = buildColorizedSeries(
                    entry.colName, entry.points, entry.colorValues, scaleInfo, entry.visible, showMarkers,
                );
                colorDecoratedSeries.push(...colorSeries);
                seriesAnnotations.push(...colorAnnotations);
            }

            if (scaleInfo.isNumeric) {
                if (colorbarWrap) {
                    colorbarWrap.hidden = false;
                    colorbarWrap.style.display = 'grid';
                    document.getElementById('timeseries-colorbar-name')!.textContent = colorColumn;
                    document.getElementById('timeseries-colorbar-min')!.textContent = formatTwoDecimals(scaleInfo.min);
                    document.getElementById('timeseries-colorbar-max')!.textContent = formatTwoDecimals(scaleInfo.max);
                    const scaleName = getSetting('colorScale') as ColorScaleName;
                    const scaleColors = {
                        viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26838f', '#1f9d89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
                        plasma: ['#0d0887', '#5302a3', '#8b0aa5', '#b83289', '#e16462', '#fca636', '#f0f921'],
                        magma: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#f26b1d', '#fca50a', '#fca636', '#fde725'],
                        coolwarm: ['#3b4cc0', '#6786d1', '#9eb2de', '#c9d3e8', '#f7f7f7', '#f4a582', '#d6605a', '#b2182b'],
                        inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#fca636', '#fca50a', '#fde725'],
                    } as const;
                    const gradient = scaleColors[scaleName] ?? scaleColors.viridis;
                    document.getElementById('timeseries-colorbar')!.style.background = `linear-gradient(90deg, ${gradient.join(',')})`;
                }
            } else if (categoricalWrap) {
                categoricalWrap.hidden = false;
                categoricalWrap.style.display = 'grid';
                document.getElementById('timeseries-categorical-name')!.textContent = colorColumn;
                const legend = document.getElementById('timeseries-categorical-legend')!;
                legend.innerHTML = '';
                scaleInfo.categories.forEach((category) => {
                    const item = document.createElement('div');
                    item.className = 'scatter-distribution-legend-item';
                    item.innerHTML = `<span class="scatter-distribution-legend-swatch" style="background: ${categoryColorFor(category, scaleInfo.categories)}"></span><span>${String(category)}</span>`;
                    legend.appendChild(item);
                });
            }
        }

        const flattenedSeriesList = [...baseSeriesList, ...colorDecoratedSeries];
        this._lastSeriesList = flattenedSeriesList;
        this._lastDisplayYValues = displayYValues;
        this._lastXDomainMin = Number.isFinite(xDomainMin) ? xDomainMin : null;
        this._lastXDomainMax = Number.isFinite(xDomainMax) ? xDomainMax : null;

        if (Number.isFinite(dataYMin) && Number.isFinite(dataYMax)) {
            this._lastDataYMin = dataYMin;
            this._lastDataYMax = dataYMax;
            if (this.onYRangeCallback) this.onYRangeCallback(dataYMin, dataYMax, 'data');
        }

        if (flattenedSeriesList.length > 0) {
            const tooltipFormatter = (params: unknown): string => {
                type TooltipEntry = { seriesName?: string; value?: [number, number] };
                const rawList: unknown[] = Array.isArray(params) ? params : [params];
                const seen = new Set<string>();
                const list = rawList.filter((p): p is TooltipEntry => {
                    const pp = p as TooltipEntry;
                    const base = baseSeriesName(pp?.seriesName ?? '');
                    if (!base || seen.has(base)) return false;
                    seen.add(base);
                    return true;
                });
                if (list.length === 0) return '';
                const first = list[0] as TooltipEntry;
                const x = Number(first?.value?.[0]);
                const spanMs = Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax)
                    ? Math.max(1, xDomainMax - xDomainMin) : 86400_000;
                const header = Number.isFinite(x) ? formatTimeTooltip(x, spanMs) : '';
                const rows = list.map((p) => {
                    const pp = p as TooltipEntry;
                    const name = escapeHtml(baseSeriesName(pp?.seriesName ?? 'series') || 'series');
                    const y = formatTwoDecimals(pp?.value?.[1] ?? NaN);
                    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(y)}</span></div>`;
                }).join('');
                return header ? `<div style="opacity:0.8;margin-bottom:6px;">${escapeHtml(header)}</div>${rows}` : rows;
            };

            const nextOption = {
                animation: false,
                grid: { ...this._updateCurrentGrid() },
                theme: this._buildChartGpuTheme(),
                palette: this._getChartColorPalette(),
                xAxis: {
                    type: 'time' as const,
                    min: Number.isFinite(xDomainMin) ? xDomainMin : undefined,
                    max: Number.isFinite(xDomainMax) ? xDomainMax : undefined,
                    tickFormatter: (value: number) => formatTimeTick(
                        value,
                        Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax)
                            ? Math.max(1, xDomainMax - xDomainMin) : 86400_000,
                    ),
                },
                yAxis: this._buildYAxisOption(),
                legend: { show: false },
                tooltip: { show: true, trigger: 'axis', formatter: tooltipFormatter },
                series: flattenedSeriesList,
                annotations: seriesAnnotations,
            };
            try {
                this._lastChartOptions = nextOption as ChartGPUOptions;
                this._lastAppliedTheme = getResolvedTheme();
                this.chartInstance.setOption(nextOption as unknown as ChartGPUOptions);
                const zoomRange = this._computeChartZoomPercentRange(xDomainMin, xDomainMax);
                this.chartInstance.setZoomRange(zoomRange.start, zoomRange.end, 'api');
            } catch (e) {
                console.error('[edatime:chart] setOption failed', e);
            }
        }

        this._syncLegendOverlay();
        this._renderDrawings();
    }

    /* ── Export ──────────────────────────────────────────── */

    async exportPNG(): Promise<void> {
        await exportDataChartPNG({
            filename: 'edatime_chart.png',
            getCanvas: (includeDrawings) => this._getCombinedExportCanvas(includeDrawings),
            downloadUrl,
        });
    }

    async exportSVG(): Promise<void> {
        await exportDataChartSVG({
            filename: 'edatime_chart.svg',
            getCanvas: (includeDrawings) => this._getCombinedExportCanvas(includeDrawings),
            downloadBlob,
        });
    }

    async exportHTML(): Promise<void> {
        await exportDataChartHTML({
            filename: 'edatime_chart.html',
            getCanvas: (includeDrawings) => this._getCombinedExportCanvas(includeDrawings),
            downloadBlob,
        });
    }

    /* ── Private helpers ────────────────────────────────── */

    private _applyYRange(min: number, max: number, sourceKind: string, setAuto: boolean | null): void {
        if (setAuto === true) this._yAuto = true;
        if (setAuto === false) this._yAuto = false;
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        this._yMin = min;
        this._yMax = max;
        if (this.onYRangeCallback) this.onYRangeCallback(min, max, sourceKind);
    }

    private _buildYAxisOption(): { type: 'value'; min?: number; max?: number; tickFormatter: (value: number) => string } {
        // The data-driven min/max (used by filters, exports, annotations, and
        // the Y-range callback) is stored verbatim in `_lastDataYMin` /
        // `_lastDataYMax`. For rendering only, we apply a small 5 % headroom
        // so spikes like ETTm2's 107.89 HUFL outlier don't get clipped at the
        // top edge of the chart — see `usage_issue.md` §1.4. When the user
        // has Stack-from-zero on, we clamp the lower bound at 0 so the
        // chart reflects a non-negative baseline for series that should
        // never dip below zero (e.g. OT, temperature counts).
        //
        // When the user has set an explicit y range (via `setYRange`,
        // box-zoom, or Ctrl-pan y motion), honour that range verbatim so
        // the chart zooms in on y exactly the way they asked. Without
        // this, dragging a smaller box on the chart would only zoom the
        // x-axis and the y-axis would keep showing the full data span,
        // defeating the whole point of a box-zoom interaction.
        const option: { type: 'value'; min?: number; max?: number; tickFormatter: (value: number) => string } = {
            type: 'value',
            tickFormatter: (value: number) => formatTwoDecimals(value),
        };
        const displayBounds = this._computeRobustDisplayBounds();
        const range = computeDisplayYRange({ userMin: this._yMin, userMax: this._yMax, dataMin: this._lastDataYMin, dataMax: this._lastDataYMax, robustMin: displayBounds?.min ?? null, robustMax: displayBounds?.max ?? null, stackFromZero: this._stackFromZero });
        if (range) { option.min = range.min; option.max = range.max; }
        return option;
    }

    private _measureGrid(scale = 1): GridLayout {
        const yAxis = this._buildYAxisOption();
        const yMin = Number(yAxis.min);
        const yMax = Number(yAxis.max);
        const yTickLabels = Number.isFinite(yMin) && Number.isFinite(yMax) && yMax > yMin
            ? niceLinearTicks(yMin, yMax, 6).map((value) => yAxis.tickFormatter(value))
            : [formatTwoDecimals(0), formatTwoDecimals(1)];
        return computeChartGrid({
            yTickLabels,
            yAxisLabel: this._yAxisLabel,
            scale,
        });
    }

    private _updateCurrentGrid(scale = 1): GridLayout {
        const next = this._measureGrid(scale);
        this._currentGrid.left = next.left;
        this._currentGrid.right = next.right;
        this._currentGrid.top = next.top;
        this._currentGrid.bottom = next.bottom;
        return this._currentGrid;
    }

    private _applyDisplayYRangeToChart(): void {
        if (!this.chartInstance) return;
        const previous = this._lastChartOptions ?? this.chartInstance.options;
        if (!previous) return;
        const nextOption = {
            ...previous,
            animation: false,
            grid: { ...this._updateCurrentGrid() },
            yAxis: {
                ...(previous.yAxis ?? {}),
                ...this._buildYAxisOption(),
            },
        } as ChartGPUOptions;
        try {
            this.chartInstance.setOption(nextOption);
            this._lastChartOptions = nextOption;
        } catch (error) {
            console.error('[edatime:chart] y-range refresh failed', error);
        }
    }

    private _computeRobustDisplayBounds(): { min: number; max: number } | null {
        return computeRobustDisplayBounds(this._lastDisplayYValues, this._robustDisplayRange);
    }

    private _computeChartZoomPercentRange(
        domainMin: number,
        domainMax: number,
    ): { start: number; end: number } {
        return computeZoomPercentRange(domainMin, domainMax, this._xMin, this._xMax);
    }

    private _getChartColorPalette(): string[] {
        const paletteName = String(getSetting('defaultPalette') ?? 'default');
        const colors = CHART_PALETTES[paletteName] ?? CHART_PALETTES.default;
        return Array.isArray(colors) ? [...colors] : [...CHART_PALETTES.default];
    }

    private _buildChartGpuTheme() {
        const palette = getChartPalette();
        return {
            backgroundColor: palette.background,
            textColor: palette.text,
            axisLineColor: palette.borderHi,
            axisTickColor: palette.textDim,
            gridLineColor: palette.border,
            colorPalette: this._getChartColorPalette(),
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: 12,
        };
    }

    private _getVisibilityByBaseNameFromChart(): Map<string, boolean> {
        const vis = new Map<string, boolean>();
        const series = this.chartInstance?.options?.series;
        if (!Array.isArray(series)) return vis;
        for (const s of series) {
            const name = typeof s?.name === 'string' ? s.name : '';
            const base = baseSeriesName(name);
            if (!base) continue;
            vis.set(base, s.visible !== false);
        }
        return vis;
    }

    private _syncLegendOverlay(): void {
        if (!this._container) return;
        const entries = this._getLegendEntries();
        if (entries.length === 0) {
            this._legendEl?.remove();
            this._legendEl = null;
            this._legendDragState = null;
            return;
        }

        const legend = this._ensureLegendOverlay();
        legend.replaceChildren();
        legend.title = 'Legend (click to toggle, Shift+drag to move)';

        const rows = document.createElement('div');
        rows.className = 'timeseries-legend-overlay__rows';
        for (const entry of entries) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'timeseries-legend-overlay__row';
            button.dataset.seriesName = entry.name;
            button.setAttribute('aria-pressed', entry.visible ? 'true' : 'false');
            button.title = `${entry.visible ? 'Hide' : 'Show'} ${entry.name}`;

            const swatch = document.createElement('span');
            swatch.className = 'timeseries-legend-overlay__swatch';
            swatch.style.backgroundColor = entry.color;

            const label = document.createElement('span');
            label.className = 'timeseries-legend-overlay__label';
            label.textContent = entry.name;

            button.append(swatch, label);
            button.addEventListener('click', () => this._toggleLegendTrace(entry.name));
            rows.appendChild(button);
        }
        legend.appendChild(rows);

        this._applyLegendPosition(this._legendPosition ?? this._getDefaultLegendPosition());
    }

    private _ensureLegendOverlay(): HTMLElement {
        if (this._legendEl && this._legendEl.isConnected) return this._legendEl;
        // Defensive: after destroy()/deepDispose(), the previous element may
        // still be in the DOM briefly but should be replaced.
        if (this._legendEl) {
            this._removeLegendWindowListeners();
            this._legendEl.remove();
            this._legendEl = null;
        }
        if (!this._container) throw new Error('Cannot create legend overlay without chart container.');

        const legend = document.createElement('div');
        legend.className = 'timeseries-legend-overlay';
        legend.setAttribute('role', 'group');
        legend.setAttribute('aria-label', 'Timeseries trace legend');
        legend.addEventListener('pointerdown', (event) => this._startLegendDrag(event));
        legend.addEventListener('pointermove', (event) => this._moveLegendDrag(event));
        legend.addEventListener('pointerup', (event) => this._finishLegendDrag(event));
        legend.addEventListener('pointercancel', (event) => this._finishLegendDrag(event));
        legend.addEventListener('pointerenter', (event) => this._syncLegendShiftHint(event));

        // Track every window listener we attach so destroy()/deepDispose()
        // can remove them — otherwise each chart re-init leaks three
        // listeners on `window`.
        this._addLegendWindowListener('keydown', (event) => this._syncLegendShiftHint(event));
        this._addLegendWindowListener('keyup', (event) => this._syncLegendShiftHint(event));
        this._addLegendWindowListener('blur', () => {
            this._legendEl?.classList.remove('is-shift-active');
            this._container?.classList.remove('is-shift-active');
        });

        this._container.appendChild(legend);
        this._legendEl = legend;
        return legend;
    }

    private _addLegendWindowListener(type: string, handler: EventListener): void {
        // Reuse the same handler instance across re-inits so removal works
        // even if destroy()/init() cycle fires more than once.
        this._legendWindowListeners.add(type, handler);
    }

    private _removeLegendWindowListeners(): void {
        this._legendWindowListeners.dispose();
    }

    private _syncLegendShiftHint(event: Event, legend?: HTMLElement | null): void {
        const el = legend ?? this._legendEl;
        if (!el) return;
        const ke = event as KeyboardEvent;
        const pe = event as PointerEvent;
        const shiftOnly = isShiftOnlyGesture(ke) || isShiftOnlyGesture(pe);
        el.classList.toggle('is-shift-active', shiftOnly);
        // Mirror the hint on the chart container so other handlers
        // (notably box-zoom) can cheaply check `is-shift-active` and
        // bail out while the user is dragging the legend.
        this._container?.classList.toggle('is-shift-active', shiftOnly);
    }

    private _getLegendEntries(): { name: string; color: string; visible: boolean }[] {
        const seriesList = Array.isArray(this._lastSeriesList) ? this._lastSeriesList : [];
        return buildLegendEntries(seriesList, this._getChartColorPalette(), baseSeriesName);
    }

    private _toggleLegendTrace(name: string): void {
        if (!this.chartInstance) return;
        const options = this._lastChartOptions ?? this.chartInstance.options;
        const series = Array.isArray(options.series) ? options.series : [];
        const currentEntry = this._getLegendEntries().find((entry) => entry.name === name);
        const nextVisible = !(currentEntry?.visible ?? true);
        const nextSeries = series.map((item) => {
            const rawName = typeof item?.name === 'string' ? item.name : '';
            if (baseSeriesName(rawName) !== name) return item;
            return { ...item, visible: nextVisible };
        });
        const nextOption = {
            ...options,
            animation: false,
            legend: { show: false },
            series: nextSeries,
        } as ChartGPUOptions;

        try {
            this.chartInstance.setOption(nextOption);
        } catch (e) {
            console.error('[edatime:chart] legend toggle failed', e);
            return;
        }
        this._lastChartOptions = nextOption;
        this._lastSeriesList = nextSeries as SeriesConfig[];
        this._syncLegendOverlay();
        this._renderDrawings();
    }

    private _getDefaultLegendPosition(): LegendPosition {
        const legend = this._legendEl;
        const container = this._container;
        if (!legend || !container) return { left: 8, top: 8 };
        return this._clampLegendPosition({
            left: container.clientWidth - legend.offsetWidth - 10,
            top: 12,
        });
    }

    private _applyLegendPosition(position: LegendPosition): void {
        if (!this._legendEl) return;
        const next = this._clampLegendPosition(position);
        this._legendPosition = next;
        this._legendEl.style.left = `${next.left}px`;
        this._legendEl.style.top = `${next.top}px`;
    }

    private _clampLegendPosition(position: LegendPosition): LegendPosition {
        const container = this._container;
        const legend = this._legendEl;
        if (!container || !legend) return { left: 8, top: 8 };
        return clampLegendPosition(position, container, legend);
    }

    private _startLegendDrag(event: PointerEvent): void {
        if (event.button !== 0 || !this._legendEl) return;
        if (!isShiftOnlyGesture(event)) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.timeseries-legend-overlay__row')) return;
        event.preventDefault();
        this._legendDragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: this._legendPosition?.left ?? this._legendEl.offsetLeft,
            startTop: this._legendPosition?.top ?? this._legendEl.offsetTop,
        };
        this._legendEl.classList.add('is-dragging');
        // Suppress chart hover (crosshair + tooltip) for the duration of
        // the drag so the legend overlay can receive the pointermove
        // uninterrupted. Without this, the chart re-engages its tooltip
        // whenever the legend sits over a series line and the drag stalls.
        this._suppressChartHover();
        try { this._legendEl.setPointerCapture(event.pointerId); } catch { /* ignored */ }
    }

    private _moveLegendDrag(event: PointerEvent): void {
        const drag = this._legendDragState;
        if (!drag || drag.pointerId !== event.pointerId) return;
        // Defeat any chart-internal pointer handler that re-engages hover
        // while the pointer is over the legend overlay.
        this._suppressChartHover();
        this._applyLegendPosition({
            left: drag.startLeft + event.clientX - drag.startClientX,
            top: drag.startTop + event.clientY - drag.startClientY,
        });
    }

    private _finishLegendDrag(event: PointerEvent): void {
        const drag = this._legendDragState;
        if (!drag || drag.pointerId !== event.pointerId) return;
        this._legendDragState = null;
        this._legendEl?.classList.remove('is-dragging');
        try { this._legendEl?.releasePointerCapture(event.pointerId); } catch { /* ignored */ }
        // Leave hover cleared: the pointer is still over the legend, and the
        // next natural pointermove into the chart grid will re-establish it.
        this._suppressChartHover();
    }

    private _suppressChartHover(): void {
        const chart = this.chartInstance as (ChartInstanceAPI & {
            setInteractionX?: (x: number | null, source?: unknown) => void;
            setCrosshairX?: (x: number | null, source?: unknown) => void;
        }) | null;
        if (!chart) return;
        const setter = chart.setInteractionX ?? chart.setCrosshairX;
        if (typeof setter !== 'function') return;
        try { setter.call(chart, null, 'legend-drag'); } catch { /* ignored */ }
    }

    /* ── Text overlays ──────────────────────────────────── */

    private _initTextOverlays(): void {
        if (!this._container) return;
        const container = this._container;
        ensureRelativePosition(container);
        const mk = (cls: string): HTMLElement => {
            const el = document.createElement('div');
            el.className = `chart-text-overlay ${cls}`;
            el.style.display = 'none';
            container.appendChild(el);
            return el;
        };
        this._titleEl = mk('chart-title-overlay');
        this._xLabelEl = mk('chart-xlabel-overlay');
        this._yLabelEl = mk('chart-ylabel-overlay');
        this._syncTextOverlays();
    }

    private _syncTextOverlays(): void {
        const set = (el: HTMLElement | null, text: string) => {
            if (!el) return;
            const t = String(text ?? '').trim();
            el.textContent = t;
            el.style.display = t ? 'block' : 'none';
        };
        set(this._titleEl, this._chartTitle);
        set(this._xLabelEl, this._xAxisLabel);
        set(this._yLabelEl, this._yAxisLabel);
    }

    /* ── Drawing overlay ────────────────────────────────── */

    private _initDrawingOverlay(): void {
        if (!this._container) return;
        const container = this._container;
        ensureRelativePosition(container);

        const { canvas, observer } = createCanvasOverlay(container, () => this._renderDrawings());
        this._drawingResizeObserver = observer;
        this._overlayCanvas = canvas;
        this._overlayCtx = canvas.getContext('2d');

        this._overlays = new ChartOverlays({
            getXMin: () => this._xMin,
            getXMax: () => this._xMax,
            getContainer: () => this._container,
            getOverlayCanvas: () => this._overlayCanvas,
            getGrid: () => this._currentGrid,
            getYRange: () => this.getYRange(),
            getPendingAdaptivePoint: () => uiState.pendingAdaptivePoint,
        });

        canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || this._drawMode === 'none') return;
            const rect = canvas.getBoundingClientRect();
            this._currentDraw = { type: this._drawMode, color: this._drawColor, width: this._drawWidth, startX: e.clientX - rect.left, startY: e.clientY - rect.top, endX: e.clientX - rect.left, endY: e.clientY - rect.top };
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!this._currentDraw || this._drawMode === 'none') return;
            const rect = canvas.getBoundingClientRect();
            this._currentDraw.endX = e.clientX - rect.left;
            this._currentDraw.endY = e.clientY - rect.top;
            this._scheduleDrawingRender();
        });
        canvas.addEventListener('pointerup', (e) => {
            if (!this._currentDraw || this._drawMode === 'none') return;
            this._drawings.push(this._currentDraw);
            this._currentDraw = null;
            canvas.releasePointerCapture(e.pointerId);
            this._renderDrawings();
            if (getSetting('drawAutoReset')) {
                this._drawings = [];
                this._renderDrawings();
            }
        });
        canvas.addEventListener('pointercancel', () => { this._currentDraw = null; this._renderDrawings(); });
    }

    /* ── Drawing render ─────────────────────────────────── */

    private _drawArrow(ctx: CanvasRenderingContext2D, sx: number, sy: number, ex: number, ey: number): void {
        const headlen = 10;
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    private _renderDrawings(): void {
        if (!this._overlayCtx || !this._overlayCanvas) return;
        const ctx = this._overlayCtx;
        ctx.clearRect(0, 0, this._overlayCanvas.width, this._overlayCanvas.height);
        this._overlays?.renderAll(ctx, { x: 1, y: 1 });
        const allDraws = [...this._drawings];
        if (this._currentDraw) allDraws.push(this._currentDraw);
        for (const item of allDraws) {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (item.type === 'arrow') this._drawArrow(ctx, item.startX, item.startY, item.endX, item.endY);
            else if (item.type === 'box') {
                ctx.beginPath();
                ctx.rect(Math.min(item.startX, item.endX), Math.min(item.startY, item.endY), Math.abs(item.endX - item.startX), Math.abs(item.endY - item.startY));
                ctx.stroke();
            }
        }
    }

    private _renderRollingBandsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const bands = analyticsState.rollingBands;
        if (!bands || bands.length === 0 || !analyticsState.rollingEnabled) return;
        if (!this._container) return;

        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        const yRange = this.getYRange();
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin) || !yRange) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const ySpan = Math.max(1e-9, yRange.max - yRange.min);

        const toX = (ms: number) => plotLeft + ((ms - xMin) / (xMax - xMin)) * plotWidth;
        const toY = (v: number) => plotBottom - ((v - yRange.min) / ySpan) * plotHeight;

        ctx.save();
        const rollingPalette = getChartPalette();
        for (const band of bands) {
            const n = band.ts.length;
            if (n < 2) continue;
            const bandColor = band.color || getSeriesColor(band.column, uiState.selectedCols.indexOf(band.column));

            // 2-sigma band (lighter)
            ctx.fillStyle = this._applyAlphaToColor(bandColor, 0.18) || rollingPalette.rollingBandOuter;
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < n; i++) {
                const v = band.upper2[i];
                if (v == null) continue;
                const px = toX(band.ts[i]); const py = toY(v);
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            for (let i = n - 1; i >= 0; i--) {
                const v = band.lower2[i];
                if (v == null) continue;
                ctx.lineTo(toX(band.ts[i]), toY(v));
            }
            ctx.closePath();
            ctx.fill();

            // 1-sigma band (slightly darker)
            ctx.fillStyle = this._applyAlphaToColor(bandColor, 0.32) || rollingPalette.rollingBandInner;
            ctx.beginPath();
            started = false;
            for (let i = 0; i < n; i++) {
                const v = band.upper1[i];
                if (v == null) continue;
                const px = toX(band.ts[i]); const py = toY(v);
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            for (let i = n - 1; i >= 0; i--) {
                const v = band.lower1[i];
                if (v == null) continue;
                ctx.lineTo(toX(band.ts[i]), toY(v));
            }
            ctx.closePath();
            ctx.fill();

            // Mean line
            ctx.strokeStyle = this._applyAlphaToColor(bandColor, 0.9) || rollingPalette.rollingMeanStroke;
            ctx.lineWidth = 1.5 * Math.min(scale.x, scale.y);
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            started = false;
            for (let i = 0; i < n; i++) {
                const v = band.mean[i];
                if (v == null) continue;
                const px = toX(band.ts[i]); const py = toY(v);
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    private _renderAnomalyRegionsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const regions = analyticsState.anomalyRegions;
        if (!regions || regions.length === 0 || !analyticsState.anomalyEnabled) return;
        if (!this._container) return;

        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin)) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);

        ctx.save();
        const anomalyPalette = getChartPalette();
        ctx.lineWidth = 1 * Math.min(scale.x, scale.y);

        if (analyticsState.anomalyGlobalEnabled && analyticsState.anomalySummaryStats) {
            const mergedRanges = regions
                .map((region) => [Math.max(xMin, region.start_ms), Math.min(xMax, region.end_ms)] as const)
                .filter(([start, end]) => start < end)
                .sort((a, b) => a[0] - b[0]);
            const unionRanges: Array<[number, number]> = [];
            for (const [start, end] of mergedRanges) {
                const prev = unionRanges[unionRanges.length - 1];
                if (prev && start <= prev[1]) prev[1] = Math.max(prev[1], end);
                else unionRanges.push([start, end]);
            }
            ctx.fillStyle = this._applyAlphaToColor(anomalyPalette.anomalyStroke, 0.09);
            for (const [rStart, rEnd] of unionRanges) {
                const sx = plotLeft + ((rStart - xMin) / (xMax - xMin)) * plotWidth;
                const ex = plotLeft + ((rEnd - xMin) / (xMax - xMin)) * plotWidth;
                ctx.fillRect(sx, plotTop, Math.max(2, ex - sx), plotHeight);
            }
        }

        for (const region of regions) {
            const rStart = Math.max(xMin, region.start_ms);
            const rEnd = Math.min(xMax, region.end_ms);
            if (rStart >= rEnd) continue;

            const sx = plotLeft + ((rStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((rEnd - xMin) / (xMax - xMin)) * plotWidth;
            const w = Math.max(2, ex - sx);
            const regionColor = getSeriesColor(region.column, uiState.selectedCols.indexOf(region.column));

            ctx.fillStyle = this._applyAlphaToColor(regionColor, 0.16) || anomalyPalette.anomalyFill;
            ctx.strokeStyle = this._applyAlphaToColor(regionColor, 0.55) || anomalyPalette.anomalyStroke;
            ctx.fillRect(sx, plotTop, w, plotHeight);
            ctx.strokeRect(sx, plotTop, w, plotHeight);
        }
        ctx.restore();
    }

    private _applyAlphaToColor(color: string, alpha: number): string {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        }
        if (color.startsWith('rgb(')) {
            return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
        }
        return color;
    }

    private _renderAdaptiveFilterLinesToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const filters = Array.isArray(uiState.adaptiveLineFilters) ? uiState.adaptiveLineFilters : [];
        const pending = uiState.pendingAdaptivePoint;
        if (filters.length === 0 && !pending) return;
        if (!this._container) return;

        const visibleCols = new Set(uiState.selectedCols || []);
        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        const yRange = this.getYRange();
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin) || !yRange) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const strokeScale = Math.min(scale.x, scale.y);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([8 * strokeScale, 6 * strokeScale]);
        const adaptivePalette = getChartPalette();

        for (const filter of filters) {
            if (!visibleCols.has(filter?.column)) continue;
            const segStart = Math.max(xMin, Math.min(Number(filter.x1), Number(filter.x2)));
            const segEnd = Math.min(xMax, Math.max(Number(filter.x1), Number(filter.x2)));
            if (!Number.isFinite(segStart) || !Number.isFinite(segEnd) || !(segEnd > segStart)) continue;
            const y1 = buildAdaptiveLineY(filter, segStart);
            const y2 = buildAdaptiveLineY(filter, segEnd);
            if (!Number.isFinite(y1!) || !Number.isFinite(y2!)) continue;
            const sx = plotLeft + ((segStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((segEnd - xMin) / (xMax - xMin)) * plotWidth;
            const sy = plotBottom - ((y1! - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
            const ey = plotBottom - ((y2! - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
            const stroke = filter.keepAbove ? adaptivePalette.keepAboveStroke : adaptivePalette.keepBelowStroke;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2 * strokeScale;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            const label = `${filter.column} ${filter.keepAbove ? 'keep above' : 'keep below'}`;
            ctx.fillStyle = stroke;
            ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, Math.min(ex, plotRight - 140 * strokeScale), Math.min(sy, ey) - 4 * strokeScale);
        }

        if (pending && visibleCols.has(pending.column)) {
            const px = Number(pending.x);
            const py = Number(pending.y);
            const hasTwoPoints = Number.isFinite(pending.x2) && Number.isFinite(pending.y2);
            if (hasTwoPoints) {
                // Draw preview line between the two pending points.
                const px2 = Number(pending.x2);
                const py2 = Number(pending.y2);
                const toSx = (v: number) => plotLeft + ((v - xMin) / (xMax - xMin)) * plotWidth;
                const toSy = (v: number) => plotBottom - ((v - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
                const sx1 = toSx(px); const sy1 = toSy(py);
                const sx2 = toSx(px2); const sy2 = toSy(py2);
                if (Number.isFinite(sx1) && Number.isFinite(sy1) && Number.isFinite(sx2) && Number.isFinite(sy2)) {
                    ctx.setLineDash([6 * strokeScale, 4 * strokeScale]);
                    ctx.strokeStyle = adaptivePalette.pendingPoint;
                    ctx.lineWidth = 2 * strokeScale;
                    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
                    // Draw dots at both endpoints.
                    ctx.setLineDash([]);
                    for (const [ex, ey] of [[sx1, sy1], [sx2, sy2]] as [number, number][]) {
                        ctx.fillStyle = adaptivePalette.pendingPoint;
                        ctx.beginPath(); ctx.arc(ex, ey, Math.max(3, 4 * strokeScale), 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = adaptivePalette.pendingPointBorder; ctx.lineWidth = Math.max(1, 1.5 * strokeScale); ctx.stroke();
                    }
                }
            } else if (Number.isFinite(px) && Number.isFinite(py) && px >= xMin && px <= xMax) {
                const sx = plotLeft + ((px - xMin) / (xMax - xMin)) * plotWidth;
                const sy = plotBottom - ((py - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
                if (Number.isFinite(sx) && Number.isFinite(sy)) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = adaptivePalette.pendingPoint;
                    ctx.beginPath();
                    ctx.arc(sx, sy, Math.max(3, 4 * strokeScale), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = adaptivePalette.pendingPointBorder;
                    ctx.lineWidth = Math.max(1, 1.5 * strokeScale);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    /** Render annotations (notes, bookmarks) on the overlay. */
    private _renderAnnotationsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const timeAnnotations = getAnnotationsForPage('timeseries');
        if (!timeAnnotations || timeAnnotations.length === 0) return;
        if (!this._container) return;

        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin)) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const strokeScale = Math.min(scale.x, scale.y);

        ctx.save();
        ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, sans-serif`;

        for (const ann of timeAnnotations) {
            if (!ann.timeRange) continue;
            const start = ann.timeRange.start;
            const end = ann.timeRange.end;

            // Skip if completely outside view
            if (end < xMin || start > xMax) continue;

            const visStart = Math.max(xMin, start);
            const visEnd = Math.min(xMax, end);
            const sx = plotLeft + ((visStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((visEnd - xMin) / (xMax - xMin)) * plotWidth;

            const color = ann.color || '#ffc041';

            if (ann.type === 'bookmark' || start === end) {
                // Bookmark: vertical line
                ctx.strokeStyle = color;
                ctx.lineWidth = 2 * strokeScale;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(sx, plotTop);
                ctx.lineTo(sx, plotBottom);
                ctx.stroke();

                // Bookmark marker
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(sx, plotTop);
                ctx.lineTo(sx - 6 * strokeScale, plotTop - 10 * strokeScale);
                ctx.lineTo(sx + 6 * strokeScale, plotTop - 10 * strokeScale);
                ctx.closePath();
                ctx.fill();

                // Title
                const annotationPalette = getChartPalette();
                ctx.fillStyle = annotationPalette.annotationLabel;
                ctx.textAlign = 'left';
                ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
            } else if (ann.type === 'note' || ann.type === 'region') {
                // Note/region: shaded area
                ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('##', '#');
                if (typeof ctx.fillStyle !== 'string' || !ctx.fillStyle.includes('rgba')) {
                    ctx.fillStyle = `${color}26`; // 15% opacity
                }
                ctx.fillRect(sx, plotTop, ex - sx, plotHeight);

                // Border
                ctx.strokeStyle = color;
                ctx.lineWidth = 1 * strokeScale;
                ctx.setLineDash([4 * strokeScale, 2 * strokeScale]);
                ctx.strokeRect(sx, plotTop, ex - sx, plotHeight);
                ctx.setLineDash([]);

                // Title label
                ctx.fillStyle = color;
                ctx.textAlign = 'left';
                ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
            }
        }

        ctx.restore();
    }

    /* ── Mouse selection zoom ───────────────────────────── */

    private _initMouseSelectionZoom(): void {
        if (!this._container) return;
        const container = this._container;

        this._selectionBox = initBoxZoom({
            container,
            grid: this._currentGrid,
            getXRange: () => ({ min: this._xMin ?? 0, max: this._xMax ?? 0 }),
            getYRange: () => this.getYRange?.() ?? { min: 0, max: 0 },
            onZoom: (view: ViewSnapshot) => this.onZoomCallback?.(view, 'user'),
            // Box-zoom owns pointer events on the chart container. The
            // chart rebalances zoom/pan on every pointerup, which would
            // otherwise consume the event before it bubbles to a child
            // legend button. To make the in-chart legend toggle work
            // with a plain left-click, we ignore pointer events whose
            // target sits inside the floating legend overlay.
            shouldIgnore: (e) =>
                this._drawMode !== 'none'
                || e.ctrlKey
                || this._container?.classList.contains('is-shift-active') === true
                || this._isLegendPointerTarget(e.target as Element | null),
            onDblClick: () => this.onZoomOutCallback?.(),
        });
    }

    /**
     * True when the pointer event's DOM target is the floating legend
     * overlay (or one of its descendants). Used by the chart-level
     * pointerdown/box-zoom ignore predicate so the legend's own click
     * handler can toggle trace visibility without a Shift modifier.
     */
    private _isLegendPointerTarget(target: Element | null): boolean {
        if (!target || typeof target.closest !== 'function') return false;
        return target.closest('.timeseries-legend-overlay') !== null;
    }

    /* ── Ctrl+drag pan ─────────────────────────────────── */

    /**
     * Wire up a Ctrl/Meta + left-button drag that pans the visible view.
     * The panning shifts the current xMin/xMax in time and (when a y
     * range is known) the yMin/yMax, then forwards the new view through
     * `onZoomCallback` with `sourceKind = 'pan'` so the page controller
     * treats it the same as a regular user zoom for fetch/refresh
     * purposes.
     */
    private _initCtrlPan(): void {
        if (!this._container) return;
        const container = this._container;
        initCtrlPan({
            container,
            grid: this._currentGrid,
            getXRange: () => ({ min: this._xMin ?? 0, max: this._xMax ?? 0 }),
            getYRange: () => this.getYRange?.() ?? null,
            // Skip pan when the drag starts on the legend overlay so
            // Ctrl+click within the legend doesn't pan the chart under
            // the overlay (and so future legend interactions still
            // work).
            shouldIgnore: (e: PointerEvent) =>
                this._drawMode !== 'none'
                || this._isLegendPointerTarget(e.target as Element | null),
            onPan: (view) => {
                const xMin = Number(view.xMin);
                const xMax = Number(view.xMax);
                if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return;
                const snapshot: ViewSnapshot = {
                    xMin,
                    xMax,
                    yMin: 'yMin' in view && Number.isFinite((view as { yMin?: number }).yMin!)
                        ? (view as { yMin: number }).yMin
                        : null,
                    yMax: 'yMax' in view && Number.isFinite((view as { yMax?: number }).yMax!)
                        ? (view as { yMax: number }).yMax
                        : null,
                };
                this.onZoomCallback?.(snapshot, 'pan');
            },
        });
    }

    /* ── Export internals ───────────────────────────────── */

    private _getExportViewport() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this._container?.getBoundingClientRect?.();
        const cssWidth = Math.max(1, Math.round(rect?.width ?? this._overlayCanvas?.width ?? 1));
        const cssHeight = Math.max(1, Math.round(rect?.height ?? this._overlayCanvas?.height ?? 1));
        return { cssWidth, cssHeight, width: Math.max(1, Math.round(cssWidth * dpr)), height: Math.max(1, Math.round(cssHeight * dpr)), dpr };
    }

    private _getExportDomains() {
        const xMin = Number.isFinite(this._xMin) ? this._xMin! : this._lastXDomainMin;
        const xMax = Number.isFinite(this._xMax) ? this._xMax! : this._lastXDomainMax;
        const yRange = this.getYRange();
        const yMin = yRange?.min;
        const yMax = yRange?.max;
        if (!Number.isFinite(xMin!) || !Number.isFinite(xMax!) || xMax! <= xMin!) return null;
        if (!Number.isFinite(yMin!) || !Number.isFinite(yMax!) || yMax! <= yMin!) return null;
        const ySpan = yMax! - yMin!;
        const pad = ySpan * 0.04;
        return { xMin: xMin!, xMax: xMax!, yMin: yMin! - pad, yMax: yMax! + pad };
    }

    private async _getCombinedExportCanvas(includeDrawings: boolean): Promise<HTMLCanvasElement | null> {
        if (!this._container) return null;
        const domains = this._getExportDomains();
        if (!domains) return null;
        const viewport = this._getExportViewport();
        const outCanvas = document.createElement('canvas');
        outCanvas.width = viewport.width;
        outCanvas.height = viewport.height;
        this._renderExportChartToCanvas(outCanvas, viewport, domains, includeDrawings);
        return outCanvas;
    }

    private _renderExportChartToCanvas(
        canvas: HTMLCanvasElement,
        viewport: { cssWidth: number; cssHeight: number; width: number; height: number },
        domains: { xMin: number; xMax: number; yMin: number; yMax: number },
        includeDrawings: boolean,
    ): void {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { cssWidth, cssHeight, width, height } = viewport;
        const scale = width / cssWidth;
        const palette = getChartPalette();
        const bg = palette.background;
        const surface2 = palette.surfaceElevated;
        const border = palette.border;
        const borderHi = palette.borderHi;
        const text = palette.text;
        const textDim = palette.textDim;
        const accentStroke = palette.accent;

        ctx.save();
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        const grid = scaleGridLayout(this._updateCurrentGrid(), scale);
        const plotLeft = grid.left;
        const plotTop = grid.top;
        const plotRight = Math.max(plotLeft + 1, width - grid.right);
        const plotBottom = Math.max(plotTop + 1, height - grid.bottom);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const xSpan = domains.xMax - domains.xMin;
        const ySpan = domains.yMax - domains.yMin;

        ctx.save();
        ctx.beginPath();
        ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
        ctx.clip();
        const seriesList = Array.isArray(this._lastSeriesList) ? this._lastSeriesList : [];
        for (const s of seriesList) {
            if (!s || s.type !== 'line') continue;
            if (s.visible === false) continue;
            const pts = Array.isArray(s.data) ? s.data : [];
            if (pts.length === 0) continue;
            ctx.beginPath();
            ctx.strokeStyle = s.color || accentStroke;
            ctx.lineWidth = 1.5 * scale;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            let started = false;
            for (const p of pts) {
                const x = Number(p?.[0]);
                const y = Number(p?.[1]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const px = plotLeft + ((x - domains.xMin) / xSpan) * plotWidth;
                const py = plotBottom - ((y - domains.yMin) / ySpan) * plotHeight;
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            if (started) ctx.stroke();
        }
        ctx.restore();

        // Axes
        const fontSize = Math.max(10, Math.round(12 * scale));
        ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.strokeStyle = border;
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(plotLeft, plotTop);
        ctx.lineTo(plotLeft, plotBottom);
        ctx.lineTo(plotRight, plotBottom);
        ctx.stroke();

        const tickLen = 6 * scale;
        const labelPad = 4 * scale;

        // Y ticks
        const yTicks = niceLinearTicks(domains.yMin, domains.yMax, 6);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = textDim;
        for (const y of yTicks) {
            const py = plotBottom - ((y - domains.yMin) / ySpan) * plotHeight;
            ctx.strokeStyle = borderHi; ctx.globalAlpha = 0.35;
            ctx.beginPath(); ctx.moveTo(plotLeft, py); ctx.lineTo(plotRight, py); ctx.stroke();
            ctx.globalAlpha = 1; ctx.strokeStyle = border;
            ctx.beginPath(); ctx.moveTo(plotLeft - tickLen, py); ctx.lineTo(plotLeft, py); ctx.stroke();
            ctx.fillText(formatTwoDecimals(y), plotLeft - tickLen - labelPad, py);
        }

        // X ticks
        const xTicks = niceTimeTicks(domains.xMin, domains.xMax, 6);
        const spanMs = domains.xMax - domains.xMin;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = textDim;
        for (const x of xTicks) {
            const px = plotLeft + ((x - domains.xMin) / xSpan) * plotWidth;
            ctx.strokeStyle = borderHi; ctx.globalAlpha = 0.25;
            ctx.beginPath(); ctx.moveTo(px, plotTop); ctx.lineTo(px, plotBottom); ctx.stroke();
            ctx.globalAlpha = 1; ctx.strokeStyle = border;
            ctx.beginPath(); ctx.moveTo(px, plotBottom); ctx.lineTo(px, plotBottom + tickLen); ctx.stroke();
            ctx.fillText(formatTimeTick(x, spanMs), px, plotBottom + tickLen + labelPad);
        }

        // Title + axis names
        const title = String(this._chartTitle ?? '').trim();
        if (title) {
            ctx.save(); ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.font = `${Math.max(12, Math.round(14 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.fillText(title, width / 2, Math.max(2 * scale, (plotTop - (Math.max(12, Math.round(14 * scale)) + 2 * scale)) / 2));
            ctx.restore();
        }
        const xAxisName = String(this._xAxisLabel ?? '').trim();
        if (xAxisName) {
            ctx.save(); ctx.fillStyle = textDim; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(xAxisName, width / 2, height - fontSize - 2 * scale); ctx.restore();
        }
        const yAxisName = String(this._yAxisLabel ?? '').trim();
        if (yAxisName) {
            ctx.save(); ctx.fillStyle = textDim;
            ctx.translate(Math.max(10 * scale, fontSize), (plotTop + plotBottom) / 2);
            ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(yAxisName, 0, 0); ctx.restore();
        }

        // Legend
        const legendEntries = this._getLegendEntries().filter((entry) => entry.visible);
        if (legendEntries.length > 0) {
            const pad2 = 8 * scale;
            const gap = 6 * scale;
            const sw = 18 * scale;
            const lh = Math.max(14 * scale, fontSize + 2 * scale);
            let maxTextW = 0;
            for (const e of legendEntries) maxTextW = Math.max(maxTextW, ctx.measureText(e.name).width);
            const boxW = pad2 * 2 + sw + gap + maxTextW;
            const boxH = pad2 * 2 + legendEntries.length * lh;
            const x0 = Math.max(plotLeft, plotRight - boxW - 6 * scale);
            const y0 = plotTop + 6 * scale;
            ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = surface2; ctx.fillRect(x0, y0, boxW, boxH);
            ctx.globalAlpha = 1; ctx.strokeStyle = border; ctx.lineWidth = 1 * scale; ctx.strokeRect(x0, y0, boxW, boxH);
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = text;
            for (let i = 0; i < legendEntries.length; i++) {
                const e = legendEntries[i];
                const cy = y0 + pad2 + i * lh + lh / 2;
                ctx.strokeStyle = e.color; ctx.lineWidth = 2 * scale;
                ctx.beginPath(); ctx.moveTo(x0 + pad2, cy); ctx.lineTo(x0 + pad2 + sw, cy); ctx.stroke();
                ctx.fillText(e.name, x0 + pad2 + sw + gap, cy);
            }
            ctx.restore();
        }

        if (includeDrawings) {
            this._renderDrawingsToCtx(ctx, { x: width / cssWidth, y: height / cssHeight });
        }
        ctx.restore();
    }

    private _renderDrawingsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const allDraws = [...this._drawings];
        if (this._currentDraw) allDraws.push(this._currentDraw);
        const strokeScale = Math.min(scale.x, scale.y);
        for (const item of allDraws) {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width * strokeScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const sx = item.startX * scale.x;
            const sy = item.startY * scale.y;
            const ex = item.endX * scale.x;
            const ey = item.endY * scale.y;
            if (item.type === 'arrow') {
                const headlen = 10 * strokeScale;
                const angle = Math.atan2(ey - sy, ex - sx);
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            } else if (item.type === 'box') {
                ctx.beginPath();
                ctx.rect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
                ctx.stroke();
            }
        }
    }

}
