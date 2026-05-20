"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTimeseriesData = useTimeseriesData;
exports.useTimeseriesViewport = useTimeseriesViewport;
exports.useTimeseriesExport = useTimeseriesExport;
exports.useTimeseriesColorUpdates = useTimeseriesColorUpdates;
exports.getUpdateChartFn = getUpdateChartFn;
exports.isChartReady = isChartReady;
exports.useTimeseriesChartReady = useTimeseriesChartReady;
/**
 * domain/timeseries/hooks.ts
 * Custom hooks for the timeseries domain.
 */
var solid_js_1 = require("solid-js");
var store_1 = require("./store");
var chartStore_1 = require("../../stores/chartStore");
var datasetStore_1 = require("../../stores/datasetStore");
var uiStore_1 = require("../../stores/uiStore");
var analyticsStore_1 = require("../../stores/analyticsStore");
var useAbortController_1 = require("../../hooks/useAbortController");
var dataFetch_1 = require("../../services/dataFetch");
var api_1 = require("../../services/api");
var useDebouncedEffect_1 = require("../../hooks/useDebouncedEffect");
var debug_1 = require("../../utils/debug");
var constants_1 = require("./constants");
function useTimeseriesData(options, updateChartFn) {
    var _this = this;
    var _a = (0, solid_js_1.createSignal)(false), isLoading = _a[0], setIsLoading = _a[1];
    var _b = (0, solid_js_1.createSignal)(false), isDownsampled = _b[0], setIsDownsampled = _b[1];
    var _c = (0, useAbortController_1.useAbortController)(), abortSignal = _c.signal, abort = _c.abort;
    var fetchInProgress = false;
    var viewportDebounceTimer = null;
    var fetchAndRender = function () { return __awaiter(_this, void 0, void 0, function () {
        var xCol, traces, metadata, timeRange, viewport, start, end, result, seriesConfig, e_1, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    xCol = options.xAxisColumn();
                    traces = options.traceColumns();
                    if (!xCol || traces.length === 0) {
                        (0, debug_1.debugLog)('useTimeseriesData.fetchAndRender skipped', { xCol: xCol, tracesLen: traces.length });
                        return [2 /*return*/];
                    }
                    metadata = datasetStore_1.datasetStore.state.metadata;
                    timeRange = metadata === null || metadata === void 0 ? void 0 : metadata.timeRange;
                    if (!timeRange) {
                        (0, debug_1.debugLog)('useTimeseriesData.fetchAndRender skipped: no timeRange');
                        return [2 /*return*/];
                    }
                    viewport = chartStore_1.chartStore.state.viewport;
                    start = new Date(viewport.xMin || timeRange[0]).toISOString();
                    end = new Date(viewport.xMax || timeRange[1]).toISOString();
                    (0, debug_1.debugLog)('useTimeseriesData.fetchAndRender start', { xCol: xCol, traces: traces, start: start, end: end, viewport: viewport });
                    setIsLoading(true);
                    store_1.timeseriesStore.setLoading(true);
                    store_1.timeseriesStore.setShowSkeletonSignal(true);
                    abort();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, (0, dataFetch_1.fetchTimeseriesData)(start, end, 1200, xCol, traces, abortSignal, options.colorColumn())];
                case 2:
                    result = _a.sent();
                    (0, debug_1.debugLogOnce)('useTimeseriesData-result', 'useTimeseriesData result', {
                        returnedRows: result.returnedRows,
                        downsampled: result.downsampled,
                    });
                    setIsDownsampled(result.downsampled);
                    store_1.timeseriesStore.setDownsampled(result.downsampled);
                    seriesConfig = (0, dataFetch_1.buildSeriesConfig)(result.xValues, result.series, options.mergedColors(), uiStore_1.uiStore.state.filters, result.colorByColumn, options.colorColumn(), !result.downsampled, uiStore_1.uiStore.state.colorScale, uiStore_1.uiStore.state.adaptiveLineFilters);
                    updateChartFn(seriesConfig, viewport.xMin || timeRange[0], viewport.xMax || timeRange[1], viewport.yMin, viewport.yMax);
                    if (analyticsStore_1.analyticsStore.state.rollingEnabled) {
                        void fetchAndCacheRollingBands(start, end, traces.join(','));
                    }
                    if (analyticsStore_1.analyticsStore.state.anomalyEnabled) {
                        void fetchAndCacheAnomalyRegions(start, end, traces.join(','));
                    }
                    return [3 /*break*/, 5];
                case 3:
                    e_1 = _a.sent();
                    if (e_1 instanceof Error && e_1.name === 'AbortError') {
                        (0, debug_1.debugLog)('useTimeseriesData.fetchAndRender aborted (stale request)');
                        return [2 /*return*/];
                    }
                    msg = e_1 instanceof Error ? e_1.message : String(e_1);
                    console.error('useTimeseriesData: Failed to fetch/render timeseries:', msg);
                    uiStore_1.uiStore.addToast({ message: msg, type: 'error', duration: 0 });
                    return [3 /*break*/, 5];
                case 4:
                    setIsLoading(false);
                    store_1.timeseriesStore.setLoading(false);
                    store_1.timeseriesStore.setShowSkeletonSignal(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var fetchAndCacheRollingBands = function (start, end, columns) { return __awaiter(_this, void 0, void 0, function () {
        var response, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, api_1.fetchRollingBands)({ start: start, end: end, columns: columns, window: analyticsStore_1.analyticsStore.state.rollingWindow })];
                case 1:
                    response = _a.sent();
                    store_1.timeseriesStore.setRollingBands(response.bands);
                    return [3 /*break*/, 3];
                case 2:
                    e_2 = _a.sent();
                    console.warn('Failed to fetch rolling bands:', e_2);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var fetchAndCacheAnomalyRegions = function (start, end, columns) { return __awaiter(_this, void 0, void 0, function () {
        var response, e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, api_1.fetchAnomalies)({ start: start, end: end, columns: columns, method: analyticsStore_1.analyticsStore.state.anomalyMethod, threshold: analyticsStore_1.analyticsStore.state.anomalyThreshold })];
                case 1:
                    response = _a.sent();
                    store_1.timeseriesStore.setAnomalyRegions(response.regions);
                    return [3 /*break*/, 3];
                case 2:
                    e_3 = _a.sent();
                    console.warn('Failed to fetch anomaly regions:', e_3);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    // Debounced viewport-triggered fetch
    (0, solid_js_1.createEffect)(function () {
        var viewport = chartStore_1.chartStore.state.viewport;
        var metadata = datasetStore_1.datasetStore.state.metadata;
        if (metadata && viewport && !fetchInProgress) {
            if (viewportDebounceTimer)
                clearTimeout(viewportDebounceTimer);
            viewportDebounceTimer = setTimeout(function () {
                fetchInProgress = true;
                fetchAndRender().finally(function () { fetchInProgress = false; });
            }, constants_1.VIEWPORT_DEBOUNCE_MS);
        }
    });
    var cleanup = function () {
        if (viewportDebounceTimer)
            clearTimeout(viewportDebounceTimer);
        abort();
    };
    (0, solid_js_1.onCleanup)(cleanup);
    return {
        isLoading: isLoading,
        isDownsampled: isDownsampled,
        fetch: fetchAndRender,
        cleanup: cleanup,
    };
}
// =============================================================================
// useTimeseriesViewport — zoom/pan helpers
// =============================================================================
function useTimeseriesViewport() {
    var zoomBadgeText = (0, solid_js_1.createMemo)(function () {
        var vp = chartStore_1.chartStore.state.viewport;
        if (!Number.isFinite(vp.xMin) || !Number.isFinite(vp.xMax))
            return '—';
        var fmt = function (ms) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); };
        return "".concat(fmt(vp.xMin), " \u2013 ").concat(fmt(vp.xMax));
    });
    var handleZoomOut = function () {
        chartStore_1.chartStore.stepBackZoom();
    };
    var handleZoomReset = function () {
        chartStore_1.chartStore.forceResetZoom();
    };
    return {
        zoomBadgeText: zoomBadgeText,
        handleZoomOut: handleZoomOut,
        handleZoomReset: handleZoomReset,
        canZoomOut: function () { return chartStore_1.chartStore.canZoomOut(); },
        canZoomForward: function () { return chartStore_1.chartStore.canZoomForward(); },
        zoomForward: function () { return chartStore_1.chartStore.zoomForward(); },
    };
}
// =============================================================================
// useTimeseriesExport — export handlers
// =============================================================================
var dataFetch_2 = require("../../services/dataFetch");
var exportUtils_1 = require("../../utils/exportUtils");
function useTimeseriesExport(chartInstanceRef) {
    var handleExportPNG = function () {
        var instance = chartInstanceRef();
        if (instance)
            (0, exportUtils_1.exportChartAsPNG)(instance, 'edatime_chart.png');
    };
    var handleExportCSV = function () {
        var cached = (0, dataFetch_2.getCachedData)();
        if (cached)
            (0, exportUtils_1.exportChartAsCSV)(cached.xValues, cached.series, 'edatime_data.csv');
    };
    var handleExportSVG = function () {
        var instance = chartInstanceRef();
        if (instance)
            (0, exportUtils_1.exportChartAsSVG)(instance, 'edatime_chart.svg');
    };
    var handleExportJSON = function () {
        var cached = (0, dataFetch_2.getCachedData)();
        if (cached)
            (0, exportUtils_1.exportChartAsJSON)(cached.xValues, cached.series, 'edatime_data.json');
    };
    var handleExportHTML = function () {
        var instance = chartInstanceRef();
        if (instance)
            (0, exportUtils_1.exportChartAsHTML)(instance, 'edatime_chart.html');
    };
    return {
        handleExportPNG: handleExportPNG,
        handleExportCSV: handleExportCSV,
        handleExportSVG: handleExportSVG,
        handleExportJSON: handleExportJSON,
        handleExportHTML: handleExportHTML,
    };
}
// =============================================================================
// useTimeseriesColorUpdates — debounced color refresh
// =============================================================================
function useTimeseriesColorUpdates(mergedColors, updateChartFn) {
    (0, useDebouncedEffect_1.useDebouncedEffect)(mergedColors, function (colors) {
        var seriesConfig = (0, dataFetch_1.updateCachedColors)(colors);
        if (seriesConfig && updateChartFn) {
            var metadata = datasetStore_1.datasetStore.state.metadata;
            var timeRange = metadata === null || metadata === void 0 ? void 0 : metadata.timeRange;
            var viewport = chartStore_1.chartStore.state.viewport;
            updateChartFn(seriesConfig, viewport.xMin || (timeRange === null || timeRange === void 0 ? void 0 : timeRange[0]), viewport.xMax || (timeRange === null || timeRange === void 0 ? void 0 : timeRange[1]), viewport.yMin, viewport.yMax);
        }
    }, constants_1.COLOR_UPDATE_DEBOUNCE_MS);
}
// =============================================================================
// useTimeseriesChartReady — chart ready callback
// =============================================================================
var _updateChartFn = null;
var _chartReady = false;
function getUpdateChartFn() { return _updateChartFn; }
function isChartReady() { return _chartReady; }
function useTimeseriesChartReady(onChartReady, onEngineReady) {
    var handleChartReady = function (updateFn, chartInstance) {
        _updateChartFn = updateFn;
        _chartReady = true;
        onChartReady === null || onChartReady === void 0 ? void 0 : onChartReady(chartInstance);
    };
    return { handleChartReady: handleChartReady, onEngineReady: onEngineReady };
}
