/**
 * DataChart — ChartGPU WebGPU adapter with drawing overlay,
 * mouse-selection zoom, and PNG / SVG / HTML export.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { DEBUG, dbg } from '../debug.js';
import { downloadUrl, downloadBlob } from '../utils/dom.js';
import { defaultGpuPowerPreference } from '../utils/platform.js';
import { formatTwoDecimals } from '../formatUtils.js';
import { datasetState } from '../store/datasetState.js';
import { uiState } from '../store/uiState.js';
import type {
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

import { baseSeriesName } from './colorScale.js';
import { CHART_PALETTES, getSetting } from '../utils/settings.js';
import { getChartPalette, getResolvedTheme, onThemeChange, type ResolvedTheme } from '../utils/theme.js';
import {
    niceLinearTicks, niceTimeTicks, formatTimeTick,
} from './ticks.js';
import {
    type GridLayout,
    createCanvasOverlay, ensureRelativePosition,
    initBoxZoom,
    initCtrlPan,
} from './chartInteractions.js';
import { ChartOverlays } from './chartOverlays.js';
import { buildLegendEntries } from './legendInteraction.js';
import { LegendOverlayController } from './legendOverlayController.js';
import { DrawingController } from './drawingController.js';
import { TextOverlayController } from './textOverlayController.js';
import { formatTimeSeriesTooltip } from './timeSeriesTooltip.js';
import { renderColorScaleLegend } from './colorScaleLegend.js';
import { buildTimeSeriesDataModel } from './timeSeriesDataModel.js';
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
    _textOverlays: TextOverlayController | null = null;

    _overlayCanvas: HTMLCanvasElement | null = null;
    _overlayCtx: CanvasRenderingContext2D | null = null;
    _drawingResizeObserver: ResizeObserver | null = null;
    _chartResizeObserver: ResizeObserver | null = null;
    _drawingController: DrawingController | null = null;
    _overlays: ChartOverlays | null = null;
    _lastChartOptions: ChartGPUOptions | null = null;
    _lastAppliedTheme: ResolvedTheme | null = null;
    _themeUnsub: (() => void) | null = null;
    _currentGrid: GridLayout = { ...DEFAULT_CHART_GRID };
    _legendOverlay: LegendOverlayController | null = null;

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
        this._drawingController?.detach();
        this._drawingResizeObserver?.disconnect();
        this._drawingResizeObserver = null;
        this._chartResizeObserver?.disconnect();
        this._chartResizeObserver = null;
        this._themeUnsub?.();
        this._themeUnsub = null;
        this._overlays = null;
        this._textOverlays?.destroy();
        this._textOverlays = null;
        this._legendOverlay?.destroy();
        this._legendOverlay = null;
        this.chartInstance = null;
    }

    /**
     * Full disposal — tears down the chart instance, canvas overlays, and all
     * bound elements. Safe to call when the GPU device is lost or the chart
     * container is being removed from the DOM.
     */
    deepDispose(): void {
        this._drawingController?.detach();
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

        this._legendOverlay?.destroy();
        this._legendOverlay = null;
        this._textOverlays?.destroy();
        this._textOverlays = null;
        this._container = null;
        // Release ChartGPU instance (guards against device-lost scenarios).
        try {
            this.chartInstance?.dispose?.();
        } catch (_) {
            // dispose() may throw if the GPU device was already lost.
        }
        this.chartInstance = null;

        // Clear drawing state.
        this._drawingController?.reset();
        this._drawingController = null;

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
        this._getDrawingController().setMode(mode, color, width);
    }

    clearDrawings(): void {
        this._drawingController?.clear();
    }

    requestOverlayRender(): void {
        this._renderDrawings();
    }

    resize(): void {
        this.chartInstance?.resize?.();
        this._legendOverlay?.reflow();
        this._renderDrawings();
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
        const model = buildTimeSeriesDataModel({
            data: dataObj,
            columns,
            visibilityByName: this._getVisibilityByBaseNameFromChart(),
            selectedColorColumn: uiState.selectedColorColumn,
            numericColumns: datasetState.numericCols,
            showMarkers: dataObj._meta?.downsampled === false,
        });
        this._lastSeriesList = model.series;
        this._lastDisplayYValues = model.displayYValues;
        this._lastXDomainMin = model.xDomainMin;
        this._lastXDomainMax = model.xDomainMax;
        renderColorScaleLegend(uiState.selectedColorColumn, model.hasColorCandidates ? model.colorScaleInfo : null);

        if (model.dataYMin !== null && model.dataYMax !== null) {
            this._lastDataYMin = model.dataYMin;
            this._lastDataYMax = model.dataYMax;
            this.onYRangeCallback?.(model.dataYMin, model.dataYMax, 'data');
        }

        if (model.series.length > 0 && model.xDomainMin !== null && model.xDomainMax !== null) {
            const xDomainMin = model.xDomainMin;
            const xDomainMax = model.xDomainMax;
            const tooltipFormatter = (params: unknown): string => formatTimeSeriesTooltip(params, {
                min: xDomainMin,
                max: xDomainMax,
            });

            const nextOption = {
                animation: false,
                grid: { ...this._updateCurrentGrid() },
                theme: this._buildChartGpuTheme(),
                palette: this._getChartColorPalette(),
                xAxis: {
                    type: 'time' as const,
                    min: xDomainMin,
                    max: xDomainMax,
                    tickFormatter: (value: number) => formatTimeTick(
                        value,
                        Math.max(1, xDomainMax - xDomainMin),
                    ),
                },
                yAxis: this._buildYAxisOption(),
                legend: { show: false },
                tooltip: { show: true, trigger: 'axis', formatter: tooltipFormatter },
                series: model.series,
                annotations: model.annotations,
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
        const overlay = this._getLegendOverlay();
        overlay?.sync(this._getLegendEntries());
    }

    private _getLegendOverlay(): LegendOverlayController | null {
        const container = this._container;
        if (!container) return null;
        if (this._legendOverlay && this._legendOverlay.container !== container) {
            this._legendOverlay.destroy();
            this._legendOverlay = null;
        }
        if (!this._legendOverlay) {
            this._legendOverlay = new LegendOverlayController(container, {
                onToggleTrace: (name) => this._toggleLegendTrace(name),
                suppressChartHover: () => this._suppressChartHover(),
            });
        }
        return this._legendOverlay;
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

    private _getDrawingController(): DrawingController {
        if (!this._drawingController) {
            this._drawingController = new DrawingController(() => this._renderDrawings());
        }
        return this._drawingController;
    }

    /* ── Text overlays ──────────────────────────────────── */

    private _initTextOverlays(): void {
        if (!this._container) return;
        const overlays = this._getTextOverlays();
        overlays.init(this._container, this._getTextOverlayContent());
    }

    private _syncTextOverlays(): void {
        this._textOverlays?.sync(this._getTextOverlayContent());
    }

    private _getTextOverlays(): TextOverlayController {
        if (!this._textOverlays) this._textOverlays = new TextOverlayController();
        return this._textOverlays;
    }

    private _getTextOverlayContent(): { title: string; xLabel: string; yLabel: string } {
        return { title: this._chartTitle, xLabel: this._xAxisLabel, yLabel: this._yAxisLabel };
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
        this._getDrawingController().attach(canvas);

        this._overlays = new ChartOverlays({
            getXMin: () => this._xMin,
            getXMax: () => this._xMax,
            getContainer: () => this._container,
            getOverlayCanvas: () => this._overlayCanvas,
            getGrid: () => this._currentGrid,
            getYRange: () => this.getYRange(),
            getPendingAdaptivePoint: () => uiState.pendingAdaptivePoint,
        });

    }

    /* ── Drawing render ─────────────────────────────────── */

    private _renderDrawings(): void {
        if (!this._overlayCtx || !this._overlayCanvas) return;
        const ctx = this._overlayCtx;
        ctx.clearRect(0, 0, this._overlayCanvas.width, this._overlayCanvas.height);
        this._overlays?.renderAll(ctx, { x: 1, y: 1 });
        this._drawingController?.render(ctx);
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
                this._drawingController?.isEnabled === true
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
                this._drawingController?.isEnabled === true
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
        this._drawingController?.render(ctx, scale);
    }

}
