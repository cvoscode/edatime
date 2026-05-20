"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.datasetStore = void 0;
/**
 * Dataset store — manages dataset metadata, column profiles, and server-provided
 * column classifications for the current session. Revision tracking invalidates
 * the data fetch cache when the dataset changes.
 */
var store_1 = require("solid-js/store");
var dataFetch_1 = require("../services/dataFetch");
// Module-level revision tracker
var _currentRevision = null;
var _a = (0, store_1.createStore)({
    metadata: null,
    columns: [],
    numericCols: [],
    datetimeCols: [],
    xAxisColumn: null,
    selectedColorColumn: null,
    data: null,
    filteredData: null,
    isLoading: false,
    error: null,
    revision: null
}), datasetState = _a[0], setDatasetState = _a[1];
exports.datasetStore = {
    get state() { return datasetState; },
    setMetadata: function (metadata) {
        var _a;
        // Check if revision changed - invalidate cache if so
        var newRevision = (_a = metadata.revision) !== null && _a !== void 0 ? _a : null;
        if (_currentRevision !== null && newRevision !== null && newRevision !== _currentRevision) {
            (0, dataFetch_1.clearCache)();
        }
        _currentRevision = newRevision;
        setDatasetState('metadata', metadata);
        setDatasetState('revision', newRevision);
        if (metadata.timestampColumn && !datasetState.xAxisColumn) {
            setDatasetState('xAxisColumn', metadata.timestampColumn);
        }
    },
    setColumns: function (columns) {
        setDatasetState('columns', columns);
        setDatasetState('numericCols', columns.filter(function (c) { return c.type === 'numeric'; }).map(function (c) { return c.name; }));
        setDatasetState('datetimeCols', columns.filter(function (c) { return c.type === 'datetime'; }).map(function (c) { return c.name; }));
    },
    setNumericCols: function (cols) {
        setDatasetState('numericCols', cols);
    },
    setDatetimeCols: function (cols) {
        setDatasetState('datetimeCols', cols);
    },
    setXAxisColumn: function (col) {
        setDatasetState('xAxisColumn', col);
    },
    setSelectedColorColumn: function (col) {
        setDatasetState('selectedColorColumn', col);
    },
    setData: function (data) {
        setDatasetState('data', data);
    },
    setFilteredData: function (filteredData) {
        setDatasetState('filteredData', filteredData);
    },
    setLoading: function (loading) {
        setDatasetState('isLoading', loading);
    },
    setError: function (error) {
        setDatasetState('error', error);
    },
    reset: function () {
        setDatasetState({
            metadata: null,
            columns: [],
            numericCols: [],
            datetimeCols: [],
            xAxisColumn: null,
            data: null,
            filteredData: null,
            isLoading: false,
            error: null,
            revision: null
        });
        _currentRevision = null;
    },
    serialize: function () {
        return {
            xAxisColumn: datasetState.xAxisColumn,
            colorColumn: datasetState.selectedColorColumn,
        };
    },
    deserialize: function (data) {
        if (data.xAxisColumn !== undefined)
            setDatasetState('xAxisColumn', data.xAxisColumn);
        if (data.selectedColorColumn !== undefined)
            setDatasetState('selectedColorColumn', data.selectedColorColumn);
    }
};
