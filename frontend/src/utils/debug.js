"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLog = debugLog;
exports.debugLogOnce = debugLogOnce;
exports.resetDebugLogs = resetDebugLogs;
var DEBUG = import.meta.env.DEV;
function debugLog() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    if (DEBUG) {
        console.debug.apply(console, args);
    }
}
function debugLogOnce(key) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    if (DEBUG) {
        if (!_loggedKeys.has(key)) {
            _loggedKeys.add(key);
            console.debug.apply(console, args);
        }
    }
}
var _loggedKeys = new Set();
function resetDebugLogs() {
    _loggedKeys.clear();
}
