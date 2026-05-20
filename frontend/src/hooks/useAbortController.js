"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAbortController = useAbortController;
function useAbortController() {
    var controller = new AbortController();
    return {
        get signal() {
            return controller.signal;
        },
        abort: function () {
            controller.abort();
            controller = new AbortController();
        },
        restart: function () {
            controller = new AbortController();
        },
    };
}
