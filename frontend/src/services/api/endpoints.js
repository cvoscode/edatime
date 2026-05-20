"use strict";
// services/api/endpoints.ts
// All API endpoint functions using client.ts
// NO SolidJS imports
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
exports.fetchMetadata = fetchMetadata;
exports.fetchTimeseriesRange = fetchTimeseriesRange;
exports.fetchTimeseriesData = fetchTimeseriesData;
exports.fetchRollingBands = fetchRollingBands;
exports.fetchAnomalies = fetchAnomalies;
exports.fetchFftData = fetchFftData;
exports.fetchSpectrogram = fetchSpectrogram;
exports.fetchScatterCorrelations = fetchScatterCorrelations;
exports.fetchCorrelationMatrix = fetchCorrelationMatrix;
exports.fetchScatterPoints = fetchScatterPoints;
exports.uploadPreview = uploadPreview;
exports.uploadIngest = uploadIngest;
exports.dbConnect = dbConnect;
exports.dbTables = dbTables;
exports.dbLoad = dbLoad;
exports.dbDisconnect = dbDisconnect;
exports.fetchSampleETTm2 = fetchSampleETTm2;
exports.clearSampleCache = clearSampleCache;
var client_1 = require("./client");
// =============================================================================
// Metadata API
// =============================================================================
function fetchMetadata() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/metadata'))];
        });
    });
}
function fetchTimeseriesRange() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/timeseries/range'))];
        });
    });
}
// =============================================================================
// Timeseries data — returns raw Arrow Response for streaming decode
// =============================================================================
function fetchTimeseriesData(params) {
    return __awaiter(this, void 0, void 0, function () {
        var url;
        return __generator(this, function (_a) {
            url = (0, client_1.buildUrl)('/data', {
                start: params.start,
                end: params.end,
                width: params.width,
                columns: params.columns.join(','),
                color_column: params.colorColumn,
            });
            // Returns raw Response — caller handles Arrow decoding
            return [2 /*return*/, (0, client_1.getJson)(url)];
        });
    });
}
// =============================================================================
// Analytics API
// =============================================================================
function fetchRollingBands(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/analytics/rolling', {
                    start: params.start,
                    end: params.end,
                    columns: params.columns,
                    window: params.window,
                }))];
        });
    });
}
function fetchAnomalies(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/analytics/anomalies', {
                    start: params.start,
                    end: params.end,
                    columns: params.columns,
                    method: params.method,
                    threshold: params.threshold,
                }))];
        });
    });
}
function fetchFftData(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/analytics/fft', {
                    start: params.start,
                    end: params.end,
                    columns: params.columns,
                    max_points: params.maxPoints,
                }))];
        });
    });
}
function fetchSpectrogram(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/analytics/spectrogram', {
                    start: params.start,
                    end: params.end,
                    column: params.column,
                    window_size: params.windowSize,
                    hop_size: params.hopSize,
                    max_points: params.maxPoints,
                }))];
        });
    });
}
// =============================================================================
// Scatter API
// =============================================================================
function fetchScatterCorrelations(base_1) {
    return __awaiter(this, arguments, void 0, function (base, threshold) {
        if (threshold === void 0) { threshold = 0.7; }
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/scatter/correlations', {
                    threshold: threshold,
                    base: base && String(base).trim() !== '' ? base : undefined,
                }))];
        });
    });
}
function fetchCorrelationMatrix() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/scatter/correlations/matrix'))];
        });
    });
}
function fetchScatterPoints(params) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, start, end;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            payload = {
                x: String(params.x),
                y: String(params.y),
                limit: Number(params.limit),
            };
            if (params.color !== null && params.color !== undefined && String(params.color).trim() !== '') {
                payload.color = String(params.color);
            }
            if (params.size !== null && params.size !== undefined && String(params.size).trim() !== '') {
                payload.size = String(params.size);
            }
            start = Number((_a = params.options) === null || _a === void 0 ? void 0 : _a.start);
            end = Number((_b = params.options) === null || _b === void 0 ? void 0 : _b.end);
            if (Number.isFinite(start) && Number.isFinite(end)) {
                payload.start = start;
                payload.end = end;
            }
            if (Array.isArray((_c = params.options) === null || _c === void 0 ? void 0 : _c.filters) && params.options.filters.length > 0) {
                payload.filters = JSON.stringify(params.options.filters);
            }
            if (Array.isArray((_d = params.options) === null || _d === void 0 ? void 0 : _d.line_filters) && params.options.line_filters.length > 0) {
                payload.line_filters = JSON.stringify(params.options.line_filters);
            }
            return [2 /*return*/, (0, client_1.postJson)((0, client_1.buildUrl)('/scatter/points'), payload, params.signal)];
        });
    });
}
// =============================================================================
// Upload API
// =============================================================================
function uploadPreview(file) {
    return __awaiter(this, void 0, void 0, function () {
        var formData, res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    formData = new FormData();
                    formData.append('file', file);
                    return [4 /*yield*/, fetch((0, client_1.buildUrl)('/upload/preview'), { method: 'POST', body: formData })];
                case 1:
                    res = _a.sent();
                    if (!!res.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, res.text().catch(function () { return ''; })];
                case 2:
                    text = _a.sent();
                    throw new Error("Preview failed (".concat(res.status, ") ").concat(text));
                case 3: return [2 /*return*/, res.json()];
            }
        });
    });
}
function uploadIngest(file, options) {
    return __awaiter(this, void 0, void 0, function () {
        var formData, res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    formData = new FormData();
                    formData.append('file', file);
                    if (options === null || options === void 0 ? void 0 : options.columns)
                        formData.append('columns', options.columns.join(','));
                    if ((options === null || options === void 0 ? void 0 : options.max_rows) != null)
                        formData.append('n_rows', String(options.max_rows));
                    if ((options === null || options === void 0 ? void 0 : options.skip_rows) != null)
                        formData.append('skip_rows', String(options.skip_rows));
                    if (options === null || options === void 0 ? void 0 : options.time_start)
                        formData.append('time_start', options.time_start);
                    if (options === null || options === void 0 ? void 0 : options.time_end)
                        formData.append('time_end', options.time_end);
                    if (options === null || options === void 0 ? void 0 : options.time_column)
                        formData.append('time_column', options.time_column);
                    return [4 /*yield*/, fetch((0, client_1.buildUrl)('/upload'), { method: 'POST', body: formData })];
                case 1:
                    res = _a.sent();
                    if (!!res.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, res.text().catch(function () { return ''; })];
                case 2:
                    text = _a.sent();
                    throw new Error("Ingest failed (".concat(res.status, ") ").concat(text));
                case 3: return [2 /*return*/, res.json()];
            }
        });
    });
}
// =============================================================================
// Database API
// =============================================================================
function dbConnect(connectionString_1) {
    return __awaiter(this, arguments, void 0, function (connectionString, schema) {
        if (schema === void 0) { schema = 'public'; }
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.postJson)((0, client_1.buildUrl)('/database/connect'), { connection_string: connectionString, schema: schema, load_snapshot: false })];
        });
    });
}
function dbTables() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.getJson)((0, client_1.buildUrl)('/database/tables'))];
        });
    });
}
function dbLoad(table, options) {
    return __awaiter(this, void 0, void 0, function () {
        var body;
        var _a;
        return __generator(this, function (_b) {
            body = {
                schema: (_a = options === null || options === void 0 ? void 0 : options.schema) !== null && _a !== void 0 ? _a : 'public',
                table: table,
                time_column: (options === null || options === void 0 ? void 0 : options.time_column) || null,
                limit: 1000000,
            };
            if ((options === null || options === void 0 ? void 0 : options.max_rows) != null)
                body.max_rows = options.max_rows;
            if (options === null || options === void 0 ? void 0 : options.time_start)
                body.time_start = options.time_start;
            if (options === null || options === void 0 ? void 0 : options.time_end)
                body.time_end = options.time_end;
            return [2 /*return*/, (0, client_1.postJson)((0, client_1.buildUrl)('/database/load'), body)];
        });
    });
}
function dbDisconnect() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, client_1.postJson)((0, client_1.buildUrl)('/database/disconnect'), {})];
        });
    });
}
// =============================================================================
// Sample data API
// =============================================================================
// In-memory cache for sample datasets to avoid re-fetching
var _sampleFileCache = {};
function fetchSampleETTm2() {
    return __awaiter(this, arguments, void 0, function (useParquet) {
        var cacheKey, filename, res, fallbackRes, blob_1, file_1, blob, file;
        if (useParquet === void 0) { useParquet = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cacheKey = useParquet ? 'ettm2-parquet' : 'ettm2-csv';
                    if (_sampleFileCache[cacheKey]) {
                        return [2 /*return*/, _sampleFileCache[cacheKey]];
                    }
                    filename = useParquet ? 'ETTm2.parquet' : 'ETTm2.csv';
                    return [4 /*yield*/, fetch((0, client_1.buildUrl)("/sample/".concat(filename)))];
                case 1:
                    res = _a.sent();
                    if (!!res.ok) return [3 /*break*/, 5];
                    if (!(res.status === 404 && useParquet)) return [3 /*break*/, 4];
                    return [4 /*yield*/, fetch((0, client_1.buildUrl)('/sample/ETTm2.csv'))];
                case 2:
                    fallbackRes = _a.sent();
                    if (!fallbackRes.ok)
                        throw new Error("Failed to fetch ETTm2 sample: ".concat(fallbackRes.status));
                    return [4 /*yield*/, fallbackRes.blob()];
                case 3:
                    blob_1 = _a.sent();
                    file_1 = new File([blob_1], 'ETTm2.csv', { type: 'text/csv' });
                    _sampleFileCache['ettm2-csv'] = file_1;
                    _sampleFileCache['ettm2-parquet'] = file_1;
                    return [2 /*return*/, file_1];
                case 4: throw new Error("Failed to fetch ETTm2 sample: ".concat(res.status));
                case 5: return [4 /*yield*/, res.blob()];
                case 6:
                    blob = _a.sent();
                    file = new File([blob], filename, { type: useParquet ? 'application/octet-stream' : 'text/csv' });
                    _sampleFileCache[cacheKey] = file;
                    return [2 /*return*/, file];
            }
        });
    });
}
function clearSampleCache() {
    Object.keys(_sampleFileCache).forEach(function (k) { return delete _sampleFileCache[k]; });
}
