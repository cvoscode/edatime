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
exports.uiStore = void 0;
/**
 * UI store — manages theme, color scale, plot theme, sidebar, toasts, and upload panel.
 * Persists theme/colorScale/plotTheme to localStorage.
 */
var store_1 = require("solid-js/store");
var STORAGE_KEY = 'edatime-theme';
var COLOR_SCALE_KEY = 'edatime-color-scale';
var PLOT_THEME_KEY = 'edatime-plot-theme';
function getSavedTheme() {
    try {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'system') {
            return saved;
        }
    }
    catch (_a) { }
    return 'dark';
}
function getSavedColorScale() {
    try {
        var saved = localStorage.getItem(COLOR_SCALE_KEY);
        if (saved === 'viridis' || saved === 'plasma' || saved === 'inferno' || saved === 'coolwarm' || saved === 'rdbu') {
            return saved;
        }
    }
    catch (_a) { }
    return 'rdbu';
}
function getSavedPlotTheme() {
    try {
        var saved = localStorage.getItem(PLOT_THEME_KEY);
        if (saved === 'auto' || saved === 'light' || saved === 'dark') {
            return saved;
        }
    }
    catch (_a) { }
    return 'auto';
}
function resolveTheme(theme) {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return theme;
}
function applyTheme(theme) {
    var resolved = resolveTheme(theme);
    if (resolved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    else {
        document.documentElement.removeAttribute('data-theme');
    }
}
if (typeof window !== 'undefined') {
    applyTheme(getSavedTheme());
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        var current = uiState.theme;
        if (current === 'system') {
            applyTheme('system');
        }
    });
}
var _a = (0, store_1.createStore)({
    theme: getSavedTheme(),
    colorScale: getSavedColorScale(),
    plotTheme: getSavedPlotTheme(),
    sidebarOpen: true,
    toasts: [],
    isUploadPanelOpen: false,
}), uiState = _a[0], setUiState = _a[1];
exports.uiStore = {
    get state() { return uiState; },
    setTheme: function (theme) {
        setUiState('theme', theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        }
        catch (_a) { }
        applyTheme(theme);
    },
    setColorScale: function (scale) {
        setUiState('colorScale', scale);
        try {
            localStorage.setItem(COLOR_SCALE_KEY, scale);
        }
        catch (_a) { }
    },
    setPlotTheme: function (mode) {
        setUiState('plotTheme', mode);
        try {
            localStorage.setItem(PLOT_THEME_KEY, mode);
        }
        catch (_a) { }
    },
    toggleSidebar: function () {
        setUiState('sidebarOpen', !uiState.sidebarOpen);
    },
    addToast: function (toast) {
        var _this = this;
        var _a;
        var id = Math.random().toString(36).slice(2);
        setUiState('toasts', __spreadArray(__spreadArray([], uiState.toasts, true), [__assign(__assign({}, toast), { id: id })], false));
        if (toast.duration !== 0) {
            setTimeout(function () { return _this.removeToast(id); }, (_a = toast.duration) !== null && _a !== void 0 ? _a : 3000);
        }
    },
    removeToast: function (id) {
        setUiState('toasts', uiState.toasts.filter(function (t) { return t.id !== id; }));
    },
    setToasts: function (toasts) {
        setUiState('toasts', toasts);
    },
    setUploadPanelOpen: function (open) {
        setUiState('isUploadPanelOpen', open);
    },
    reset: function () {
        setUiState({
            sidebarOpen: true,
            toasts: [],
            isUploadPanelOpen: false,
        });
        // Preserve theme, colorScale, plotTheme — they persist to localStorage
    },
    serialize: function () {
        return {
            theme: uiState.theme,
            colorScale: uiState.colorScale,
            plotTheme: uiState.plotTheme,
        };
    },
    deserialize: function (state) {
        var _a, _b, _c;
        setUiState({
            theme: (_a = state.theme) !== null && _a !== void 0 ? _a : 'dark',
            colorScale: (_b = state.colorScale) !== null && _b !== void 0 ? _b : 'rdbu',
            plotTheme: (_c = state.plotTheme) !== null && _c !== void 0 ? _c : 'auto',
        });
    }
};
