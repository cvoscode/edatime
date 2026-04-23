// frontend/src/utils/platform.ts
function isWindowsPlatform() {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}
function defaultGpuPowerPreference() {
  return isWindowsPlatform() ? "low-power" : void 0;
}

export {
  defaultGpuPowerPreference
};
//# sourceMappingURL=chunk-PMOHFZ3J.js.map
