"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDebouncedEffect = useDebouncedEffect;
var solid_js_1 = require("solid-js");
function useDebouncedEffect(source, fn, delay) {
    var timer = null;
    (0, solid_js_1.createEffect)(function () {
        var value = source();
        if (timer !== null) {
            clearTimeout(timer);
        }
        timer = setTimeout(function () {
            fn(value);
        }, delay);
    });
    (0, solid_js_1.onCleanup)(function () {
        if (timer !== null) {
            clearTimeout(timer);
        }
    });
}
