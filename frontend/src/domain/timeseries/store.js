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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeseriesStore = exports.setPopupScreenPos = exports.popupScreenPos = exports.setAdaptiveFilterPoints = exports.adaptiveFilterPoints = exports.setShowAdaptivePopup = exports.showAdaptivePopup = exports.setShowSkeleton = exports.showSkeleton = exports.setFilterModalColumn = exports.filterModalColumn = exports.setFilterModalOpen = exports.filterModalOpen = exports.setChartEngine = exports.chartEngine = exports.setShowExportMore = exports.showExportMore = exports.setShowLabelsDrawer = exports.showLabelsDrawer = exports.setShowAnalytics = exports.showAnalytics = exports.setDrawWidth = exports.drawWidth = exports.setDrawColor = exports.drawColor = exports.setDrawTool = exports.drawTool = void 0;
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
var store_1 = require("solid-js/store");
var solid_js_1 = require("solid-js");
var constants_1 = require("./constants");
// =============================================================================
// Initial state
// =============================================================================
var initialState = {
    viewport: __assign({}, constants_1.DEFAULT_VIEWPORT),
    zoomHistory: { zoomStack: [__assign({}, constants_1.DEFAULT_VIEWPORT)], currentIndex: 0 },
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
var _p = (0, store_1.createStore)(initialState), state = _p[0], setState = _p[1];
// =============================================================================
// UI Signals (ephemeral state not persisted in store)
// =============================================================================
exports.drawTool = (_a = (0, solid_js_1.createSignal)('none'), _a[0]), exports.setDrawTool = _a[1];
exports.drawColor = (_b = (0, solid_js_1.createSignal)('#ff0055'), _b[0]), exports.setDrawColor = _b[1];
exports.drawWidth = (_c = (0, solid_js_1.createSignal)(2), _c[0]), exports.setDrawWidth = _c[1];
exports.showAnalytics = (_d = (0, solid_js_1.createSignal)(false), _d[0]), exports.setShowAnalytics = _d[1];
exports.showLabelsDrawer = (_e = (0, solid_js_1.createSignal)(false), _e[0]), exports.setShowLabelsDrawer = _e[1];
exports.showExportMore = (_f = (0, solid_js_1.createSignal)(false), _f[0]), exports.setShowExportMore = _f[1];
exports.chartEngine = (_g = (0, solid_js_1.createSignal)(''), _g[0]), exports.setChartEngine = _g[1];
exports.filterModalOpen = (_h = (0, solid_js_1.createSignal)(false), _h[0]), exports.setFilterModalOpen = _h[1];
exports.filterModalColumn = (_j = (0, solid_js_1.createSignal)(null), _j[0]), exports.setFilterModalColumn = _j[1];
exports.showSkeleton = (_k = (0, solid_js_1.createSignal)(false), _k[0]), exports.setShowSkeleton = _k[1];
exports.showAdaptivePopup = (_l = (0, solid_js_1.createSignal)(false), _l[0]), exports.setShowAdaptivePopup = _l[1];
exports.adaptiveFilterPoints = (_m = (0, solid_js_1.createSignal)(null), _m[0]), exports.setAdaptiveFilterPoints = _m[1];
exports.popupScreenPos = (_o = (0, solid_js_1.createSignal)(null), _o[0]), exports.setPopupScreenPos = _o[1];
// =============================================================================
// Store actions
// =============================================================================
exports.timeseriesStore = {
    get state() { return state; },
    // ---- Viewport (synced with chartStore via syncViewportFromChartStore) ----
    setViewport: function (viewport) {
        setState('viewport', __assign({}, viewport));
    },
    setInitialView: function (viewport) {
        setState('initialView', __assign({}, viewport));
        setState('viewport', __assign({}, viewport));
        setState('zoomHistory', { zoomStack: [__assign({}, viewport)], currentIndex: 0 });
    },
    syncFromChartStore: function (viewport, zoomHistory, initialView) {
        setState('viewport', __assign({}, viewport));
        setState('zoomHistory', __assign({}, zoomHistory));
        setState('initialView', initialView ? __assign({}, initialView) : null);
    },
    // ---- Series selection ----
    setSelectedColumns: function (columns) {
        setState('selectedColumns', columns);
    },
    setColorColumn: function (col) {
        setState('colorColumn', col);
    },
    setHiddenColumns: function (columns) {
        setState('hiddenColumns', columns);
    },
    setColumnColor: function (col, color) {
        setState('colors', col, color);
    },
    setFilter: function (col, range) {
        setState('filters', col, range);
    },
    removeFilter: function (col) {
        setState('filters', col, undefined);
    },
    toggleSeriesVisibility: function (col) {
        setState('seriesVisibility', col, !state.seriesVisibility[col]);
    },
    // ---- Drawing ----
    setDrawMode: function (mode) {
        setState('drawMode', mode);
        (0, exports.setDrawTool)(mode === 'pan' ? 'none' : mode);
    },
    addDrawing: function (drawing) {
        setState('drawings', function (prev) { return __spreadArray(__spreadArray([], prev, true), [drawing], false); });
    },
    clearDrawings: function () {
        setState('drawings', []);
    },
    removeDrawing: function (id) {
        setState('drawings', function (prev) { return prev.filter(function (d) { return d.id !== id; }); });
    },
    // ---- Overlays ----
    setRollingBands: function (bands) {
        setState('rollingBands', bands);
    },
    setAnomalyRegions: function (regions) {
        setState('anomalyRegions', regions);
    },
    // ---- Chart meta ----
    setChartTitle: function (title) {
        setState('chartTitle', title);
    },
    setAxisLabels: function (x, y) {
        setState('xAxisLabel', x);
        setState('yAxisLabel', y);
    },
    // ---- Status ----
    setLoading: function (loading) {
        setState('isLoading', loading);
    },
    setDownsampled: function (downsampled) {
        setState('isDownsampled', downsampled);
    },
    setLastDataRange: function (yMin, yMax) {
        setState('lastDataYMin', yMin);
        setState('lastDataYMax', yMax);
    },
    // ---- Drawing tool state (signals-based) ----
    getDrawTool: function () { return exports.drawTool; },
    getDrawColor: function () { return exports.drawColor; },
    getDrawWidth: function () { return exports.drawWidth; },
    setDrawToolSignal: function (tool) { (0, exports.setDrawTool)(tool); },
    setDrawColorSignal: function (color) { (0, exports.setDrawColor)(color); },
    setDrawWidthSignal: function (width) { (0, exports.setDrawWidth)(width); },
    // ---- UI signal accessors ----
    getShowAnalytics: function () { return (0, exports.showAnalytics)(); },
    getShowLabelsDrawer: function () { return (0, exports.showLabelsDrawer)(); },
    getShowExportMore: function () { return exports.showExportMore; },
    getChartEngine: function () { return (0, exports.chartEngine)(); },
    getFilterModalOpen: function () { return (0, exports.filterModalOpen)(); },
    getFilterModalColumn: function () { return (0, exports.filterModalColumn)(); },
    getShowSkeleton: function () { return (0, exports.showSkeleton)(); },
    getShowAdaptivePopup: function () { return (0, exports.showAdaptivePopup)(); },
    getAdaptiveFilterPoints: function () { return (0, exports.adaptiveFilterPoints)(); },
    getPopupScreenPos: function () { return (0, exports.popupScreenPos)(); },
    setShowAnalyticsSignal: function (v) { (0, exports.setShowAnalytics)(v); },
    setShowLabelsDrawerSignal: function (v) { (0, exports.setShowLabelsDrawer)(v); },
    setShowExportMoreSignal: function (v) { (0, exports.setShowExportMore)(v); },
    setChartEngineSignal: function (name) { (0, exports.setChartEngine)(name); },
    setFilterModalOpenSignal: function (v) { (0, exports.setFilterModalOpen)(v); },
    setFilterModalColumnSignal: function (col) { (0, exports.setFilterModalColumn)(col); },
    setShowSkeletonSignal: function (v) { (0, exports.setShowSkeleton)(v); },
    setShowAdaptivePopupSignal: function (v) { (0, exports.setShowAdaptivePopup)(v); },
    setAdaptiveFilterPointsSignal: function (pts) { (0, exports.setAdaptiveFilterPoints)(pts); },
    setPopupScreenPosSignal: function (pos) { (0, exports.setPopupScreenPos)(pos); },
};
