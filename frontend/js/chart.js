import { createChart } from '../libs/chartgpu/dist/index.js?v=3';

const COLORS = ['#00E5FF', '#FF0055', '#00FF00', '#FFFF00', '#FF00FF'];

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
        this._lastDataYMin = null;
        this._lastDataYMax = null;
        this._lastSeriesList = null;
        this._lastXDomainMin = null;
        this._lastXDomainMax = null;
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
        const yAxis = { type: 'value' };
        if (Number.isFinite(this._yMin) && Number.isFinite(this._yMax) && this._yMax > this._yMin) {
            yAxis.min = this._yMin;
            yAxis.max = this._yMax;
            yAxis.autoBounds = 'visible';
        }
        return yAxis;
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

        if (Number.isFinite(this._lastDataYMin) && Number.isFinite(this._lastDataYMax) && this._lastDataYMax > this._lastDataYMin) {
            const dataMin = this._lastDataYMin;
            const dataMax = this._lastDataYMax;
            const dataSpan = dataMax - dataMin;

            let nextMin = Math.max(dataMin, min);
            let nextMax = Math.min(dataMax, max);
            if (!(nextMax > nextMin)) {
                nextMin = dataMin;
                nextMax = dataMax;
            }

            const minSpan = Math.max(1e-12, dataSpan * 0.005);
            if (nextMax - nextMin < minSpan) {
                const center = (nextMin + nextMax) * 0.5;
                nextMin = Math.max(dataMin, center - minSpan * 0.5);
                nextMax = Math.min(dataMax, center + minSpan * 0.5);
                if (!(nextMax > nextMin)) {
                    nextMin = dataMin;
                    nextMax = dataMax;
                }
            }

            min = nextMin;
            max = nextMax;
        }

        this._yMin = min;
        this._yMax = max;
        if (this.onYRangeCallback) {
            this.onYRangeCallback(min, max, 'api');
        }
        if (!this.chartInstance) return;

        // IMPORTANT: ChartGPU's option application may not deep-merge. If we
        // only set { yAxis }, it can drop the current series and look like
        // "no data". Always re-apply the full option with the last series.
        const series = this._lastSeriesList ?? [];
        const xAxis = {
            type: 'time',
            min: Number.isFinite(this._lastXDomainMin) ? this._lastXDomainMin : undefined,
            max: Number.isFinite(this._lastXDomainMax) ? this._lastXDomainMax : undefined,
        };
        this.chartInstance.setOption({
            xAxis,
            yAxis: this._buildYAxisOption(),
            series,
        });
    }

    getYRange() {
        if (Number.isFinite(this._yMin) && Number.isFinite(this._yMax) && this._yMax > this._yMin) {
            return { min: this._yMin, max: this._yMax };
        }
        if (Number.isFinite(this._lastDataYMin) && Number.isFinite(this._lastDataYMax) && this._lastDataYMax > this._lastDataYMin) {
            return { min: this._lastDataYMin, max: this._lastDataYMax };
        }
        return null;
    }

    zoomY(factor, anchorNormalized = 0.5) {
        if (!Number.isFinite(factor) || factor <= 0) return;
        if (!Number.isFinite(this._yMin) || !Number.isFinite(this._yMax) || this._yMax <= this._yMin) return;

        const anchor = Math.max(0, Math.min(1, anchorNormalized));
        const span = this._yMax - this._yMin;
        const newSpan = Math.max(1e-12, span * factor);
        const focal = this._yMin + anchor * span;

        const nextMin = focal - anchor * newSpan;
        const nextMax = nextMin + newSpan;
        this.setYRange(nextMin, nextMax);
    }

    resetYRange() {
        this.fitYToData();
    }

    fitYToData() {
        if (!Number.isFinite(this._lastDataYMin) || !Number.isFinite(this._lastDataYMax)) return;
        if (this._lastDataYMax <= this._lastDataYMin) {
            this.setYRange(this._lastDataYMin - 1, this._lastDataYMax + 1);
            return;
        }
        this.setYRange(this._lastDataYMin, this._lastDataYMax);
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

            const minYSpanPx = Math.max(24, height * 0.08);

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

            if (ySpan >= minYSpanPx) {
                const yRange = this.getYRange();
                if (yRange) {
                    const yMin = yRange.min;
                    const yMax = yRange.max;
                    const span = yMax - yMin;
                    if (span > 0) {
                        const selectedMax = yMin + (1 - top / height) * span;
                        const selectedMin = yMin + (1 - bottom / height) * span;
                        this.setYRange(selectedMin, selectedMax);
                    }
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

        container.addEventListener('wheel', (event) => {
            if (!event.shiftKey) return;
            event.preventDefault();
            const rect = container.getBoundingClientRect();
            const y = event.clientY - rect.top;
            const anchor = 1 - Math.max(0, Math.min(1, y / Math.max(1, rect.height)));
            const factor = event.deltaY < 0 ? 0.85 : 1.18;
            this.zoomY(factor, anchor);
        }, { passive: false });

        container.addEventListener('dblclick', (event) => {
            if (!event.shiftKey) return;
            if (DEBUG) dbg('shift+dblclick resetYRange');
            this.resetYRange();
        });
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

        let dataYMin = Number.POSITIVE_INFINITY;
        let dataYMax = Number.NEGATIVE_INFINITY;

        let xDomainMin = Number.POSITIVE_INFINITY;
        let xDomainMax = Number.NEGATIVE_INFINITY;

        const seriesList = columns
            .filter(colName => dataObj.values?.[colName] || dataObj.series?.[colName])
            .map((colName, idx) => {
                const seriesData = dataObj.series?.[colName];
                const yValues = seriesData ? seriesData.y : dataObj.values[colName];
                const xValues = seriesData ? seriesData.x : dataObj.ts;

                const mm = computeFiniteMinMax(xValues);
                if (mm) {
                    if (mm.min < xDomainMin) xDomainMin = mm.min;
                    if (mm.max > xDomainMax) xDomainMax = mm.max;
                }

                if (yValues) {
                    for (let i = 0; i < yValues.length; i++) {
                        const value = Number(yValues[i]);
                        if (!Number.isFinite(value)) continue;
                        if (value < dataYMin) dataYMin = value;
                        if (value > dataYMax) dataYMax = value;
                    }
                }
                return {
                    type: 'line',
                    name: colName,
                    color: COLORS[idx % COLORS.length],
                    // XYArraysData format: { x: ArrayLike<number>, y: ArrayLike<number> }
                    data: seriesData
                        ? { x: seriesData.x, y: seriesData.y }
                        : { x: dataObj.ts, y: dataObj.values[colName] },
                };
            });

        // Persist for later axis updates (e.g. setYRange/fitYToData).
        this._lastSeriesList = seriesList;
        this._lastXDomainMin = Number.isFinite(xDomainMin) ? xDomainMin : null;
        this._lastXDomainMax = Number.isFinite(xDomainMax) ? xDomainMax : null;

        if (DEBUG) {
            dbg('updateDataMulti series', seriesList.map(s => s.name));
            if (Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax)) {
                dbg('computed xDomain', { min: xDomainMin, max: xDomainMax });
            } else {
                dbg('computed xDomain missing');
            }
        }

        if (Number.isFinite(dataYMin) && Number.isFinite(dataYMax)) {
            this._lastDataYMin = dataYMin;
            this._lastDataYMax = dataYMax;
            if (!Number.isFinite(this._yMin) || !Number.isFinite(this._yMax)) {
                this.fitYToData();
            }
        }

        if (seriesList.length > 0) {
            const nextOption = {
                xAxis: {
                    type: 'time',
                    min: Number.isFinite(xDomainMin) ? xDomainMin : undefined,
                    max: Number.isFinite(xDomainMax) ? xDomainMax : undefined,
                },
                yAxis: this._buildYAxisOption(),
                series: seriesList,
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
