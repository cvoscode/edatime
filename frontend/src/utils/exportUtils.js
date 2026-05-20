"use strict";
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
exports.downloadUrl = downloadUrl;
exports.downloadBlob = downloadBlob;
exports.downloadString = downloadString;
exports.exportChartAsPNG = exportChartAsPNG;
exports.exportChartAsCSV = exportChartAsCSV;
exports.exportChartAsSVG = exportChartAsSVG;
exports.exportChartAsHTML = exportChartAsHTML;
exports.exportChartAsJSON = exportChartAsJSON;
function downloadUrl(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(function () { return URL.revokeObjectURL(url); }, 10000);
}
function downloadString(text, filename, mimeType) {
    if (mimeType === void 0) { mimeType = 'text/csv'; }
    var blob = new Blob([text], { type: "".concat(mimeType, ";charset=utf-8") });
    downloadBlob(blob, filename);
}
function exportChartAsPNG(chartInstance, filename) {
    var _a, _b, _c;
    if (filename === void 0) { filename = 'edatime_chart.png'; }
    if (!chartInstance)
        return;
    var canvas = (_b = (_a = chartInstance.getCanvas) === null || _a === void 0 ? void 0 : _a.call(chartInstance)) !== null && _b !== void 0 ? _b : (_c = chartInstance.renderer) === null || _c === void 0 ? void 0 : _c.canvas;
    if (canvas) {
        downloadUrl(canvas.toDataURL('image/png'), filename);
    }
}
function exportChartAsCSV(xValues, series, filename) {
    if (filename === void 0) { filename = 'edatime_data.csv'; }
    var cols = Object.keys(series);
    var header = __spreadArray(['timestamp'], cols, true).join(',');
    var rows = [header];
    var len = xValues.length;
    var _loop_1 = function (i) {
        var x = new Date(xValues[i]).toISOString();
        var values = cols.map(function (c) {
            var _a;
            var v = (_a = series[c]) === null || _a === void 0 ? void 0 : _a[i];
            return v !== undefined ? String(v) : '';
        });
        rows.push(__spreadArray([x], values, true).join(','));
    };
    for (var i = 0; i < len; i++) {
        _loop_1(i);
    }
    downloadString(rows.join('\n'), filename, 'text/csv');
}
function exportChartAsSVG(chartInstance, filename) {
    var _a;
    if (filename === void 0) { filename = 'edatime_chart.svg'; }
    if (!chartInstance)
        return;
    var svg = (_a = chartInstance.exportSVG) === null || _a === void 0 ? void 0 : _a.call(chartInstance);
    if (svg) {
        downloadString(svg, filename, 'image/svg+xml');
    }
}
function exportChartAsHTML(chartInstance, filename) {
    var _a, _b, _c;
    if (filename === void 0) { filename = 'edatime_chart.html'; }
    if (!chartInstance)
        return;
    // Get the main chart canvas
    var canvas = (_b = (_a = chartInstance.getCanvas) === null || _a === void 0 ? void 0 : _a.call(chartInstance)) !== null && _b !== void 0 ? _b : (_c = chartInstance.renderer) === null || _c === void 0 ? void 0 : _c.canvas;
    if (!canvas)
        return;
    var chartDataUrl = canvas.toDataURL('image/png');
    // Try to get overlay canvas if present
    var overlayCanvas = document.querySelector('#timeseries-overlays canvas');
    var overlayDataUrl = overlayCanvas ? overlayCanvas.toDataURL('image/png') : '';
    // Build self-contained HTML
    var html = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>Edatime Chart Export</title>\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body {\n      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n      background: #0f0f1a;\n      color: #d2daf0;\n    }\n    .chart-container {\n      position: relative;\n      width: 100vw;\n      height: 100vh;\n    }\n    .chart-img {\n      position: absolute;\n      top: 0;\n      left: 0;\n      width: 100%;\n      height: 100%;\n    }\n    .overlay-img {\n      position: absolute;\n      top: 0;\n      left: 0;\n      width: 100%;\n      height: 100%;\n      pointer-events: none;\n    }\n    .caption {\n      position: absolute;\n      bottom: 16px;\n      left: 50%;\n      transform: translateX(-50%);\n      background: rgba(0, 0, 0, 0.6);\n      padding: 6px 16px;\n      border-radius: 4px;\n      font-size: 12px;\n      color: rgba(255, 255, 255, 0.7);\n    }\n  </style>\n</head>\n<body>\n  <div class=\"chart-container\">\n    <img class=\"chart-img\" src=\"".concat(chartDataUrl, "\" alt=\"Edatime chart\" />\n    ").concat(overlayDataUrl ? "<img class=\"overlay-img\" src=\"".concat(overlayDataUrl, "\" alt=\"Chart overlays\" />") : '', "\n    <div class=\"caption\">Generated by Edatime</div>\n  </div>\n</body>\n</html>");
    downloadBlob(new Blob([html], { type: 'text/html' }), filename);
}
function exportChartAsJSON(xValues, series, filename) {
    var _a, _b;
    if (filename === void 0) { filename = 'edatime_data.json'; }
    var cols = Object.keys(series);
    var rows = [];
    var len = xValues.length;
    for (var i = 0; i < len; i++) {
        var row = { timestamp: xValues[i] };
        for (var _i = 0, cols_1 = cols; _i < cols_1.length; _i++) {
            var c = cols_1[_i];
            row[c] = (_b = (_a = series[c]) === null || _a === void 0 ? void 0 : _a[i]) !== null && _b !== void 0 ? _b : null;
        }
        rows.push(row);
    }
    downloadString(JSON.stringify(rows, null, 2), filename, 'application/json');
}
