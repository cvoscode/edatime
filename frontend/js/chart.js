import { createChart } from '../libs/chartgpu/dist/index.js?v=3';
import { DEBUG, dbg } from './debug.js';

const COLORS = ['#00E5FF', '#FF0055', '#00FF00', '#FFFF00', '#FF00FF'];
const CHART_GRID = { left: 112, right: 20, top: 16, bottom: 36 };

function computeFiniteMinMax(xs) {
    if (!xs) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < xs.length; i++) {
        const v = Number(xs[i]);
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { min, max };
}

function niceNum(range, round) {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction;
    if (round) {
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
    } else {
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
}

function niceLinearTicks(min, max, count = 6) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
    const n = Math.max(2, Math.floor(count));
    const range = niceNum(max - min, false);
    const step = niceNum(range / (n - 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    // Prevent infinite loops in pathological floats.
    const guard = Math.max(2, Math.min(1024, Math.ceil((niceMax - niceMin) / step) + 2));
    for (let i = 0; i < guard; i++) {
        const v = niceMin + i * step;
        if (v > niceMax + step * 0.5) break;
        ticks.push(v);
    }
    return ticks;
}

function niceTimeTicks(minMs, maxMs, count = 6) {
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return [];
    const span = maxMs - minMs;
    const n = Math.max(2, Math.floor(count));
    const target = span / (n - 1);
    const steps = [
        1_000,
        2_000,
        5_000,
        10_000,
        30_000,
        60_000,
        2 * 60_000,
        5 * 60_000,
        10 * 60_000,
        30 * 60_000,
        60 * 60_000,
        2 * 60 * 60_000,
        6 * 60 * 60_000,
        12 * 60 * 60_000,
        24 * 60 * 60_000,
        2 * 24 * 60 * 60_000,
        7 * 24 * 60 * 60_000,
        30 * 24 * 60 * 60_000,
    ];
    const step = steps.find((s) => s >= target) ?? steps[steps.length - 1];
    const start = Math.ceil(minMs / step) * step;
    const ticks = [];
    const guard = Math.max(2, Math.min(2048, Math.ceil((maxMs - start) / step) + 3));
    for (let i = 0; i < guard; i++) {
        const t = start + i * step;
        if (t > maxMs + step * 0.25) break;
        ticks.push(t);
    }
    return ticks;
}

function formatTimeTick(ms, spanMs) {
    try {
        const d = new Date(ms);
        if (spanMs <= 2 * 60_000) {
            return new Intl.DateTimeFormat(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            }).format(d);
        }
        if (spanMs <= 2 * 24 * 60 * 60_000) {
            return new Intl.DateTimeFormat(undefined, {
                hour: '2-digit',
                minute: '2-digit',
            }).format(d);
        }
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(d);
    } catch (_) {
        return String(ms);
    }
}

export class DataChart {
    constructor(containerId, onZoomCallback, onYRangeCallback = null, onZoomOutCallback = null) {
        this.containerId = containerId;
        this.onZoomCallback = onZoomCallback; // called with (startMs, endMs, sourceKind) on zoom-in
        this.onYRangeCallback = onYRangeCallback;
        this.onZoomOutCallback = onZoomOutCallback; // called on double-click to go back one level
        this.chartInstance = null;
        this._xMin = null; // epoch-ms visible x-axis min
        this._xMax = null; // epoch-ms visible x-axis max
        this._container = null;
        this._dragState = null;
        this._selectionBox = null;
        this._yMin = null;
        this._yMax = null;
        this._yAuto = true;
        this._lastDataYMin = null;
        this._lastDataYMax = null;
        this._lastSeriesList = null;
        this._lastXDomainMin = null;
        this._lastXDomainMax = null;

        // Chart text
        this._chartTitle = '';
        this._xAxisLabel = '';
        this._yAxisLabel = '';
        this._titleEl = null;
        this._xLabelEl = null;
        this._yLabelEl = null;

        // Drawing state
        this._overlayCanvas = null;
        this._overlayCtx = null;
        this._drawings = [];
        this._currentDraw = null;
        this._drawMode = 'none'; // 'none', 'arrow', 'box'
        this._drawColor = '#ff0055';
        this._drawWidth = 2;
    }

    setChartText(title, xLabel, yLabel) {
        this._chartTitle = String(title ?? '').trim();
        this._xAxisLabel = String(xLabel ?? '').trim();
        this._yAxisLabel = String(yLabel ?? '').trim();
        this._syncTextOverlays();
    }

    setDrawMode(mode, color, width) {
        this._drawMode = mode;
        this._drawColor = color || this._drawColor;
        this._drawWidth = width || this._drawWidth;

        if (this._overlayCanvas) {
            this._overlayCanvas.style.pointerEvents = mode === 'none' ? 'none' : 'auto';
        }
    }

    clearDrawings() {
        this._drawings = [];
        this._currentDraw = null;
        this._renderDrawings();
    }

    _setAutoYFromBounds(min, max, sourceKind = 'api') {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return;
        if (max <= min) {
            const center = Number.isFinite(min) ? min : 0;
            min = center - 1;
            max = center + 1;
        }

        this._lastDataYMin = min;
        this._lastDataYMax = max;
        if (this.onYRangeCallback) this.onYRangeCallback(min, max, sourceKind);
    }

    /** Set the visible X-axis range using real timestamp values. */
    setXRange(minMs, maxMs) {
        if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return;
        this._xMin = minMs;
        this._xMax = maxMs;

        if (DEBUG) dbg('setXRange', { minMs, maxMs });
    }

    async init() {
        const container = document.getElementById(this.containerId);
        this._container = container;

        // createChart is async — must be awaited
        this.chartInstance = await createChart(container, {
            grid: CHART_GRID,
            xAxis: { type: 'time' },
            yAxis: { type: 'value' },
            legend: { show: true, position: 'right' },
            series: [],
        });

        // No chart-library dataZoom — zoom is managed entirely via timestamps
        // in app.js. The onZoomCallback is invoked directly from our custom
        // drag-selection handler and button handlers.

        this._initDrawingOverlay();
        this._initTextOverlays();
        this._initMouseSelectionZoom();
    }

    _getVisibilityByBaseNameFromChart() {
        const vis = new Map();
        const series = this.chartInstance?.options?.series;
        if (!Array.isArray(series)) return vis;
        for (const s of series) {
            const name = typeof s?.name === 'string' ? s.name : '';
            if (!name) continue;
            const base = name.endsWith('__markers') ? name.slice(0, -'__markers'.length) : name;
            vis.set(base, s.visible !== false);
        }
        return vis;
    }

    _initTextOverlays() {
        if (!this._container) return;
        const container = this._container;
        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const mk = (className) => {
            const el = document.createElement('div');
            el.className = `chart-text-overlay ${className}`;
            el.textContent = '';
            el.style.display = 'none';
            container.appendChild(el);
            return el;
        };

        this._titleEl = mk('chart-title-overlay');
        this._xLabelEl = mk('chart-xlabel-overlay');
        this._yLabelEl = mk('chart-ylabel-overlay');
        this._syncTextOverlays();
    }

    _syncTextOverlays() {
        const set = (el, text) => {
            if (!el) return;
            const t = String(text ?? '').trim();
            el.textContent = t;
            el.style.display = t ? 'block' : 'none';
        };
        set(this._titleEl, this._chartTitle);
        set(this._xLabelEl, this._xAxisLabel);
        set(this._yLabelEl, this._yAxisLabel);
    }

    _initDrawingOverlay() {
        if (!this._container) return;
        const container = this._container;
        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const overlay = document.createElement('canvas');
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '6';

        // Listen to resize to update canvas resolution
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                overlay.width = width;
                overlay.height = height;
                this._renderDrawings();
            }
        });
        resizeObserver.observe(container);

        container.appendChild(overlay);
        this._overlayCanvas = overlay;
        this._overlayCtx = overlay.getContext('2d');

        // Draw interactions
        overlay.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || this._drawMode === 'none') return;
            const rect = overlay.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this._currentDraw = {
                type: this._drawMode,
                color: this._drawColor,
                width: this._drawWidth,
                startX: x,
                startY: y,
                endX: x,
                endY: y
            };
            overlay.setPointerCapture(e.pointerId);
        });

        overlay.addEventListener('pointermove', (e) => {
            if (!this._currentDraw || this._drawMode === 'none') return;
            const rect = overlay.getBoundingClientRect();
            this._currentDraw.endX = e.clientX - rect.left;
            this._currentDraw.endY = e.clientY - rect.top;
            this._renderDrawings();
        });

        overlay.addEventListener('pointerup', (e) => {
            if (!this._currentDraw || this._drawMode === 'none') return;
            this._drawings.push(this._currentDraw);
            this._currentDraw = null;
            overlay.releasePointerCapture(e.pointerId);
            this._renderDrawings();
        });

        overlay.addEventListener('pointercancel', (e) => {
            this._currentDraw = null;
            this._renderDrawings();
        });
    }

    _drawArrow(ctx, sx, sy, ex, ey) {
        const headlen = 10;
        const dx = ex - sx;
        const dy = ey - sy;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    _renderDrawings() {
        if (!this._overlayCtx || !this._overlayCanvas) return;
        const ctx = this._overlayCtx;
        ctx.clearRect(0, 0, this._overlayCanvas.width, this._overlayCanvas.height);

        const allDraws = [...this._drawings];
        if (this._currentDraw) allDraws.push(this._currentDraw);

        for (const item of allDraws) {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (item.type === 'arrow') {
                this._drawArrow(ctx, item.startX, item.startY, item.endX, item.endY);
            } else if (item.type === 'box') {
                ctx.beginPath();
                ctx.rect(
                    Math.min(item.startX, item.endX),
                    Math.min(item.startY, item.endY),
                    Math.abs(item.endX - item.startX),
                    Math.abs(item.endY - item.startY)
                );
                ctx.stroke();
            }
        }
    }

    _buildYAxisOption() {
        return {
            type: 'value',
            axisLabel: {
                formatter: (value) => {
                    const n = Number(value);
                    if (!Number.isFinite(n)) return '—';
                    return n.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                    });
                },
            },
        };
    }

    _applyYRange(min, max, sourceKind = 'api', setAuto = null) {
        if (setAuto === true) this._yAuto = true;
        if (setAuto === false) this._yAuto = false;
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        this._yMin = min;
        this._yMax = max;
        if (this.onYRangeCallback) this.onYRangeCallback(min, max, sourceKind);
    }

    supportsZoomControls() {
        return !!this.chartInstance;
    }

    getXDomain() {
        if (Number.isFinite(this._lastXDomainMin) && Number.isFinite(this._lastXDomainMax) && this._lastXDomainMax > this._lastXDomainMin) {
            return { min: this._lastXDomainMin, max: this._lastXDomainMax };
        }
        return null;
    }

    setYRange(min, max) {
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;

        // Explicit y range disables auto-fit until fitYToData is called.
        this._applyYRange(min, max, 'api', false);
    }

    getYRange() {
        if (Number.isFinite(this._lastDataYMin) && Number.isFinite(this._lastDataYMax) && this._lastDataYMax > this._lastDataYMin) {
            return { min: this._lastDataYMin, max: this._lastDataYMax };
        }
        if (Number.isFinite(this._yMin) && Number.isFinite(this._yMax) && this._yMax > this._yMin) {
            return { min: this._yMin, max: this._yMax };
        }
        return null;
    }

    zoomY(factor, anchorNormalized = 0.5) {
        return;
    }

    resetYRange() {
        return;
    }

    fitYToData() {
        if (!Number.isFinite(this._lastDataYMin) || !Number.isFinite(this._lastDataYMax)) return;
        if (this.onYRangeCallback) this.onYRangeCallback(this._lastDataYMin, this._lastDataYMax, 'data');
    }

    onCrosshairMove(callback) {
        if (!this.chartInstance || !callback) return;
        this.chartInstance.on('crosshairMove', callback);
    }

    onClick(callback) {
        if (!this.chartInstance || !callback) return;
        this.chartInstance.on('click', callback);
    }

    _initMouseSelectionZoom() {
        if (!this._container) return;

        const container = this._container;
        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const selection = document.createElement('div');
        selection.style.position = 'absolute';
        selection.style.top = '0';
        selection.style.height = '0';
        selection.style.left = '0';
        selection.style.width = '0';
        selection.style.border = '1px solid rgba(0, 212, 255, 0.9)';
        selection.style.background = 'rgba(0, 212, 255, 0.15)';
        selection.style.pointerEvents = 'none';
        selection.style.display = 'none';
        selection.style.zIndex = '5';
        container.appendChild(selection);
        this._selectionBox = selection;

        container.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || this._drawMode !== 'none') return;
            if (DEBUG) dbg('pointerdown', { x: event.clientX, y: event.clientY });
            const rect = container.getBoundingClientRect();
            const startX = event.clientX - rect.left;
            this._dragState = {
                pointerId: event.pointerId,
                startX,
                endX: startX,
                startY: event.clientY - rect.top,
                endY: event.clientY - rect.top,
            };
            try {
                container.setPointerCapture(event.pointerId);
            } catch (_) {}
            this._renderSelectionBox();
        });

        container.addEventListener('pointermove', (event) => {
            if (!this._dragState || event.pointerId !== this._dragState.pointerId) return;
            const rect = container.getBoundingClientRect();
            this._dragState.endX = event.clientX - rect.left;
            this._dragState.endY = event.clientY - rect.top;
            this._renderSelectionBox();
        });

        const finishDrag = (event) => {
            if (!this._dragState || event.pointerId !== this._dragState.pointerId) return;
            const rect = container.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            const startX = this._dragState.startX;
            const endX = this._dragState.endX;
            const startY = this._dragState.startY;
            const endY = this._dragState.endY;
            this._dragState = null;
            this._hideSelectionBox();

            const left = Math.max(0, Math.min(startX, endX));
            const right = Math.min(width, Math.max(startX, endX));
            const top = Math.max(0, Math.min(startY, endY));
            const bottom = Math.min(height, Math.max(startY, endY));

            const xSpan = right - left;
            const ySpan = bottom - top;
            if (DEBUG) {
                dbg('finishDrag spans', { xSpan, ySpan, left, right, top, bottom, width, height });
                dbg('current xRange', { xMin: this._xMin, xMax: this._xMax });
            }
            if (xSpan < 8 && ySpan < 8) return;

            if (xSpan >= 8) {
                // Map pixel position directly to timestamps using the current
                // displayed x-axis range (_xMin / _xMax set by setXRange).
                if (Number.isFinite(this._xMin) && Number.isFinite(this._xMax)) {
                    const span = this._xMax - this._xMin;
                    const startMs = this._xMin + (left  / width) * span;
                    const endMs   = this._xMin + (right / width) * span;
                    if (DEBUG) dbg('computed zoom x', { startMs, endMs });
                    if (this.onZoomCallback) {
                        this.onZoomCallback(startMs, endMs, 'user');
                    }
                } else if (DEBUG) {
                    dbg('cannot compute zoom: missing xRange');
                }
            }

            try {
                container.releasePointerCapture(event.pointerId);
            } catch (_) {}
        };

        container.addEventListener('pointerup', finishDrag);
        container.addEventListener('pointercancel', finishDrag);

        container.addEventListener('dblclick', (event) => {
            if (event.shiftKey) return;
            if (DEBUG) dbg('dblclick zoomOut');
            if (this.onZoomOutCallback) this.onZoomOutCallback();
        });

        // Y zoom gestures are intentionally disabled so ChartGPU controls Y-axis bounds.
    }

    _renderSelectionBox() {
        if (!this._selectionBox || !this._dragState || !this._container) return;
        const rect = this._container.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const left = Math.max(0, Math.min(this._dragState.startX, this._dragState.endX));
        const right = Math.min(width, Math.max(this._dragState.startX, this._dragState.endX));
        const top = Math.max(0, Math.min(this._dragState.startY, this._dragState.endY));
        const bottom = Math.min(height, Math.max(this._dragState.startY, this._dragState.endY));
        this._selectionBox.style.left = `${left}px`;
        this._selectionBox.style.width = `${Math.max(0, right - left)}px`;
        this._selectionBox.style.top = `${top}px`;
        this._selectionBox.style.height = `${Math.max(0, bottom - top)}px`;
        this._selectionBox.style.display = 'block';
    }

    _hideSelectionBox() {
        if (!this._selectionBox) return;
        this._selectionBox.style.display = 'none';
    }

    updateDataMulti(dataObj, columns) {
        if (!this.chartInstance) return;
        const showMarkers = dataObj?._meta?.downsampled === false;

        const prevVisibility = this._getVisibilityByBaseNameFromChart();

        let dataYMin = Number.POSITIVE_INFINITY;
        let dataYMax = Number.NEGATIVE_INFINITY;

        let xDomainMin = Number.POSITIVE_INFINITY;
        let xDomainMax = Number.NEGATIVE_INFINITY;
        const seriesDebug = [];

        const seriesList = columns
            .filter((colName) => {
                const name = String(colName || '').toLowerCase();
                if (name === 'ts' || name === 'timestamp' || name === 'time') return false;
                return dataObj.values?.[colName] || dataObj.series?.[colName];
            })
            .map((colName, idx) => {
                const seriesData = dataObj.series?.[colName];
                const yValues = seriesData ? seriesData.y : dataObj.values[colName];
                const xValues = seriesData ? seriesData.x : dataObj.ts;

                const points = [];
                const n = Math.min(xValues?.length ?? 0, yValues?.length ?? 0);
                let localYMin = Number.POSITIVE_INFINITY;
                let localYMax = Number.NEGATIVE_INFINITY;
                for (let i = 0; i < n; i++) {
                    const x = Number(xValues[i]);
                    const y = Number(yValues[i]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                    points.push([x, y]);
                    if (x < xDomainMin) xDomainMin = x;
                    if (x > xDomainMax) xDomainMax = x;
                    if (y < dataYMin) dataYMin = y;
                    if (y > dataYMax) dataYMax = y;
                    if (y < localYMin) localYMin = y;
                    if (y > localYMax) localYMax = y;
                }

                seriesDebug.push({
                    name: colName,
                    points: points.length,
                    yMin: Number.isFinite(localYMin) ? localYMin : null,
                    yMax: Number.isFinite(localYMax) ? localYMax : null,
                    firstY: points.length > 0 ? points[0][1] : null,
                    lastY: points.length > 0 ? points[points.length - 1][1] : null,
                });

                const color = COLORS[idx % COLORS.length];
                const visible = prevVisibility.get(colName) !== false;
                const lineSeries = {
                    type: 'line',
                    name: colName,
                    color,
                    visible,
                    // Use point arrays for maximum compatibility in bounds + tooltip + rendering.
                    data: points,
                };

                if (!showMarkers) {
                    return [lineSeries];
                }

                const markerSeries = {
                    type: 'scatter',
                    name: `${colName}__markers`,
                    color,
                    visible,
                    symbolSize: 2,
                    data: points,
                };

                return [lineSeries, markerSeries];
            });

        const flattenedSeriesList = seriesList.flat();

        // Persist for later axis updates (e.g. setYRange/fitYToData).
        this._lastSeriesList = flattenedSeriesList;
        this._lastXDomainMin = Number.isFinite(xDomainMin) ? xDomainMin : null;
        this._lastXDomainMax = Number.isFinite(xDomainMax) ? xDomainMax : null;

        if (DEBUG) {
            dbg('updateDataMulti series', flattenedSeriesList.map(s => s.name));
            if (Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax)) {
                dbg('computed xDomain', { min: xDomainMin, max: xDomainMax });
            } else {
                dbg('computed xDomain missing');
            }
            dbg('computed yDomain', {
                min: Number.isFinite(dataYMin) ? dataYMin : null,
                max: Number.isFinite(dataYMax) ? dataYMax : null,
                seriesDebug,
            });
        }

        if (Number.isFinite(dataYMin) && Number.isFinite(dataYMax)) {
            this._lastDataYMin = dataYMin;
            this._lastDataYMax = dataYMax;
            if (this.onYRangeCallback) this.onYRangeCallback(dataYMin, dataYMax, 'data');
        }

        if (flattenedSeriesList.length > 0) {
            const nextOption = {
                grid: CHART_GRID,
                xAxis: {
                    type: 'time',
                    min: Number.isFinite(xDomainMin) ? xDomainMin : undefined,
                    max: Number.isFinite(xDomainMax) ? xDomainMax : undefined,
                },
                yAxis: this._buildYAxisOption(),
                series: flattenedSeriesList,
            };
            try {
                this.chartInstance.setOption(nextOption);

                // ChartGPU supports internal percent-space zoom. Even when we
                // manage zoom externally (refetch by timestamps), a stale or
                // invalid internal zoomRange can clip everything and look like
                // "no data". Keep it pinned to full-range.
                if (this.chartInstance.getZoomRange && this.chartInstance.setZoomRange) {
                    const zr = this.chartInstance.getZoomRange();
                    if (DEBUG) dbg('chartInstance zoomRange (pre-reset)', zr);
                    this.chartInstance.setZoomRange(0, 100, 'api');
                }
            } catch (e) {
                console.error('[edatime:chart] setOption failed', e);
            }
        }
    }

    _getChartCanvas() {
        if (!this._container) return null;
        const allCanvases = Array.from(this._container.querySelectorAll('canvas'));
        const candidates = allCanvases.filter((canvas) => canvas !== this._overlayCanvas);
        if (candidates.length === 0) return null;

        let best = candidates[0];
        let bestArea = (best.width || best.clientWidth || 0) * (best.height || best.clientHeight || 0);
        for (let i = 1; i < candidates.length; i++) {
            const canvas = candidates[i];
            const area = (canvas.width || canvas.clientWidth || 0) * (canvas.height || canvas.clientHeight || 0);
            if (area > bestArea) {
                best = canvas;
                bestArea = area;
            }
        }
        return best;
    }

    _getExportViewport() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this._container?.getBoundingClientRect?.();
        const cssWidth = Math.max(1, Math.round(rect?.width ?? this._overlayCanvas?.width ?? 1));
        const cssHeight = Math.max(1, Math.round(rect?.height ?? this._overlayCanvas?.height ?? 1));
        const width = Math.max(1, Math.round(cssWidth * dpr));
        const height = Math.max(1, Math.round(cssHeight * dpr));
        return { cssWidth, cssHeight, width, height, dpr };
    }

    _getExportDomains() {
        const xMin = Number.isFinite(this._xMin) ? this._xMin : this._lastXDomainMin;
        const xMax = Number.isFinite(this._xMax) ? this._xMax : this._lastXDomainMax;
        const yRange = this.getYRange();

        const yMin = yRange?.min;
        const yMax = yRange?.max;

        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return null;
        if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) return null;

        // Add a small y padding so the line doesn't stick to the edges.
        const ySpan = yMax - yMin;
        const pad = ySpan * 0.04;
        return {
            xMin,
            xMax,
            yMin: yMin - pad,
            yMax: yMax + pad,
        };
    }

    _renderExportChartToCanvas(canvas, viewport, domains, includeDrawings = true) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { cssWidth, cssHeight, width, height } = viewport;
        const scale = width / cssWidth;

        const styles = getComputedStyle(document.body);
        const bg = styles.getPropertyValue('--bg').trim() || '#080a10';
        const surface2 = styles.getPropertyValue('--surface-2').trim() || '#181c2a';
        const border = styles.getPropertyValue('--border').trim() || '#272d45';
        const borderHi = styles.getPropertyValue('--border-hi').trim() || '#363f62';
        const text = styles.getPropertyValue('--text').trim() || '#c8d0e4';
        const textDim = styles.getPropertyValue('--text-dim').trim() || '#7a86a4';
        ctx.save();
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        const grid = {
            left: CHART_GRID.left * scale,
            right: CHART_GRID.right * scale,
            top: CHART_GRID.top * scale,
            bottom: CHART_GRID.bottom * scale,
        };

        const plotLeft = grid.left;
        const plotTop = grid.top;
        const plotRight = Math.max(plotLeft + 1, width - grid.right);
        const plotBottom = Math.max(plotTop + 1, height - grid.bottom);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);

        // Clip to plot area so overlays don't spill into margins.
        ctx.save();
        ctx.beginPath();
        ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
        ctx.clip();

        const xSpan = domains.xMax - domains.xMin;
        const ySpan = domains.yMax - domains.yMin;

        const seriesList = Array.isArray(this._lastSeriesList) ? this._lastSeriesList : [];
        for (const series of seriesList) {
            if (!series || series.type !== 'line') continue;
            const pts = Array.isArray(series.data) ? series.data : [];
            if (pts.length === 0) continue;

            ctx.beginPath();
            ctx.strokeStyle = series.color || '#00E5FF';
            ctx.lineWidth = 1.5 * scale;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            let started = false;
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                const x = Number(p?.[0]);
                const y = Number(p?.[1]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const px = plotLeft + ((x - domains.xMin) / xSpan) * plotWidth;
                const py = plotBottom - ((y - domains.yMin) / ySpan) * plotHeight;
                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
            }

            if (started) ctx.stroke();
        }
        ctx.restore();

        // Axes + ticks + labels
        const fontSize = Math.max(10, Math.round(12 * scale));
        ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;

        // Frame / axes lines
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
            // gridline
            ctx.strokeStyle = borderHi;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(plotLeft, py);
            ctx.lineTo(plotRight, py);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // tick
            ctx.strokeStyle = border;
            ctx.beginPath();
            ctx.moveTo(plotLeft - tickLen, py);
            ctx.lineTo(plotLeft, py);
            ctx.stroke();

            const label = Number(y).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            ctx.fillText(label, plotLeft - tickLen - labelPad, py);
        }

        // X ticks
        const xTicks = niceTimeTicks(domains.xMin, domains.xMax, 6);
        const spanMs = domains.xMax - domains.xMin;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = textDim;
        const xAxisName = String(this._xAxisLabel ?? '').trim();
        const xAxisNameY = xAxisName ? (height - fontSize - 2 * scale) : null;
        const xTickTextYDefault = plotBottom + tickLen + labelPad;
        const xTickTextY = xAxisNameY ? Math.max(plotBottom + 2 * scale, Math.min(xTickTextYDefault, xAxisNameY - fontSize - 2 * scale)) : xTickTextYDefault;
        for (const x of xTicks) {
            const px = plotLeft + ((x - domains.xMin) / xSpan) * plotWidth;
            // gridline
            ctx.strokeStyle = borderHi;
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.moveTo(px, plotTop);
            ctx.lineTo(px, plotBottom);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // tick
            ctx.strokeStyle = border;
            ctx.beginPath();
            ctx.moveTo(px, plotBottom);
            ctx.lineTo(px, plotBottom + tickLen);
            ctx.stroke();

            ctx.fillText(formatTimeTick(x, spanMs), px, xTickTextY);
        }

        // Title + axis names
        const title = String(this._chartTitle ?? '').trim();
        if (title) {
            ctx.save();
            ctx.fillStyle = text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = `${Math.max(12, Math.round(14 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.fillText(title, width / 2, Math.max(2 * scale, (plotTop - (Math.max(12, Math.round(14 * scale)) + 2 * scale)) / 2));
            ctx.restore();
        }

        if (xAxisName && xAxisNameY !== null) {
            ctx.save();
            ctx.fillStyle = textDim;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.fillText(xAxisName, width / 2, xAxisNameY);
            ctx.restore();
        }

        const yAxisName = String(this._yAxisLabel ?? '').trim();
        if (yAxisName) {
            ctx.save();
            ctx.fillStyle = textDim;
            ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.translate(Math.max(10 * scale, fontSize), (plotTop + plotBottom) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(yAxisName, 0, 0);
            ctx.restore();
        }

        // Legend
        const legendEntries = seriesList
            .filter((s) => s && s.type === 'line' && typeof s.name === 'string' && !s.name.endsWith('__markers'))
            .map((s) => ({ name: s.name, color: s.color || '#00E5FF' }));

        if (legendEntries.length > 0) {
            const pad = 8 * scale;
            const gap = 6 * scale;
            const sw = 18 * scale;
            const lh = Math.max(14 * scale, fontSize + 2 * scale);
            let maxTextW = 0;
            for (const e of legendEntries) {
                maxTextW = Math.max(maxTextW, ctx.measureText(e.name).width);
            }
            const boxW = pad * 2 + sw + gap + maxTextW;
            const boxH = pad * 2 + legendEntries.length * lh;
            const x0 = Math.max(plotLeft, plotRight - boxW - 6 * scale);
            const y0 = plotTop + 6 * scale;

            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = surface2;
            ctx.fillRect(x0, y0, boxW, boxH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = border;
            ctx.lineWidth = 1 * scale;
            ctx.strokeRect(x0, y0, boxW, boxH);

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = text;
            for (let i = 0; i < legendEntries.length; i++) {
                const e = legendEntries[i];
                const cy = y0 + pad + i * lh + lh / 2;
                const sx = x0 + pad;
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 2 * scale;
                ctx.beginPath();
                ctx.moveTo(sx, cy);
                ctx.lineTo(sx + sw, cy);
                ctx.stroke();
                ctx.fillText(e.name, sx + sw + gap, cy);
            }
            ctx.restore();
        }

        if (includeDrawings) {
            // Render drawings from the model (crisp), scaled from CSS pixels.
            const drawingsScale = {
                x: width / cssWidth,
                y: height / cssHeight,
            };
            this._renderDrawingsToCtx(ctx, drawingsScale);
        }

        ctx.restore();
    }

    _renderDrawingsToCtx(ctx, scale) {
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
                this._drawArrowScaled(ctx, sx, sy, ex, ey, 10 * strokeScale);
            } else if (item.type === 'box') {
                ctx.beginPath();
                ctx.rect(
                    Math.min(sx, ex),
                    Math.min(sy, ey),
                    Math.abs(ex - sx),
                    Math.abs(ey - sy)
                );
                ctx.stroke();
            }
        }
    }

    _drawArrowScaled(ctx, sx, sy, ex, ey, headlen) {
        const dx = ex - sx;
        const dy = ey - sy;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    async _captureChartBitmap(chartCanvas) {
        try {
            if (typeof createImageBitmap === 'function') {
                return await createImageBitmap(chartCanvas);
            }
        } catch (_) {
            // Fallback to drawImage(canvas) path below.
        }
        return chartCanvas;
    }

    async _getCombinedExportCanvas(includeDrawings = true) {
        // ChartGPU renders via WebGPU and cannot be captured via drawImage/toDataURL.
        // Export by re-rendering from the currently plotted data instead.
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

    async exportPNG() {
        const canvas = await this._getCombinedExportCanvas(true);
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        this._downloadLink(url, 'edatime_chart.png');
    }

    exportSVGDrawings(viewWidth, viewHeight) {
        const allDraws = [...this._drawings];
        if (this._currentDraw) allDraws.push(this._currentDraw);
        if (allDraws.length === 0) return '';

        const baseW = (this._overlayCanvas?.width || this._container?.getBoundingClientRect?.().width || viewWidth || 1);
        const baseH = (this._overlayCanvas?.height || this._container?.getBoundingClientRect?.().height || viewHeight || 1);
        const scaleX = viewWidth / (baseW || 1);
        const scaleY = viewHeight / (baseH || 1);
        const strokeScale = Math.min(scaleX, scaleY);

        let body = '';
        for (const item of allDraws) {
            if (item.type === 'arrow') {
                body += this._drawArrowSVG(item, scaleX, scaleY);
                continue;
            }
            if (item.type === 'box') {
                const x = Math.min(item.startX, item.endX) * scaleX;
                const y = Math.min(item.startY, item.endY) * scaleY;
                const w = Math.abs(item.endX - item.startX) * scaleX;
                const h = Math.abs(item.endY - item.startY) * scaleY;
                body += `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${item.color}" stroke-width="${item.width * strokeScale}" stroke-linecap="round" stroke-linejoin="round" />\n`;
            }
        }
        return body;
    }

    async exportSVG() {
        const canvas = await this._getCombinedExportCanvas(false);
        if (!canvas) return;
        const pngData = canvas.toDataURL('image/png');
        const width = canvas.width || 1;
        const height = canvas.height || 1;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
        svg += `  <image href="${pngData}" x="0" y="0" width="${width}" height="${height}" />\n`;
        svg += this.exportSVGDrawings(width, height);
        svg += '</svg>';

        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        this._downloadLink(url, 'edatime_chart.svg');
    }

    _drawArrowSVG(item, scaleX = 1, scaleY = 1) {
        const strokeScale = Math.min(scaleX, scaleY);
        const headlen = 10 * strokeScale;
        const startX = item.startX * scaleX;
        const startY = item.startY * scaleY;
        const endX = item.endX * scaleX;
        const endY = item.endY * scaleY;
        const dx = endX - startX;
        const dy = endY - startY;
        const angle = Math.atan2(dy, dx);

        let d = `M ${startX} ${startY} L ${endX} ${endY}`;
        d += ` L ${endX - headlen * Math.cos(angle - Math.PI / 6)} ${endY - headlen * Math.sin(angle - Math.PI / 6)}`;
        d += ` M ${endX} ${endY}`;
        d += ` L ${endX - headlen * Math.cos(angle + Math.PI / 6)} ${endY - headlen * Math.sin(angle + Math.PI / 6)}`;

        return `  <path d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.width * strokeScale}" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }

    async exportHTML() {
        const canvas = await this._getCombinedExportCanvas(true);
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>EdaTime Export</title>
    <style>
        body { margin: 0; background: #1a1a1a; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        img { max-width: 100%; height: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
    </style>
</head>
<body>
    <img src="${dataUrl}" alt="EdaTime Chart" />
</body>
</html>`;
        
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        this._downloadLink(url, 'edatime_chart.html');
    }

    _downloadLink(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (url.startsWith('blob:')) {
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }
    }
}
