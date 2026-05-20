"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLORMAPS = void 0;
exports.getColorScale = getColorScale;
exports.correlationColor = correlationColor;
exports.dataColor = dataColor;
exports.getColorScaleGradientCSS = getColorScaleGradientCSS;
exports.getColorPalette = getColorPalette;
exports.getColorForValue = getColorForValue;
exports.isDiverging = isDiverging;
exports.getColorScaleDomain = getColorScaleDomain;
exports.getContrastTextColor = getContrastTextColor;
exports.getCategoryColor = getCategoryColor;
exports.buildCategoricalColorGroups = buildCategoricalColorGroups;
exports.sampleGradient = sampleGradient;
var chroma_js_1 = require("chroma-js");
exports.COLORMAPS = {
    viridis: {
        name: 'viridis',
        label: 'Viridis',
        desc: 'Perceptually uniform, colorblind-safe. Purple to yellow.',
        diverging: false,
        domain: [0, 1],
        colors: chroma_js_1.default.scale(['#440154', '#21918c', '#fde725']).colors(6),
    },
    plasma: {
        name: 'plasma',
        label: 'Plasma',
        desc: 'Warm magenta to yellow. Great for density plots.',
        diverging: false,
        domain: [0, 1],
        colors: chroma_js_1.default.scale(['#0d0887', '#cc4778', '#f0f921']).colors(6),
    },
    inferno: {
        name: 'inferno',
        label: 'Inferno',
        desc: 'High-contrast black to orange. Punchy and dramatic.',
        diverging: false,
        domain: [0, 1],
        colors: chroma_js_1.default.scale(['#000004', '#fc4a1a', '#fcfdbf']).colors(6),
    },
    coolwarm: {
        name: 'coolwarm',
        label: 'Coolwarm',
        desc: 'Smooth diverging blue to pink. Easy on the eyes.',
        diverging: true,
        domain: [-1, 1],
        colors: chroma_js_1.default.scale(['#3b4cc0', '#ffffff', '#b40426']).colors(7),
    },
    rdbu: {
        name: 'rdbu',
        label: 'RdBu',
        desc: 'Classic red-blue diverging. Gold standard for correlations.',
        diverging: true,
        domain: [-1, 1],
        colors: chroma_js_1.default.scale(['#2166ac', '#f7f7f7', '#b2182b']).colors(7),
    },
};
function getColorScale(name) {
    var def = exports.COLORMAPS[name];
    return chroma_js_1.default.scale(def.colors).domain(def.domain);
}
function correlationColor(value, scaleName) {
    if (scaleName === void 0) { scaleName = 'rdbu'; }
    if (value === null)
        return 'var(--color-surface)';
    var v = Math.max(-1, Math.min(1, value));
    var scale = getColorScale(scaleName);
    return scale(v).css();
}
function dataColor(value, min, max, scaleName) {
    if (scaleName === void 0) { scaleName = 'viridis'; }
    var normalized = max === min ? 0.5 : (value - min) / (max - min);
    var scale = getColorScale(scaleName);
    return scale(Math.max(0, Math.min(1, normalized))).css();
}
function getColorScaleGradientCSS(scaleName, steps) {
    if (steps === void 0) { steps = 7; }
    var def = exports.COLORMAPS[scaleName];
    var scale = chroma_js_1.default.scale(def.colors).domain(def.domain);
    var stops = [];
    for (var i = 0; i < steps; i++) {
        var t = i / (steps - 1);
        var val = def.domain[0] + t * (def.domain[1] - def.domain[0]);
        stops.push("".concat(scale(val).css(), " ").concat(Math.round(t * 100), "%"));
    }
    return "linear-gradient(to right, ".concat(stops.join(', '), ")");
}
function getColorPalette(scaleName, count) {
    if (count === void 0) { count = 6; }
    var def = exports.COLORMAPS[scaleName];
    return chroma_js_1.default.scale(def.colors).domain(def.domain).colors(count);
}
function getColorForValue(value, scaleName, domain) {
    if (domain === void 0) { domain = [0, 1]; }
    var scale = getColorScale(scaleName);
    var min = domain[0], max = domain[1];
    var normalized = max === min ? 0.5 : (value - min) / (max - min);
    return scale(Math.max(0, Math.min(1, normalized))).css();
}
function isDiverging(scaleName) {
    return exports.COLORMAPS[scaleName].diverging;
}
function getColorScaleDomain(scaleName) {
    return exports.COLORMAPS[scaleName].domain;
}
function getContrastTextColor(bgColor) {
    if (bgColor.startsWith('var('))
        return '#ffffff';
    try {
        var lum = (0, chroma_js_1.default)(bgColor).luminance();
        return lum > 0.5 ? '#000000' : '#ffffff';
    }
    catch (_a) {
        return '#ffffff';
    }
}
var DISTRIBUTION_GROUP_COLORS = [
    '#4a9eff', '#ff6b6b', '#52c41a', '#ffc53d', '#a0d911',
    '#5ad8a6', '#ff9d4d', '#7ec8ff', '#f78fb3', '#9bde6d', '#ffd166',
];
function getCategoryColor(index) {
    return DISTRIBUTION_GROUP_COLORS[index % DISTRIBUTION_GROUP_COLORS.length];
}
var LOW_CARDINALITY_LIMIT = 8;
function normalizeCategoryLabel(label) {
    if (label == null)
        return 'Missing';
    var text = String(label).trim();
    return text || 'Missing';
}
function buildCategoricalColorGroups(labels) {
    if (!Array.isArray(labels) || labels.length === 0)
        return null;
    var categories = [];
    var labelToIndex = new Map();
    for (var _i = 0, labels_1 = labels; _i < labels_1.length; _i++) {
        var rawLabel = labels_1[_i];
        var label = normalizeCategoryLabel(rawLabel);
        if (labelToIndex.has(label))
            continue;
        labelToIndex.set(label, categories.length);
        categories.push(label);
        if (categories.length > LOW_CARDINALITY_LIMIT)
            return null;
    }
    if (categories.length === 0)
        return null;
    return {
        categories: categories,
        colorByLabel: new Map(categories.map(function (l, i) { return [l, getCategoryColor(i)]; })),
    };
}
function hexToRgb(hex) {
    var clean = String(hex).replace('#', '');
    return {
        r: parseInt(clean.length === 3 ? clean.split('').map(function (c) { return c + c; }).join('') : clean, 16) >> 16 & 255,
        g: parseInt(clean.length === 3 ? clean.split('').map(function (c) { return c + c; }).join('') : clean, 16) >> 8 & 255,
        b: parseInt(clean.length === 3 ? clean.split('').map(function (c) { return c + c; }).join('') : clean, 16) & 255,
    };
}
function rgbToHex(_a) {
    var r = _a.r, g = _a.g, b = _a.b;
    var toHex = function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); };
    return "#".concat(toHex(r)).concat(toHex(g)).concat(toHex(b));
}
function sampleGradient(stops, t) {
    var n = stops.length;
    if (n === 0)
        return '#4a9eff';
    if (n === 1)
        return stops[0];
    var clamped = Math.max(0, Math.min(1, t));
    var scaled = clamped * (n - 1);
    var i0 = Math.floor(scaled);
    var i1 = Math.min(n - 1, i0 + 1);
    var frac = scaled - i0;
    var a = hexToRgb(stops[i0]);
    var b = hexToRgb(stops[i1]);
    return rgbToHex({
        r: a.r + (b.r - a.r) * frac,
        g: a.g + (b.g - a.g) * frac,
        b: a.b + (b.b - a.b) * frac,
    });
}
