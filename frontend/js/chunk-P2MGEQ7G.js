// frontend/src/debug.ts
var DEBUG = (() => {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("debug") === "1") return true;
    if (qs.get("debug") === "true") return true;
    return window.localStorage?.getItem("edatimeDebug") === "1";
  } catch {
    return false;
  }
})();
function dbg(...args) {
  if (!DEBUG) return;
  console.log("[edatime]", ...args);
}
function dbgGroup(label, fn) {
  if (!DEBUG) return fn?.();
  console.groupCollapsed(`[edatime] ${label}`);
  try {
    return fn?.();
  } finally {
    console.groupEnd();
  }
}
if (DEBUG) {
  window.addEventListener("error", (e) => {
    console.error("[edatime] window.error", e?.message, e?.error);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[edatime] unhandledrejection", e?.reason);
  });
}

export {
  DEBUG,
  dbg,
  dbgGroup
};
//# sourceMappingURL=chunk-P2MGEQ7G.js.map
