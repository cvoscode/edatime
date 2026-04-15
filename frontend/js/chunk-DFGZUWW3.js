// frontend/src/charts/registry.ts
var _registry = /* @__PURE__ */ new Map();
function registerChartType(name, adapter) {
  if (!name || typeof adapter?.create !== "function") {
    throw new Error(`Invalid chart adapter for "${name}"`);
  }
  _registry.set(name, adapter);
}
function getChartType(name) {
  return _registry.get(name);
}

export {
  registerChartType,
  getChartType
};
//# sourceMappingURL=chunk-DFGZUWW3.js.map
