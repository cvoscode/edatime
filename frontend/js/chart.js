import { createChart } from '../libs/chartgpu/dist/index.js?v=3';

const COLORS = ['#00E5FF', '#FF0055', '#00FF00', '#FFFF00', '#FF00FF'];
const CHART_GRID = { left: 112, right: 20, top: 16, bottom: 36 };

const DEBUG = (() => {
    try {
        const qs = new URLSearchParams(window.location.search);
        if (qs.get('debug') === '1') return true;
        if (qs.get('debug') === 'true') return true;
        return window.localStorage?.getItem('edatimeDebug') === '1';
    } catch (_) {
        return false;
    }
})();

function dbg(...args) {
    if (!DEBUG) return;
    console.log('[edatime:chart]', ...args);
}

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
            series: [],
        });

        // No chart-library dataZoom — zoom is managed entirely via timestamps
        // in app.js. The onZoomCallback is invoked directly from our custom
        // drag-selection handler and button handlers.

        this._initMouseSelectionZoom();
    }

    _buildYAxisOption() {
        return { type: 'value' };
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
            if (event.button !== 0) return;
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
                const lineSeries = {
                    type: 'line',
                    name: colName,
                    color,
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
}
