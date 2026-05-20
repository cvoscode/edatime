"use strict";
/**
 * Phase 7.1: Domain Types
 *
 * Refined discriminated union types for each analytics domain.
 * Each domain is tagged with a `kind` field for exhaustive matching.
 *
 * PREFERRED IMPORTS:
 *   import type { Domain } from '../types';           // union type
 *   import type { TimeseriesDomain } from '../types'; // specific domain
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTimeseries = isTimeseries;
exports.isScatter = isScatter;
exports.isFft = isFft;
exports.isSpectrogram = isSpectrogram;
exports.isHeatmap = isHeatmap;
exports.isDrift = isDrift;
exports.isCausal = isCausal;
function isTimeseries(d) {
    return d.kind === 'timeseries';
}
function isScatter(d) {
    return d.kind === 'scatter';
}
function isFft(d) {
    return d.kind === 'fft';
}
function isSpectrogram(d) {
    return d.kind === 'spectrogram';
}
function isHeatmap(d) {
    return d.kind === 'heatmap';
}
function isDrift(d) {
    return d.kind === 'drift';
}
function isCausal(d) {
    return d.kind === 'causal';
}
