/**
 * DataChart — ChartGPU WebGPU adapter with drawing overlay,
 * mouse-selection zoom, and PNG / SVG / HTML export.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { DEBUG, dbg } from '../debug.js';
import { downloadUrl, downloadBlob } from '../utils/dom.js';
import { defaultGpuPowerPreference } from '../utils/platform.js';
import { datasetState } from '../store/datasetState.js';
import { uiState } from '../store/uiState.js';
import type { AdaptiveLineFilter } from '../types/store.js';
import type {
    ChartTextOverlays,
    FilteredDataObject,
    RobustDisplayRangeOptions,
    ViewSnapshot,
} from '../types/chart.js';
import type { DataObject } from '../types/api.js';
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
import { getResolvedTheme, onThemeChange, type ResolvedTheme } from '../utils/theme.js';
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
import { renderColorScaleLegend } from './colorScaleLegend.js';
import { buildTimeSeriesDataModel } from './timeSeriesDataModel.js';
import { buildTimeSeriesChartOptions } from './timeSeriesChartOptions.js';
import { getChartExportDomains, getChartExportViewport, type ChartExportDomains, type ChartExportViewport } from './chartExportLayout.js';
import { renderChartExportCanvas } from './chartExportCanvasRenderer.js';
import { computeZoomPercentRange } from './zoomRangePolicy.js';
import { computeDisplayYRange } from './displayYRangePolicy.js';
import { mapCssPointToChartData } from './chartCoordinateMapper.js';
import { buildChartGpuTheme, getChartGpuColorPalette, withChartGpuTheme } from './chartThemeOptions.js';
import { getVisibilityByBaseName } from './seriesVisibility.js';
import { toggleLegendSeriesVisibility } from './legendVisibilityPolicy.js';
import { DEFAULT_CHART_GRID } from './gridLayout.js';
import { buildTimeSeriesAxisPresentation, type TimeSeriesYAxisOption } from './timeSeriesAxisPresentation.js';
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
    _disposeBoxZoom: (() => void) | null = null;
    _disposeCtrlPan: (() => void) | null = null;
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
    _activeColumns: readonly string[] = [];
    _adaptiveLineFilters: readonly AdaptiveLineFilter[] = [];
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
    _settingsUnsub: (() => void) | null = null;
    _lastDataInput: {
        dataObj: FilteredDataObject;
        columns: string[];
        colorColumn: string | null;
        adaptiveLines: AdaptiveLineFilter[];
    } | null = null;
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
        this._disposeInteractions();
        this._drawingController?.detach();
        this._drawingResizeObserver?.disconnect();
        this._drawingResizeObserver = null;
        this._chartResizeObserver?.disconnect();
        this._chartResizeObserver = null;
        this._themeUnsub?.();
        this._themeUnsub = null;
        this._settingsUnsub?.();
        this._settingsUnsub = null;
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
        this._disposeInteractions();
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
        this._lastDataInput = null;

        this._themeUnsub?.();
        this._themeUnsub = null;
        this._settingsUnsub?.();
        this._settingsUnsub = null;
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
        this._disposeInteractions();
        this._drawingController?.detach();
        const drawingResizeObserver = this._drawingResizeObserver;
        drawingResizeObserver?.disconnect();
        this._drawingResizeObserver = null;
        const chartResizeObserver = this._chartResizeObserver;
        chartResizeObserver?.disconnect();
        this._chartResizeObserver = null;
        this._overlayCanvas?.remove();
        this._overlayCanvas = null;
        this._overlayCtx = null;
        this._overlays = null;
        this._textOverlays?.destroy();
        this._textOverlays = null;
        this._legendOverlay?.destroy();
        this._legendOverlay = null;
        const themeUnsub = this._themeUnsub;
        themeUnsub?.();
        this._themeUnsub = null;
        this._settingsUnsub?.();
        this._settingsUnsub = null;
        try { this.chartInstance?.dispose?.(); } catch { /* already disposed */ }
        this.chartInstance = null;
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
        this._chartResizeObserver = new ResizeObserver(() => this.resize());
        this._chartResizeObserver.observe(container);
        this._initDrawingOverlay();
        this._initTextOverlays();
        this._syncLegendOverlay();
        this._initMouseSelectionZoom();
        this._initCtrlPan();
        this._themeUnsub = onThemeChange((next: ResolvedTheme) => {
            this._onThemeChanged(next);
        });
        const onSettingsChanged = () => {
            if (!this._lastDataInput) return;
            const { dataObj, columns, colorColumn, adaptiveLines } = this._lastDataInput;
            this.updateDataMulti(dataObj, columns, colorColumn, adaptiveLines);
        };
        document.addEventListener('edatime:settings-changed', onSettingsChanged);
        this._settingsUnsub = () => document.removeEventListener('edatime:settings-changed', onSettingsChanged);
        requestAnimationFrame(() => this.resize());
    }

    private _onThemeChanged(theme: ResolvedTheme): void {
        if (this.chartInstance && this._lastChartOptions && theme !== this._lastAppliedTheme) {
            const nextOption = withChartGpuTheme(this._lastChartOptions as Record<string, unknown>);
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
        const rect = this._container.getBoundingClientRect();
        return mapCssPointToChartData({
            clientX,
            clientY,
            rect,
            grid: this._updateCurrentGrid(),
            xRange: Number.isFinite(this._xMin) && Number.isFinite(this._xMax)
                ? { min: this._xMin!, max: this._xMax! }
                : null,
            yRange: this.getYRange(),
        });
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

    updateDataMulti(
        dataObj: FilteredDataObject,
        columns: string[],
        colorColumn: string | null = null,
        adaptiveLines: readonly AdaptiveLineFilter[] = [],
    ): void {
        this._lastDataInput = {
            dataObj,
            columns: [...columns],
            colorColumn,
            adaptiveLines: adaptiveLines.map((filter) => ({ ...filter })),
        };
        this._activeColumns = [...columns];
        this._adaptiveLineFilters = adaptiveLines.map((filter) => ({ ...filter }));
        this._overlays?.setSelectedColumns(this._activeColumns);
        if (!this.chartInstance) return;
        const model = buildTimeSeriesDataModel({
            data: dataObj,
            columns,
            visibilityByName: this._getVisibilityByBaseNameFromChart(),
            selectedColorColumn: colorColumn,
            numericColumns: datasetState.numericCols,
            showMarkers: dataObj._meta?.downsampled === false,
        });
        this._lastSeriesList = model.series;
        this._lastDisplayYValues = model.displayYValues;
        this._lastXDomainMin = model.xDomainMin;
        this._lastXDomainMax = model.xDomainMax;
        renderColorScaleLegend(colorColumn, model.hasColorCandidates ? model.colorScaleInfo : null);

        if (model.dataYMin !== null && model.dataYMax !== null) {
            this._lastDataYMin = model.dataYMin;
            this._lastDataYMax = model.dataYMax;
            this.onYRangeCallback?.(model.dataYMin, model.dataYMax, 'data');
        }

        if (model.series.length > 0 && model.xDomainMin !== null && model.xDomainMax !== null) {
            const xDomainMin = model.xDomainMin;
            const xDomainMax = model.xDomainMax;
            const nextOption = buildTimeSeriesChartOptions({
                grid: { ...this._updateCurrentGrid() },
                theme: this._buildChartGpuTheme(),
                palette: this._getChartColorPalette(),
                xDomain: { min: xDomainMin, max: xDomainMax },
                yAxis: this._buildYAxisOption(),
                series: model.series,
                annotations: model.annotations,
            });
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
        // box-zoom, or Ctrl-pan y motion), it becomes the base display
        // range. `computeDisplayYRange` deliberately keeps its small
        // headroom around that base range so data never touches the chart
        // edge, while still honoring the user-selected zoom rather than
        // reverting to the full data span.
        const displayBounds = this._computeRobustDisplayBounds();
        return buildTimeSeriesAxisPresentation({
            userMin: this._yMin, userMax: this._yMax,
            dataMin: this._lastDataYMin, dataMax: this._lastDataYMax,
            robustMin: displayBounds?.min ?? null, robustMax: displayBounds?.max ?? null,
            stackFromZero: this._stackFromZero, yAxisLabel: this._yAxisLabel,
        }).yAxis;
    }

    private _measureGrid(scale = 1): GridLayout {
        const displayBounds = this._computeRobustDisplayBounds();
        return buildTimeSeriesAxisPresentation({
            userMin: this._yMin, userMax: this._yMax,
            dataMin: this._lastDataYMin, dataMax: this._lastDataYMax,
            robustMin: displayBounds?.min ?? null, robustMax: displayBounds?.max ?? null,
            stackFromZero: this._stackFromZero, yAxisLabel: this._yAxisLabel, scale,
        }).grid;
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
        return getChartGpuColorPalette();
    }

    private _buildChartGpuTheme() {
        return buildChartGpuTheme();
    }

    private _getVisibilityByBaseNameFromChart(): Map<string, boolean> {
        return getVisibilityByBaseName(this.chartInstance?.options?.series, baseSeriesName);
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
        const nextSeries = toggleLegendSeriesVisibility(
            series,
            (rawName) => baseSeriesName(rawName) === name,
            currentEntry?.visible ?? true,
        );
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
            getAdaptiveLineFilters: () => this._adaptiveLineFilters,
            getPendingAdaptivePoint: () => uiState.pendingAdaptivePoint,
        });
        this._overlays.setSelectedColumns(this._activeColumns);

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

        const zoom = initBoxZoom({
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
        this._selectionBox = zoom;
        this._disposeBoxZoom = zoom.dispose;
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
        this._disposeCtrlPan = initCtrlPan({
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

    private _disposeInteractions(): void {
        this._disposeBoxZoom?.();
        this._disposeBoxZoom = null;
        this._disposeCtrlPan?.();
        this._disposeCtrlPan = null;
        this._selectionBox = null;
    }

    /* ── Export internals ───────────────────────────────── */

    private _getExportViewport(): ChartExportViewport {
        return getChartExportViewport(
            this._container?.getBoundingClientRect?.(),
            this._overlayCanvas,
            window.devicePixelRatio,
        );
    }

    private _getExportDomains(): ChartExportDomains | null {
        return getChartExportDomains(
            { min: this._xMin, max: this._xMax },
            { min: this._lastXDomainMin, max: this._lastXDomainMax },
            this.getYRange(),
        );
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
        viewport: ChartExportViewport,
        domains: ChartExportDomains,
        includeDrawings: boolean,
    ): void {
        renderChartExportCanvas({
            canvas,
            viewport,
            domains,
            grid: this._updateCurrentGrid(),
            series: this._lastSeriesList ?? [],
            labels: { title: this._chartTitle, xAxis: this._xAxisLabel, yAxis: this._yAxisLabel },
            legendEntries: this._getLegendEntries(),
            renderDrawings: includeDrawings ? (ctx, scale) => this._drawingController?.render(ctx, scale) : undefined,
        });
    }

}
