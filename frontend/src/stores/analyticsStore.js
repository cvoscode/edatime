"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsStore = void 0;
/**
 * Analytics store — rolling statistics, anomaly detection, and correlation data for the timeseries page.
 * Uses solid-js store for reactive state management.
 */
var store_1 = require("solid-js/store");
var _a = (0, store_1.createStore)({
    rollingEnabled: false,
    rollingWindow: 50,
    anomalyEnabled: false,
    anomalyMethod: 'zscore',
    anomalyThreshold: 3.0,
    correlations: null
}), analyticsState = _a[0], setAnalyticsState = _a[1];
exports.analyticsStore = {
    get state() { return analyticsState; },
    setRollingEnabled: function (v) {
        setAnalyticsState('rollingEnabled', v);
    },
    setRollingWindow: function (n) {
        setAnalyticsState('rollingWindow', n);
    },
    setAnomalyEnabled: function (v) {
        setAnalyticsState('anomalyEnabled', v);
    },
    setAnomalyMethod: function (m) {
        setAnalyticsState('anomalyMethod', m);
    },
    setAnomalyThreshold: function (t) {
        setAnalyticsState('anomalyThreshold', t);
    },
    setCorrelations: function (corr) {
        setAnalyticsState('correlations', corr);
    },
    reset: function () {
        setAnalyticsState({
            rollingEnabled: false,
            rollingWindow: 50,
            anomalyEnabled: false,
            anomalyMethod: 'zscore',
            anomalyThreshold: 3.0,
            correlations: null
        });
    }
};
