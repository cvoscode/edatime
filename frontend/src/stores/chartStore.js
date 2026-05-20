"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chartStore = void 0;
/**
 * Chart store — manages viewport, zoom history, annotations, and drawing state for timeseries charts.
 * Coordinates with ChartGPU or fallback chart adapters.
 */
var store_1 = require("solid-js/store");
var defaultViewport = {
    xMin: 0,
    xMax: 100,
    yMin: 0,
    yMax: 1
};
var _a = (0, store_1.createStore)({
    viewport: __assign({}, defaultViewport),
    zoomHistory: { zoomStack: [__assign({}, defaultViewport)], currentIndex: 0 },
    initialView: null,
    chartInstance: null,
    annotations: [],
    drawings: [],
    isDrawing: false,
    drawMode: 'pan',
    isLoading: false,
    lastDataYMin: null,
    lastDataYMax: null,
    yAuto: true,
    seriesVisibility: {},
}), chartState = _a[0], setChartState = _a[1];
exports.chartStore = {
    get state() { return chartState; },
    setInitialView: function (viewport) {
        setChartState('initialView', __assign({}, viewport));
        // Also set as current if viewport not yet set
        if (!Number.isFinite(chartState.viewport.xMin) || !Number.isFinite(chartState.viewport.xMax)) {
            this.setViewport(viewport);
        }
    },
    setViewport: function (viewport) {
        // Save current view to history before changing
        var currentView = __assign({}, chartState.viewport);
        setChartState('viewport', viewport);
        // Push current view to history stack (limit to 10 entries)
        var newStack = chartState.zoomHistory.zoomStack.slice(0, chartState.zoomHistory.currentIndex + 1);
        newStack.push(currentView);
        if (newStack.length > 5)
            newStack.shift();
        setChartState('zoomHistory', {
            zoomStack: newStack,
            currentIndex: newStack.length - 1
        });
    },
    zoomIn: function () {
        var current = chartState.viewport;
        var xRange = current.xMax - current.xMin;
        var yRange = current.yMax - current.yMin;
        var factor = 0.5;
        this.setViewport({
            xMin: current.xMin + xRange * factor,
            xMax: current.xMax - xRange * factor,
            yMin: current.yMin + yRange * factor,
            yMax: current.yMax - yRange * factor
        });
    },
    zoomOut: function () {
        var history = chartState.zoomHistory;
        if (history.currentIndex > 0) {
            var newIndex = history.currentIndex - 1;
            var prevView = history.zoomStack[newIndex];
            if (prevView) {
                // Save current to history's forward side (for potential "redo")
                setChartState('viewport', __assign({}, prevView));
                setChartState('zoomHistory', 'currentIndex', newIndex);
            }
        }
        else if (chartState.initialView) {
            // At bottom of history, go to initial view
            setChartState('viewport', __assign({}, chartState.initialView));
        }
    },
    canZoomOut: function () {
        return chartState.zoomHistory.currentIndex > 0 || chartState.initialView !== null;
    },
    zoomForward: function () {
        var history = chartState.zoomHistory;
        if (history.currentIndex < history.zoomStack.length - 1) {
            var newIndex = history.currentIndex + 1;
            var nextView = history.zoomStack[newIndex];
            if (nextView) {
                setChartState('viewport', __assign({}, nextView));
                setChartState('zoomHistory', 'currentIndex', newIndex);
            }
        }
    },
    canZoomForward: function () {
        return chartState.zoomHistory.currentIndex < chartState.zoomHistory.zoomStack.length - 1;
    },
    resetZoom: function () {
        if (chartState.initialView) {
            setChartState('viewport', __assign({}, chartState.initialView));
        }
    },
    stepBackZoom: function () {
        var history = chartState.zoomHistory;
        if (history.currentIndex > 0) {
            var newIndex = history.currentIndex - 1;
            var prevView = history.zoomStack[newIndex];
            setChartState('viewport', __assign({}, prevView));
            setChartState('zoomHistory', 'currentIndex', newIndex);
        }
        else if (chartState.initialView) {
            setChartState('viewport', __assign({}, chartState.initialView));
        }
    },
    forceResetZoom: function () {
        if (chartState.initialView) {
            setChartState('zoomHistory', {
                zoomStack: [__assign({}, chartState.initialView)],
                currentIndex: 0
            });
            setChartState('viewport', __assign({}, chartState.initialView));
        }
    },
    setChartInstance: function (instance) {
        setChartState('chartInstance', instance);
    },
    addAnnotation: function (annotation) {
        setChartState('annotations', __spreadArray(__spreadArray([], chartState.annotations, true), [annotation], false));
    },
    removeAnnotation: function (id) {
        setChartState('annotations', chartState.annotations.filter(function (a) { return a.id !== id; }));
    },
    setDrawMode: function (mode) {
        setChartState('drawMode', mode);
    },
    setLoading: function (loading) {
        setChartState('isLoading', loading);
    },
    setLastDataYRange: function (min, max) {
        setChartState('lastDataYMin', min);
        setChartState('lastDataYMax', max);
    },
    getLastDataYRange: function () {
        if (chartState.lastDataYMin !== null && chartState.lastDataYMax !== null && chartState.lastDataYMax > chartState.lastDataYMin) {
            return { min: chartState.lastDataYMin, max: chartState.lastDataYMax };
        }
        return null;
    },
    setYAuto: function (auto) {
        setChartState('yAuto', auto);
    },
    fitYToData: function () {
        var yRange = this.getLastDataYRange();
        if (yRange) {
            var pad = (yRange.max - yRange.min) * 0.04;
            this.setViewport({
                xMin: chartState.viewport.xMin,
                xMax: chartState.viewport.xMax,
                yMin: yRange.min - pad,
                yMax: yRange.max + pad,
            });
        }
    },
    setSeriesVisibility: function (name, visible) {
        setChartState('seriesVisibility', name, visible);
    },
    getSeriesVisibility: function (name) {
        return chartState.seriesVisibility[name] !== false;
    },
    getAllSeriesVisibility: function () {
        return __assign({}, chartState.seriesVisibility);
    },
    clearSeriesVisibility: function () {
        var keys = Object.keys(chartState.seriesVisibility);
        if (keys.length === 0)
            return;
        var patch = {};
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var k = keys_1[_i];
            patch[k] = undefined;
        }
        setChartState('seriesVisibility', patch);
    },
    addDrawing: function (drawing) {
        setChartState('drawings', __spreadArray(__spreadArray([], chartState.drawings, true), [drawing], false));
    },
    clearDrawings: function () {
        setChartState('drawings', []);
    },
    reset: function () {
        setChartState({
            viewport: __assign({}, defaultViewport),
            zoomHistory: { zoomStack: [__assign({}, defaultViewport)], currentIndex: 0 },
            initialView: null,
            annotations: [],
            drawings: [],
            isDrawing: false,
            drawMode: 'pan',
            isLoading: false,
            lastDataYMin: null,
            lastDataYMax: null,
            yAuto: true,
            seriesVisibility: {},
        });
    },
    serialize: function () {
        return {
            viewport: chartState.viewport,
            initialView: chartState.initialView,
            seriesVisibility: chartState.seriesVisibility,
        };
    },
    deserialize: function (state) {
        var _a, _b, _c;
        setChartState({
            viewport: (_a = state.viewport) !== null && _a !== void 0 ? _a : __assign({}, defaultViewport),
            initialView: (_b = state.initialView) !== null && _b !== void 0 ? _b : null,
            seriesVisibility: (_c = state.seriesVisibility) !== null && _c !== void 0 ? _c : {},
        });
    }
};
