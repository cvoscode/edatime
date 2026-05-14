import { c as createEffect, o as onMount, a as onCleanup, b as createRenderEffect, s as setStyleProperty, t as template, u as use, d as chartStore, e as createSignal, f as createMemo, g as uiStore, i as insert, m as memo, h as createComponent, j as setAttribute, k as delegateEvents, l as addEventListener, n as className, F as For, S as Show, p as style, q as analyticsStore, r as useNavigate, v as datasetStore } from './index.DjSmm6wY.js';
import { g as getActivePlotTemplate, i as init, r as registerTheme, t as toEChartsTheme } from './plotTemplate.L9HyQqsu.js';
import { g as getColorPalette } from './colorScale.CLTVXB24.js';
import { C as ColumnChips } from './ColumnChips.CpJiRzVj.js';
import { M as Modal, S as SwitchToggle } from './Dropdown.dfZei3c5.js';
import { L as LabelsDrawer } from './LabelsDrawer.BSE15MTV.js';
import { t as tableFromIPC } from './serialization.B92cbl4P.js';
import { f as fetchAnomalies, a as fetchRollingBands } from './api.D--3WP_v.js';

var _tmpl$$4 = /* @__PURE__ */ template(`<canvas style=position:absolute;top:0;left:0;width:100%;height:100%;z-index:6>`);
const CHART_GRID$1 = {
  left: 120,
  right: 30,
  top: 16,
  bottom: 36
};
const CanvasOverlay = (props) => {
  let canvasRef;
  let resizeObserver = null;
  const render = () => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    renderRollingBands(ctx, cssW, cssH);
    renderAnomalyRegions(ctx, cssW, cssH);
    renderAnnotations(ctx, cssW, cssH);
    ctx.restore();
  };
  const renderRollingBands = (ctx, cssW, cssH) => {
    const bands = props.rollingBands;
    if (!bands || bands.length === 0) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;
    if (!Number.isFinite(props.yMin) || !Number.isFinite(props.yMax) || props.yMax <= props.yMin) return;
    const plotLeft = CHART_GRID$1.left;
    const plotTop = CHART_GRID$1.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID$1.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID$1.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const ySpan = Math.max(1e-9, props.yMax - props.yMin);
    const toX = (ms) => plotLeft + (ms - props.xMin) / (props.xMax - props.xMin) * plotWidth;
    const toY = (v) => plotBottom - (v - props.yMin) / ySpan * plotHeight;
    for (const band of bands) {
      const n = band.ts.length;
      if (n < 2) continue;
      ctx.fillStyle = "rgba(100, 180, 255, 0.22)";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = band.upper2[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) {
        const v = band.lower2[i];
        if (v == null) continue;
        ctx.lineTo(toX(band.ts[i]), toY(v));
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(100, 180, 255, 0.38)";
      ctx.beginPath();
      started = false;
      for (let i = 0; i < n; i++) {
        const v = band.upper1[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) {
        const v = band.lower1[i];
        if (v == null) continue;
        ctx.lineTo(toX(band.ts[i]), toY(v));
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(180, 220, 255, 0.90)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      started = false;
      for (let i = 0; i < n; i++) {
        const v = band.mean[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  const renderAnomalyRegions = (ctx, cssW, cssH) => {
    const regions = props.anomalyRegions;
    if (!regions || regions.length === 0) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;
    const plotLeft = CHART_GRID$1.left;
    const plotTop = CHART_GRID$1.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID$1.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID$1.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = plotBottom - plotTop;
    ctx.fillStyle = "rgba(255, 74, 110, 0.15)";
    ctx.strokeStyle = "rgba(255, 74, 110, 0.5)";
    ctx.lineWidth = 1;
    for (const region of regions) {
      const rStart = Math.max(props.xMin, region.start_ms);
      const rEnd = Math.min(props.xMax, region.end_ms);
      if (rStart >= rEnd) continue;
      const sx = plotLeft + (rStart - props.xMin) / (props.xMax - props.xMin) * plotWidth;
      const ex = plotLeft + (rEnd - props.xMin) / (props.xMax - props.xMin) * plotWidth;
      const w = Math.max(2, ex - sx);
      ctx.fillRect(sx, plotTop, w, plotHeight);
      ctx.strokeRect(sx, plotTop, w, plotHeight);
    }
  };
  const renderAnnotations = (ctx, cssW, cssH) => {
    const annotations = props.annotations ?? chartStore.state.annotations;
    if (!annotations || annotations.length === 0) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;
    const plotLeft = CHART_GRID$1.left;
    const plotTop = CHART_GRID$1.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID$1.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID$1.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = plotBottom - plotTop;
    ctx.font = "11px Inter, system-ui, sans-serif";
    for (const ann of annotations) {
      if (!ann.timeRange) continue;
      const start = ann.timeRange.start;
      const end = ann.timeRange.end;
      if (end < props.xMin || start > props.xMax) continue;
      const visStart = Math.max(props.xMin, start);
      const visEnd = Math.min(props.xMax, end);
      const sx = plotLeft + (visStart - props.xMin) / (props.xMax - props.xMin) * plotWidth;
      const ex = plotLeft + (visEnd - props.xMin) / (props.xMax - props.xMin) * plotWidth;
      const color = ann.color || "#ffc041";
      if (ann.type === "bookmark" || start === end) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sx, plotTop);
        ctx.lineTo(sx, plotBottom);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(sx, plotTop);
        ctx.lineTo(sx - 6, plotTop - 10);
        ctx.lineTo(sx + 6, plotTop - 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.textAlign = "left";
        ctx.fillText(ann.title, sx + 4, plotTop + 14);
      } else {
        ctx.fillStyle = `${color}26`;
        ctx.fillRect(sx, plotTop, ex - sx, plotHeight);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(sx, plotTop, ex - sx, plotHeight);
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.fillText(ann.title, sx + 4, plotTop + 14);
      }
    }
  };
  createEffect(() => {
    props.rollingBands;
    props.anomalyRegions;
    props.annotations;
    props.xMin;
    props.xMax;
    props.yMin;
    props.yMax;
    props.drag;
    void render();
  });
  onMount(() => {
    if (!canvasRef) return;
    resizeObserver = new ResizeObserver(() => {
      if (!canvasRef) return;
      canvasRef.width = canvasRef.clientWidth * (window.devicePixelRatio || 1);
      canvasRef.height = canvasRef.clientHeight * (window.devicePixelRatio || 1);
      render();
    });
    resizeObserver.observe(canvasRef);
  });
  onCleanup(() => {
    resizeObserver?.disconnect();
  });
  return (() => {
    var _el$ = _tmpl$$4();
    var _ref$ = canvasRef;
    typeof _ref$ === "function" ? use(_ref$, _el$) : canvasRef = _el$;
    createRenderEffect((_$p) => setStyleProperty(_el$, "pointer-events", props.drawMode === "zoom" ? "auto" : "none"));
    return _el$;
  })();
};

const mr = Symbol("GPUContext.ownsDevice"), qs = (e) => e[mr] ?? true;
function Ca(e) {
  return typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement;
}
function Ma(e) {
  const t = e.clientWidth || e.width || 0, n = e.clientHeight || e.height || 0;
  if (!Number.isFinite(t) || !Number.isFinite(n))
    throw new Error(
      `GPUContext: Invalid canvas dimensions detected: width=${e.clientWidth || e.width}, height=${e.clientHeight || e.height}. Canvas must have finite dimensions. Ensure canvas is properly sized before initialization.`
    );
  return { width: t, height: n };
}
function windowUserAgentIsWindows() {
  return typeof navigator < "u" && /Windows/i.test(navigator.userAgent);
}
function Zs(e, t) {
  const n = (t == null ? void 0 : t.devicePixelRatio) ?? (typeof window < "u" ? window.devicePixelRatio : 1), i = Number.isFinite(n) && n > 0 ? n : 1, r = (t == null ? void 0 : t.alphaMode) ?? "opaque", o = (t == null ? void 0 : t.powerPreference) ?? (windowUserAgentIsWindows() ? void 0 : "high-performance"), s = !!(t != null && t.device && (t != null && t.adapter)), a = s ? t.adapter : null, c = s ? t.device : null, f = !s;
  return {
    adapter: a,
    device: c,
    initialized: false,
    canvas: e || null,
    canvasContext: null,
    preferredFormat: null,
    devicePixelRatio: i,
    alphaMode: r,
    powerPreference: o,
    [mr]: f
  };
}
async function js(e) {
  var o, s, a;
  if (e.initialized)
    throw new Error("GPUContext: already initialized. Call destroyGPUContext() before reinitializing.");
  const t = Number.isFinite(e.devicePixelRatio) && e.devicePixelRatio > 0 ? e.devicePixelRatio : 1;
  if (!navigator.gpu)
    throw new Error(
      "WebGPU is not available in this browser. Please use a browser that supports WebGPU (Chrome 113+, Edge 113+, or Safari 18+). Ensure WebGPU is enabled in browser flags if needed."
    );
  let n = null, i = null, r = qs(e);
  try {
    if (e.adapter && e.device) {
      if (i = e.adapter, n = e.device, r = !1, typeof ((o = navigator.gpu) == null ? void 0 : o.getPreferredCanvasFormat) != "function")
        throw new Error(
          "GPUContext: Shared device requires navigator.gpu.getPreferredCanvasFormat() for canvas format selection, but it is not available in this environment. Use a browser with full WebGPU support."
        );
      const g = navigator.gpu.getPreferredCanvasFormat();
      if (g !== "bgra8unorm" && g !== "rgba8unorm")
        throw new Error(
          `GPUContext: Shared device preferred canvas format is not supported by ChartGPU. Received navigator.gpu.getPreferredCanvasFormat()="${g}". Supported formats: "bgra8unorm", "rgba8unorm".`
        );
      const u = n.limits.maxBufferSize;
      if (u < 33554432)
        throw new Error(
          `GPUContext: Injected device.limits.maxBufferSize is insufficient. Required >= 33554432 bytes, actual=${u} bytes.`
        );
      const y = n.limits.maxStorageBufferBindingSize;
      if (y < 33554432)
        throw new Error(
          `GPUContext: Injected device.limits.maxStorageBufferBindingSize is insufficient. Required >= 33554432 bytes, actual=${y} bytes.`
        );
    } else {
      const g = e.powerPreference ? await navigator.gpu.requestAdapter({
        powerPreference: e.powerPreference
      }) : await navigator.gpu.requestAdapter();
      if (!g)
        throw new Error(
          "GPUContext: Failed to request WebGPU adapter. No compatible adapter found. This may occur if no GPU is available or WebGPU is disabled."
        );
      const u = await g.requestDevice();
      if (!u)
        throw new Error("GPUContext: Failed to request WebGPU device from adapter.");
      i = g, n = u, r = !0, n.addEventListener("uncapturederror", (y) => {
        console.error("WebGPU uncaptured error:", y.error);
      });
    }
    let f = null, l = null;
    if (e.canvas) {
      const g = e.canvas.getContext("webgpu");
      if (!g) {
        if (r && n)
          try {
            n.destroy();
          } catch (b) {
            console.warn("Error destroying device during canvas setup failure:", b);
          }
        throw new Error("GPUContext: Failed to get WebGPU context from canvas.");
      }
      const { width: u, height: y } = Ma(e.canvas), p = t, M = Math.floor(u * p), R = Math.floor(y * p), D = n.limits.maxTextureDimension2D;
      if (!r && (M > D || R > D)) {
        const b = Math.max(M, R);
        throw new Error(
          `GPUContext: Injected device.limits.maxTextureDimension2D is insufficient. Required >= ${b} (for ${M}x${R} at devicePixelRatio=${p}), actual=${D}.`
        );
      }
      const T = Math.max(1, Math.min(M, D)), A = Math.max(1, Math.min(R, D));
      e.canvas.width = T, e.canvas.height = A, l = ((a = (s = navigator.gpu).getPreferredCanvasFormat) == null ? void 0 : a.call(s)) || "bgra8unorm", g.configure({
        device: n,
        format: l,
        alphaMode: e.alphaMode
      }), f = g;
    }
    return {
      adapter: i,
      device: n,
      initialized: !0,
      canvas: e.canvas,
      canvasContext: f,
      preferredFormat: l,
      devicePixelRatio: t,
      alphaMode: e.alphaMode,
      powerPreference: e.powerPreference,
      [mr]: r
    };
  } catch (c) {
    if (r && n)
      try {
        n.destroy();
      } catch (f) {
        console.warn("Error destroying device during initialization failure:", f);
      }
    throw c instanceof Error ? c : new Error(`Failed to initialize GPUContext: ${String(c)}`);
  }
}
function Ks(e) {
  if (!e.canvas)
    throw new Error("GPUContext: Canvas is not configured. Provide a canvas element when creating the context.");
  if (!e.initialized || !e.canvasContext)
    throw new Error("GPUContext: not initialized. Call initializeGPUContext() first.");
  return e.canvasContext.getCurrentTexture();
}
function Sa(e, t, n, i, r) {
  if (t < 0 || t > 1 || n < 0 || n > 1 || i < 0 || i > 1 || r < 0 || r > 1)
    throw new Error("GPUContext: Color components must be in the range [0.0, 1.0]");
  if (!e.canvas)
    throw new Error("GPUContext: Canvas is not configured. Provide a canvas element when creating the context.");
  if (!e.initialized || !e.device || !e.canvasContext)
    throw new Error("GPUContext: not initialized. Call initializeGPUContext() first.");
  const o = Ks(e), s = e.device.createCommandEncoder();
  s.beginRenderPass({
    colorAttachments: [
      {
        view: o.createView(),
        clearValue: { r: t, g: n, b: i, a: r },
        loadOp: "clear",
        storeOp: "store"
      }
    ]
  }).end(), e.device.queue.submit([s.finish()]);
}
function Fa(e) {
  if (e.canvasContext)
    try {
      e.canvasContext.unconfigure();
    } catch (t) {
      console.warn("Error unconfiguring GPU canvas context:", t);
    }
  if (qs(e) !== false && e.device)
    try {
      e.device.destroy();
    } catch (t) {
      console.warn("Error destroying GPU device:", t);
    }
  return {
    adapter: null,
    device: null,
    initialized: false,
    canvas: e.canvas,
    canvasContext: null,
    preferredFormat: null,
    devicePixelRatio: e.devicePixelRatio,
    alphaMode: e.alphaMode,
    powerPreference: e.powerPreference,
    [mr]: false
  };
}
class oo {
  /**
   * Gets the WebGPU adapter, or null if not initialized.
   */
  get adapter() {
    return this._state.adapter;
  }
  /**
   * Gets the WebGPU device, or null if not initialized.
   */
  get device() {
    return this._state.device;
  }
  /**
   * Checks if the context has been initialized.
   */
  get initialized() {
    return this._state.initialized;
  }
  /**
   * Gets the canvas element, or null if not provided.
   */
  get canvas() {
    return this._state.canvas;
  }
  /**
   * Gets the WebGPU canvas context, or null if canvas is not configured.
   */
  get canvasContext() {
    return this._state.canvasContext;
  }
  /**
   * Gets the preferred canvas format, or null if canvas is not configured.
   */
  get preferredFormat() {
    return this._state.preferredFormat;
  }
  /**
   * Gets the device pixel ratio used for canvas sizing.
   */
  get devicePixelRatio() {
    return this._state.devicePixelRatio;
  }
  /**
   * Gets the canvas alpha mode.
   */
  get alphaMode() {
    return this._state.alphaMode;
  }
  /**
   * Gets the GPU power preference.
   */
  get powerPreference() {
    return this._state.powerPreference;
  }
  /**
   * Creates a new GPUContext instance.
   * 
   * @param canvas - Optional canvas element (HTMLCanvasElement) to configure for WebGPU rendering
   * @param options - Optional configuration for device pixel ratio, alpha mode, and power preference
   */
  constructor(t, n) {
    this._state = Zs(t, n);
  }
  /**
   * Initializes the WebGPU context by requesting an adapter and device.
   * 
   * @throws {Error} If WebGPU is not available in the browser
   * @throws {Error} If adapter request fails
   * @throws {Error} If device request fails
   * @throws {Error} If already initialized
   */
  async initialize() {
    this._state = await js(this._state);
  }
  /**
   * Static factory method to create and initialize a GPUContext instance.
   * 
   * @param canvas - Optional canvas element (HTMLCanvasElement) to configure for WebGPU rendering
   * @param options - Optional configuration for device pixel ratio, alpha mode, and power preference
   * @returns A fully initialized GPUContext instance
   * @throws {Error} If initialization fails
   * 
   * @example
   * ```typescript
   * const context = await GPUContext.create();
   * const device = context.device;
   * ```
   * 
   * @example
   * ```typescript
   * const canvas = document.querySelector('canvas');
   * const context = await GPUContext.create(canvas);
   * const texture = context.getCanvasTexture();
   * ```
   */
  static async create(t, n) {
    const i = new oo(t, n);
    return await i.initialize(), i;
  }
  /**
   * Gets the current texture from the canvas context.
   * 
   * @returns The current canvas texture
   * @throws {Error} If canvas is not configured or context is not initialized
   * 
   * @example
   * ```typescript
   * const texture = context.getCanvasTexture();
   * // Use texture in render pass
   * ```
   */
  getCanvasTexture() {
    return Ks(this._state);
  }
  /**
   * Clears the canvas to a solid color.
   * Creates a command encoder, begins a render pass with the specified clear color,
   * ends the pass, and submits it to the queue.
   * 
   * @param r - Red component (0.0 to 1.0)
   * @param g - Green component (0.0 to 1.0)
   * @param b - Blue component (0.0 to 1.0)
   * @param a - Alpha component (0.0 to 1.0)
   * @throws {Error} If canvas is not configured or context is not initialized
   * @throws {Error} If device is not available
   * 
   * @example
   * ```typescript
   * // Clear to dark purple (#1a1a2e)
   * context.clearScreen(0x1a / 255, 0x1a / 255, 0x2e / 255, 1.0);
   * ```
   */
  clearScreen(t, n, i, r) {
    Sa(this._state, t, n, i, r);
  }
  /**
   * Destroys the WebGPU device and cleans up resources.
   * After calling destroy(), the context must be reinitialized before use.
   */
  destroy() {
    this._state = Fa(this._state);
  }
}
function Zn(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e) && "x" in e && "y" in e && typeof e.x == "object" && typeof e.y == "object" && "length" in e.x && "length" in e.y;
}
function jn(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e) && ArrayBuffer.isView(e);
}
function Rn(e) {
  return Array.isArray(e);
}
function Ne(e) {
  if (Zn(e))
    return Math.min(e.x.length, e.y.length);
  if (jn(e)) {
    if (e instanceof DataView)
      throw new Error("DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).");
    return Math.floor(e.length / 2);
  }
  return e.length;
}
function Fe(e, t) {
  if (Zn(e))
    return e.x[t];
  if (jn(e)) {
    if (e instanceof DataView)
      throw new Error("DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).");
    return e[t * 2];
  }
  const n = e[t];
  return n == null || typeof n != "object" ? NaN : Rn(n) ? n[0] : n.x;
}
function _e(e, t) {
  if (Zn(e))
    return e.y[t];
  if (jn(e)) {
    if (e instanceof DataView)
      throw new Error("DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).");
    return e[t * 2 + 1];
  }
  const n = e[t];
  return n == null || typeof n != "object" ? NaN : Rn(n) ? n[1] : n.y;
}
function at(e, t) {
  var i;
  if (Zn(e))
    return (i = e.size) == null ? void 0 : i[t];
  if (jn(e))
    return;
  const n = e[t];
  if (!(n == null || typeof n != "object"))
    return Rn(n) ? n[2] : n.size;
}
function br(e, t, n, i, r, o) {
  const s = Ne(n) - i, a = Math.min(r, s);
  if (a <= 0) return;
  const c = t + a * 2;
  if (c > e.length)
    throw new Error(
      `packXYInto: output buffer too small (need ${c} floats, have ${e.length})`
    );
  if (Zn(n)) {
    for (let f = 0; f < a; f++) {
      const l = i + f, g = t + f * 2;
      e[g] = n.x[l] - o, e[g + 1] = n.y[l];
    }
    return;
  }
  if (jn(n)) {
    if (n instanceof DataView)
      throw new Error("DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).");
    const f = n;
    for (let l = 0; l < a; l++) {
      const g = (i + l) * 2, u = t + l * 2;
      e[u] = f[g] - o, e[u + 1] = f[g + 1];
    }
    return;
  }
  for (let f = 0; f < a; f++) {
    const l = i + f, g = t + f * 2, u = n[l];
    if (u == null || typeof u != "object") {
      e[g] = NaN, e[g + 1] = NaN;
      continue;
    }
    const y = Rn(u) ? u[0] : u.x, p = Rn(u) ? u[1] : u.y;
    e[g] = y - o, e[g + 1] = p;
  }
}
function zt(e) {
  let t = Number.POSITIVE_INFINITY, n = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  if (Zn(e)) {
    const o = Math.min(e.x.length, e.y.length);
    for (let s = 0; s < o; s++) {
      const a = e.x[s], c = e.y[s];
      !Number.isFinite(a) || !Number.isFinite(c) || (a < t && (t = a), a > n && (n = a), c < i && (i = c), c > r && (r = c));
    }
  } else if (jn(e)) {
    if (e instanceof DataView)
      throw new Error("DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).");
    const o = e, s = Math.floor(o.length / 2);
    for (let a = 0; a < s; a++) {
      const c = o[a * 2], f = o[a * 2 + 1];
      !Number.isFinite(c) || !Number.isFinite(f) || (c < t && (t = c), c > n && (n = c), f < i && (i = f), f > r && (r = f));
    }
  } else {
    const o = e.length;
    for (let s = 0; s < o; s++) {
      const a = Fe(e, s), c = _e(e, s);
      !Number.isFinite(a) || !Number.isFinite(c) || (a < t && (t = a), a > n && (n = a), c < i && (i = c), c > r && (r = c));
    }
  }
  return !Number.isFinite(t) || !Number.isFinite(n) || !Number.isFinite(i) || !Number.isFinite(r) ? null : (t === n && (n = t + 1), i === r && (r = i + 1), { xMin: t, xMax: n, yMin: i, yMax: r });
}
function Co(e) {
  return Array.isArray(e) ? e.includes(null) : false;
}
function Mo(e) {
  if (Array.isArray(e))
    return e.filter((i) => {
      if (i == null || typeof i != "object") return false;
      const r = Rn(i) ? i[0] : i.x, o = Rn(i) ? i[1] : i.y;
      return Number.isFinite(r) && Number.isFinite(o);
    });
  const t = Ne(e), n = [];
  for (let i = 0; i < t; i++) {
    const r = Fe(e, i), o = _e(e, i);
    Number.isFinite(r) && Number.isFinite(o) && n.push([r, o]);
  }
  return n;
}
const sr = 4;
function qr(e) {
  return e + 3 & -4;
}
function Na(e) {
  if (!Number.isFinite(e) || e <= 0) return 1;
  const t = Math.ceil(e);
  return 2 ** Math.ceil(Math.log2(t));
}
function So(e, t) {
  const n = Math.max(sr, qr(t)), i = Math.max(sr, Na(n));
  return Math.max(e, i);
}
function Js(e, t) {
  let n = e >>> 0;
  for (let i = 0; i < t.length; i++)
    n ^= t[i], n = Math.imul(n, 16777619) >>> 0;
  return n >>> 0;
}
function Fo(e) {
  const t = new Uint32Array(e.buffer, e.byteOffset, e.byteLength / 4);
  return Js(2166136261, t);
}
function Ta(e) {
  const t = /* @__PURE__ */ new Map();
  let n = false;
  const i = (u, y) => {
    const p = Ne(u);
    if (p === 0) return new Float32Array(0);
    const M = new ArrayBuffer(p * 2 * 4), R = new Float32Array(M);
    return br(R, 0, u, 0, p, y), R;
  }, r = () => {
    if (n)
      throw new Error("DataStore is disposed.");
  }, o = (u) => {
    r();
    const y = t.get(u);
    if (!y)
      throw new Error(`Series ${u} has no data. Call setSeries(${u}, data) first.`);
    return y;
  };
  return {
    setSeries: (u, y, p) => {
      r();
      const M = (p == null ? void 0 : p.xOffset) ?? 0, R = Ne(y), D = i(y, M), T = Fo(D), A = qr(D.byteLength), b = Math.max(sr, A), m = t.get(u);
      if (m && m.pointCount === R && m.hash32 === T) return;
      let w = (m == null ? void 0 : m.buffer) ?? null, v = (m == null ? void 0 : m.capacityBytes) ?? 0;
      if (!w || b > v) {
        const N = e.limits.maxBufferSize;
        if (b > N)
          throw new Error(
            `DataStore.setSeries(${u}): required buffer size ${b} exceeds device.limits.maxBufferSize (${N}).`
          );
        if (w)
          try {
            w.destroy();
          } catch {
          }
        const C = So(v, b);
        C > N ? v = b : v = C, w = e.createBuffer({
          size: v,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
      }
      D.byteLength > 0 && e.queue.writeBuffer(w, 0, D.buffer, D.byteOffset, D.byteLength);
      const I = new Float32Array(v / 4);
      I.set(D), t.set(u, {
        buffer: w,
        capacityBytes: v,
        pointCount: R,
        hash32: T,
        xOffset: M,
        stagingBuffer: I
      });
    },
    appendSeries: (u, y) => {
      r();
      const p = Ne(y);
      if (p === 0) return;
      const M = o(u), R = M.pointCount, D = R + p, T = qr(D * 2 * 4), A = Math.max(sr, T);
      let b = M.buffer, m = M.capacityBytes, x = M.stagingBuffer;
      const w = e.limits.maxBufferSize;
      if (A > m) {
        if (A > w)
          throw new Error(
            `DataStore.appendSeries(${u}): required buffer size ${A} exceeds device.limits.maxBufferSize (${w}).`
          );
        try {
          b.destroy();
        } catch {
        }
        const C = So(m, A);
        m = C > w ? A : C, b = e.createBuffer({
          size: m,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        const d = new Float32Array(m / 4);
        d.set(x.subarray(0, R * 2)), br(d, R * 2, y, 0, p, M.xOffset);
        const h = d.subarray(0, D * 2);
        h.byteLength > 0 && e.queue.writeBuffer(b, 0, h.buffer, h.byteOffset, h.byteLength), t.set(u, {
          buffer: b,
          capacityBytes: m,
          pointCount: D,
          hash32: Fo(h),
          xOffset: M.xOffset,
          stagingBuffer: d
        });
        return;
      }
      br(x, R * 2, y, 0, p, M.xOffset);
      const v = x.subarray(R * 2, D * 2);
      if (v.byteLength > 0) {
        const C = R * 2 * 4;
        e.queue.writeBuffer(b, C, v.buffer, v.byteOffset, v.byteLength);
      }
      const I = new Uint32Array(v.buffer, v.byteOffset, v.byteLength / 4), N = Js(M.hash32, I);
      t.set(u, {
        buffer: b,
        capacityBytes: m,
        pointCount: D,
        hash32: N,
        xOffset: M.xOffset,
        stagingBuffer: x
      });
    },
    removeSeries: (u) => {
      r();
      const y = t.get(u);
      if (y) {
        try {
          y.buffer.destroy();
        } catch {
        }
        t.delete(u);
      }
    },
    getSeriesBuffer: (u) => o(u).buffer,
    getSeriesPointCount: (u) => o(u).pointCount,
    dispose: () => {
      if (!n) {
        n = true;
        for (const u of t.values())
          try {
            u.buffer.destroy();
          } catch {
          }
        t.clear();
      }
    }
  };
}
function fn(e) {
  return Array.isArray(e);
}
function Aa(e, t) {
  const n = e.length >>> 1, i = n - 1;
  if (t <= 0 || n === 0) return new Int32Array(0);
  if (t === 1) return new Int32Array([0]);
  if (t === 2) return n >= 2 ? new Int32Array([0, i]) : new Int32Array([0]);
  if (n <= t) {
    const l = new Int32Array(n);
    for (let g = 0; g < n; g++) l[g] = g;
    return l;
  }
  const r = new Int32Array(t);
  r[0] = 0, r[t - 1] = i;
  const o = (n - 2) / (t - 2);
  let s = 0, a = 1;
  const c = e[i * 2 + 0], f = e[i * 2 + 1];
  for (let l = 0; l < t - 2; l++) {
    let g = Math.floor(o * l) + 1, u = Math.min(Math.floor(o * (l + 1)) + 1, i);
    g >= u && (g = Math.min(g, i - 1), u = Math.min(g + 1, i));
    const y = Math.floor(o * (l + 1)) + 1, p = Math.min(Math.floor(o * (l + 2)) + 1, i);
    let M = c, R = f;
    if (y < p) {
      let m = 0, x = 0, w = 0;
      for (let v = y; v < p; v++)
        m += e[v * 2 + 0], x += e[v * 2 + 1], w++;
      w > 0 && (M = m / w, R = x / w);
    }
    const D = e[s * 2 + 0], T = e[s * 2 + 1];
    let A = -1, b = g;
    for (let m = g; m < u; m++) {
      const x = e[m * 2 + 0], w = e[m * 2 + 1], v = (D - M) * (w - T) - (D - x) * (R - T), I = v < 0 ? -v : v;
      I > A && (A = I, b = m);
    }
    r[a++] = b, s = b;
  }
  return r;
}
function Ia(e, t) {
  const n = e.length, i = n - 1;
  if (t <= 0 || n === 0) return new Int32Array(0);
  if (t === 1) return new Int32Array([0]);
  if (t === 2) return n >= 2 ? new Int32Array([0, i]) : new Int32Array([0]);
  if (n <= t) {
    const g = new Int32Array(n);
    for (let u = 0; u < n; u++) g[u] = u;
    return g;
  }
  const r = new Int32Array(t);
  r[0] = 0, r[t - 1] = i;
  const o = (n - 2) / (t - 2);
  let s = 0, a = 1;
  const c = e[i], f = fn(c) ? c[0] : c.x, l = fn(c) ? c[1] : c.y;
  for (let g = 0; g < t - 2; g++) {
    let u = Math.floor(o * g) + 1, y = Math.min(Math.floor(o * (g + 1)) + 1, i);
    u >= y && (u = Math.min(u, i - 1), y = Math.min(u + 1, i));
    const p = Math.floor(o * (g + 1)) + 1, M = Math.min(Math.floor(o * (g + 2)) + 1, i);
    let R = f, D = l;
    if (p < M) {
      let w = 0, v = 0, I = 0;
      for (let N = p; N < M; N++) {
        const C = e[N], d = fn(C) ? C[0] : C.x, h = fn(C) ? C[1] : C.y;
        w += d, v += h, I++;
      }
      I > 0 && (R = w / I, D = v / I);
    }
    const T = e[s], A = fn(T) ? T[0] : T.x, b = fn(T) ? T[1] : T.y;
    let m = -1, x = u;
    for (let w = u; w < y; w++) {
      const v = e[w], I = fn(v) ? v[0] : v.x, N = fn(v) ? v[1] : v.y, C = (A - R) * (N - b) - (A - I) * (D - b), d = C < 0 ? -C : C;
      d > m && (m = d, x = w);
    }
    r[a++] = x, s = x;
  }
  return r;
}
function Pi(e, t) {
  const n = Math.floor(t);
  if (e instanceof Float32Array) {
    const s = e.length >>> 1;
    if (n <= 0 || s === 0) return new Float32Array(0);
    if (s <= n) return e;
    const a = Aa(e, n), c = new Float32Array(a.length * 2);
    for (let f = 0; f < a.length; f++) {
      const l = a[f];
      c[f * 2 + 0] = e[l * 2 + 0], c[f * 2 + 1] = e[l * 2 + 1];
    }
    return c;
  }
  const i = e.length;
  if (n <= 0 || i === 0) return [];
  if (i <= n) return e;
  const r = Ia(e, n), o = new Array(r.length);
  for (let s = 0; s < r.length; s++)
    o[s] = e[r[s]];
  return o;
}
function Qs(e) {
  const t = Math.floor(e);
  return Number.isFinite(t) ? t : 0;
}
function Pa(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e) && "x" in e && "y" in e && typeof e.x == "object" && typeof e.y == "object" && "length" in e.x && "length" in e.y;
}
function Ra(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e) && ArrayBuffer.isView(e);
}
function No(e) {
  const t = Ne(e), n = new Float32Array(t * 2);
  for (let i = 0; i < t; i++)
    n[i * 2] = Fe(e, i), n[i * 2 + 1] = _e(e, i);
  return n;
}
function vr(e, t, n) {
  const i = Ne(e), r = Qs(t);
  if (r <= 0 || i === 0) return [];
  if (r === 1) {
    const c = Fe(e, 0), f = _e(e, 0), l = at(e, 0);
    return l !== void 0 ? [[c, f, l]] : [[c, f]];
  }
  if (r === 2)
    if (i >= 2) {
      const c = Fe(e, 0), f = _e(e, 0), l = at(e, 0), g = Fe(e, i - 1), u = _e(e, i - 1), y = at(e, i - 1);
      return [
        l !== void 0 ? [c, f, l] : [c, f],
        y !== void 0 ? [g, u, y] : [g, u]
      ];
    } else {
      const c = Fe(e, 0), f = _e(e, 0), l = at(e, 0);
      return l !== void 0 ? [[c, f, l]] : [[c, f]];
    }
  const o = i - 1, s = new Array(r);
  {
    const c = Fe(e, 0), f = _e(e, 0), l = at(e, 0);
    s[0] = l !== void 0 ? [c, f, l] : [c, f];
    const g = Fe(e, o), u = _e(e, o), y = at(e, o);
    s[r - 1] = y !== void 0 ? [g, u, y] : [g, u];
  }
  const a = (i - 2) / (r - 2);
  for (let c = 0; c < r - 2; c++) {
    let f = Math.floor(a * c) + 1, l = Math.min(Math.floor(a * (c + 1)) + 1, o);
    f >= l && (f = Math.min(f, o - 1), l = Math.min(f + 1, o));
    let g = null;
    if (n === "average") {
      let u = 0, y = 0, p = 0, M = 0, R = 0;
      for (let D = f; D < l; D++) {
        const T = Fe(e, D), A = _e(e, D);
        if (!Number.isFinite(T) || !Number.isFinite(A)) continue;
        u += T, y += A, M++;
        const b = at(e, D);
        typeof b == "number" && Number.isFinite(b) && (p += b, R++);
      }
      if (M > 0) {
        const D = u / M, T = y / M;
        R > 0 ? g = [D, T, p / R] : g = [D, T];
      }
    } else {
      let u = n === "max" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY, y = f;
      for (let D = f; D < l; D++) {
        const T = _e(e, D);
        Number.isFinite(T) && (n === "max" ? T > u && (u = T, y = D) : T < u && (u = T, y = D));
      }
      const p = Fe(e, y), M = _e(e, y), R = at(e, y);
      g = R !== void 0 ? [p, M, R] : [p, M];
    }
    if (g === null) {
      const u = Fe(e, f), y = _e(e, f), p = at(e, f);
      g = p !== void 0 ? [u, y, p] : [u, y];
    }
    s[c + 1] = g;
  }
  return s;
}
function Wn(e, t, n) {
  const i = Qs(n), r = Ne(e);
  if (t === "none" || !(i > 0) || r <= i) return e;
  switch (t) {
    case "lttb": {
      if (e instanceof Float32Array)
        return Pi(e, i);
      if (Ra(e)) {
        const s = No(e);
        return Pi(s, i);
      }
      if (Pa(e)) {
        const s = No(e);
        return Pi(s, i);
      }
      const o = e.filter(
        (s) => s !== null
      );
      return Pi(o, i);
    }
    case "average":
      return vr(e, i, "average");
    case "max":
      return vr(e, i, "max");
    case "min":
      return vr(e, i, "min");
    default:
      return e;
  }
}
function Da(e) {
  return Array.isArray(e);
}
function Zr(e, t) {
  const n = Math.floor(t), i = e.length;
  if (n < 2 || i <= n) return e;
  const r = new Array(n);
  if (r[0] = e[0], r[n - 1] = e[i - 1], n === 2) return r;
  const o = Da(e[0]), s = (i - 2) / (n - 2);
  if (o) {
    const a = e;
    for (let c = 0; c < n - 2; c++) {
      let f = Math.floor(s * c) + 1, l = Math.min(Math.floor(s * (c + 1)) + 1, i - 1);
      f >= l && (f = Math.min(f, i - 2), l = Math.min(f + 1, i - 1));
      const g = a[f], u = a[l - 1], y = g[0], p = g[1], M = u[2];
      let R = -1 / 0, D = 1 / 0;
      for (let T = f; T < l; T++) {
        const A = a[T], b = A[3], m = A[4];
        m > R && (R = m), b < D && (D = b);
      }
      r[c + 1] = [y, p, M, D, R];
    }
  } else {
    const a = e;
    for (let c = 0; c < n - 2; c++) {
      let f = Math.floor(s * c) + 1, l = Math.min(Math.floor(s * (c + 1)) + 1, i - 1);
      f >= l && (f = Math.min(f, i - 2), l = Math.min(f + 1, i - 1));
      const g = a[f], u = a[l - 1], y = g.timestamp, p = g.open, M = u.close;
      let R = -1 / 0, D = 1 / 0;
      for (let T = f; T < l; T++) {
        const A = a[T], b = A.high, m = A.low;
        b > R && (R = b), m < D && (D = m);
      }
      r[c + 1] = { timestamp: y, open: p, close: M, low: D, high: R };
    }
  }
  return r;
}
function Ea(e) {
  return e ? e.clientWidth : 0;
}
function Ba(e) {
  return e ? e.clientHeight : 0;
}
function pn(e, t, n) {
  return Math.min(n, Math.max(t, e | 0));
}
function ar(e) {
  return Array.isArray(e);
}
const Ri = /* @__PURE__ */ new WeakMap(), Di = /* @__PURE__ */ new WeakMap();
function so(e) {
  const t = typeof e == "object" && e !== null ? e : null;
  if (t) {
    const r = Ri.get(t);
    if (r !== void 0) return r;
  }
  let n = Number.NEGATIVE_INFINITY;
  const i = Ne(e);
  for (let r = 0; r < i; r++) {
    const o = Fe(e, r);
    if (!Number.isFinite(o) || o < n)
      return t && Ri.set(t, false), false;
    n = o;
  }
  return t && Ri.set(t, true), true;
}
function La(e) {
  const t = Di.get(e);
  if (t !== void 0) return t;
  let n = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < e.length; i++) {
    const r = e[i], o = ar(r) ? r[0] : r.timestamp;
    if (!Number.isFinite(o) || o < n)
      return Di.set(e, false), false;
    n = o;
  }
  return Di.set(e, true), true;
}
function ea(e, t) {
  let n = 0, i = Ne(e);
  for (; n < i;) {
    const r = n + i >>> 1;
    Fe(e, r) < t ? n = r + 1 : i = r;
  }
  return n;
}
function ta(e, t) {
  let n = 0, i = Ne(e);
  for (; n < i;) {
    const r = n + i >>> 1;
    Fe(e, r) <= t ? n = r + 1 : i = r;
  }
  return n;
}
function _a(e, t) {
  let n = 0, i = e.length;
  for (; n < i;) {
    const r = n + i >>> 1;
    e[r][0] < t ? n = r + 1 : i = r;
  }
  return n;
}
function ka(e, t) {
  let n = 0, i = e.length;
  for (; n < i;) {
    const r = n + i >>> 1;
    e[r][0] <= t ? n = r + 1 : i = r;
  }
  return n;
}
function Ua(e, t) {
  let n = 0, i = e.length;
  for (; n < i;) {
    const r = n + i >>> 1;
    e[r].timestamp < t ? n = r + 1 : i = r;
  }
  return n;
}
function Ga(e, t) {
  let n = 0, i = e.length;
  for (; n < i;) {
    const r = n + i >>> 1;
    e[r].timestamp <= t ? n = r + 1 : i = r;
  }
  return n;
}
function To(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e) && "x" in e && "y" in e && typeof e.x == "object" && typeof e.y == "object" && "length" in e.x && "length" in e.y;
}
function Ao(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e) && ArrayBuffer.isView(e);
}
function za(e, t, n) {
  const i = Ne(e), r = Math.max(0, Math.min(t, i)), o = Math.max(r, Math.min(n, i));
  if (r === 0 && o === i) return e;
  if (o <= r) {
    if (To(e))
      return { x: [], y: [], ...e.size ? { size: [] } : {} };
    if (Ao(e)) {
      if (e instanceof DataView)
        throw new Error("DataView is not supported for InterleavedXYData");
      const s = e.constructor;
      return new s(0);
    }
    return [];
  }
  if (To(e)) {
    const s = Array.isArray(e.x) ? e.x.slice(r, o) : "subarray" in e.x ? e.x.subarray(r, o) : Array.from(e.x).slice(r, o), a = Array.isArray(e.y) ? e.y.slice(r, o) : "subarray" in e.y ? e.y.subarray(r, o) : Array.from(e.y).slice(r, o), c = { x: s, y: a };
    if (e.size) {
      const f = Array.isArray(e.size) ? e.size.slice(r, o) : "subarray" in e.size ? e.size.subarray(r, o) : Array.from(e.size).slice(r, o);
      c.size = f;
    }
    return c;
  }
  if (Ao(e)) {
    if (e instanceof DataView)
      throw new Error("DataView is not supported for InterleavedXYData");
    return e.subarray(r * 2, o * 2);
  }
  return e.slice(r, o);
}
function Ei(e, t, n) {
  const i = Ne(e);
  if (i === 0 || !Number.isFinite(t) || !Number.isFinite(n)) return e;
  if (so(e)) {
    const s = ea(e, t), a = ta(e, n);
    return s <= 0 && a >= i ? e : za(e, s, a);
  }
  const o = [];
  for (let s = 0; s < i; s++) {
    const a = Fe(e, s);
    if (Number.isFinite(a) && a >= t && a <= n) {
      const c = _e(e, s);
      o.push([a, c]);
    }
  }
  return o;
}
function Va(e, t, n) {
  const i = Ne(e);
  if (i === 0) return { start: 0, end: 0 };
  if (!Number.isFinite(t) || !Number.isFinite(n)) return { start: 0, end: i };
  if (!so(e))
    return { start: 0, end: i };
  const o = ea(e, t), s = ta(e, n), a = pn(o, 0, i), c = pn(s, 0, i);
  return c <= a ? { start: a, end: a } : { start: a, end: c };
}
function Bi(e, t, n) {
  const i = e.length;
  if (i === 0 || !Number.isFinite(t) || !Number.isFinite(n)) return e;
  const r = La(e), o = i > 0 && ar(e[0]);
  if (r) {
    const a = o ? _a(e, t) : Ua(e, t), c = o ? ka(e, n) : Ga(e, n);
    return a <= 0 && c >= i ? e : c <= a ? [] : e.slice(a, c);
  }
  const s = [];
  for (let a = 0; a < i; a++) {
    const c = e[a], f = ar(c) ? c[0] : c.timestamp;
    Number.isFinite(f) && f >= t && f <= n && s.push(c);
  }
  return s;
}
const Io = (e) => Math.min(1, Math.max(0, e)), Po = (e) => Math.min(255, Math.max(0, e)), Sn = (e) => {
  const t = Number.parseInt(e, 16);
  return Number.isFinite(t) ? t : 0;
}, Fn = (e) => {
  const t = Number.parseInt(e, 16);
  return Number.isFinite(t) ? t : 0;
}, Wa = (e) => {
  const t = e.trim();
  if (!t.startsWith("#")) return null;
  const n = t.slice(1);
  if (n.length === 3) {
    const i = Sn(n[0]), r = Sn(n[1]), o = Sn(n[2]);
    return [i * 17 / 255, r * 17 / 255, o * 17 / 255, 1];
  }
  if (n.length === 4) {
    const i = Sn(n[0]), r = Sn(n[1]), o = Sn(n[2]), s = Sn(n[3]);
    return [i * 17 / 255, r * 17 / 255, o * 17 / 255, s * 17 / 255];
  }
  if (n.length === 6) {
    const i = Fn(n.slice(0, 2)), r = Fn(n.slice(2, 4)), o = Fn(n.slice(4, 6));
    return [i / 255, r / 255, o / 255, 1];
  }
  if (n.length === 8) {
    const i = Fn(n.slice(0, 2)), r = Fn(n.slice(2, 4)), o = Fn(n.slice(4, 6)), s = Fn(n.slice(6, 8));
    return [i / 255, r / 255, o / 255, s / 255];
  }
  return null;
}, Ln = (e) => {
  const t = e.trim();
  if (t.length === 0) return null;
  if (t.endsWith("%")) {
    const i = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(i) ? Po(i / 100 * 255) : null;
  }
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? Po(n) : null;
}, Oa = (e) => {
  const t = e.trim();
  if (t.length === 0) return null;
  if (t.endsWith("%")) {
    const i = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(i) ? Io(i / 100) : null;
  }
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? Io(n) : null;
}, Xa = (e) => {
  const t = e.trim(), n = /^(rgba?|RGBA?)\(\s*([^\)]*)\s*\)$/.exec(t);
  if (!n) return null;
  const i = n[1].toLowerCase(), o = n[2].split(",").map((s) => s.trim());
  if (i === "rgb") {
    if (o.length !== 3) return null;
    const s = Ln(o[0]), a = Ln(o[1]), c = Ln(o[2]);
    return s == null || a == null || c == null ? null : [s / 255, a / 255, c / 255, 1];
  }
  if (i === "rgba") {
    if (o.length !== 4) return null;
    const s = Ln(o[0]), a = Ln(o[1]), c = Ln(o[2]), f = Oa(o[3]);
    return s == null || a == null || c == null || f == null ? null : [s / 255, a / 255, c / 255, f];
  }
  return null;
}, yt = (e) => {
  if (typeof e != "string") return null;
  const t = e.trim();
  if (t.length === 0) return null;
  const n = Wa(t);
  if (n) return n;
  const i = Xa(t);
  return i || null;
}, $a = (e, t = { r: 0, g: 0, b: 0, a: 1 }) => {
  const n = yt(e);
  if (!n) return t;
  const [i, r, o, s] = n;
  return { r: i, g: r, b: o, a: s };
}, Li = (e) => typeof e == "number" && Number.isFinite(e) ? e : void 0, jr = (e) => {
  throw new Error(`RenderCoordinator: unreachable value: ${String(e)}`);
}, Ya = (e) => Array.isArray(e), Ha = (e) => Ya(e) ? { x: e[0], y: e[1] } : { x: e.x, y: e.y }, Dt = (e) => Math.min(1, Math.max(0, e)), qa = (e) => {
  const { canvasWidth: t, canvasHeight: n, devicePixelRatio: i } = e, r = e.left * i, o = t - e.right * i, s = e.top * i, a = n - e.bottom * i, c = pn(Math.floor(r), 0, Math.max(0, t)), f = pn(Math.floor(s), 0, Math.max(0, n)), l = pn(Math.ceil(o), 0, Math.max(0, t)), g = pn(Math.ceil(a), 0, Math.max(0, n)), u = Math.max(0, l - c), y = Math.max(0, g - f);
  return { x: c, y: f, w: u, h: y };
}, li = (e, t) => (e + 1) / 2 * t, ui = (e, t) => (1 - e) / 2 * t, cr = 24 * 60 * 60 * 1e3, Za = 30 * cr, ja = 365 * cr, Ka = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
], wr = (e, t) => {
  if (typeof e == "number") return Number.isFinite(e) ? e : null;
  if (typeof e != "string") return null;
  const n = e.trim();
  if (n.length === 0) return null;
  if (n.endsWith("%")) {
    const r = Number.parseFloat(n.slice(0, -1));
    return Number.isFinite(r) ? r / 100 * t : null;
  }
  const i = Number.parseFloat(n);
  return Number.isFinite(i) ? i : null;
}, Ja = (e) => Array.isArray(e), Qa = (e, t) => {
  if (e == null) return { inner: 0, outer: t * 0.7 };
  if (Ja(e)) {
    const r = wr(e[0], t), o = wr(e[1], t), s = Math.max(0, Number.isFinite(r) ? r : 0), a = Math.max(s, Number.isFinite(o) ? o : t * 0.7);
    return { inner: s, outer: Math.min(t, a) };
  }
  const n = wr(e, t), i = Math.max(0, Number.isFinite(n) ? n : t * 0.7);
  return { inner: 0, outer: Math.min(t, i) };
}, Yt = (e) => String(Math.trunc(e)).padStart(2, "0"), ec = (e, t) => {
  if (!Number.isFinite(e)) return null;
  (!Number.isFinite(t) || t < 0) && (t = 0);
  const n = new Date(e);
  if (!Number.isFinite(n.getTime())) return null;
  const i = n.getFullYear(), r = n.getMonth() + 1, o = n.getDate(), s = n.getHours(), a = n.getMinutes();
  return t < cr ? `${Yt(s)}:${Yt(a)}` : t <= 7 * cr ? `${Yt(r)}/${Yt(o)} ${Yt(s)}:${Yt(a)}` : t < 3 * Za ? `${Yt(r)}/${Yt(o)}` : t <= ja ? `${Ka[n.getMonth()] ?? Yt(r)} ${Yt(o)}` : `${i}/${Yt(r)}`;
}, tc = 8;
function nc(e, t = tc) {
  const n = Math.abs(e);
  if (!Number.isFinite(n) || n === 0) return 0;
  for (let i = 0; i <= t; i++) {
    const r = n * 10 ** i, o = Math.round(r), s = Math.abs(r - o), a = 1e-9 * Math.max(1, Math.abs(r));
    if (s <= a) return i;
  }
  return Math.max(0, Math.min(t, 1 - Math.floor(Math.log10(n)) + 1));
}
function Ro(e) {
  const t = nc(e);
  return new Intl.NumberFormat(void 0, { maximumFractionDigits: t });
}
function Do(e, t) {
  if (!Number.isFinite(t)) return null;
  const n = Math.abs(t) < 1e-12 ? 0 : t, i = e.format(n);
  return i === "NaN" ? null : i;
}
function ic(e) {
  return Math.max(
    e + 1,
    Math.round(e * 1.15)
  );
}
const Eo = 6, Cr = 4, rc = 5;
function Mr(e, t) {
  return (e + 1) / 2 * t;
}
function Sr(e, t) {
  return (1 - e) / 2 * t;
}
function _i(e, t, n) {
  e.style.fontFamily = n.fontFamily, e.style.fontWeight = t ? "500" : "400", e.style.userSelect = "none", e.style.pointerEvents = "none";
}
function oc(e, t, n) {
  var Y, j, q;
  const { gpuContext: i, currentOptions: r, xScale: o, yScale: s, xTickValues: a, plotClipRect: c, visibleXRangeMs: f } = n;
  if (!r.series.some((Z) => Z.type !== "pie") || !e || !t)
    return;
  const g = i.canvas;
  if (!g) return;
  const u = Ea(g), y = Ba(g);
  if (u <= 0 || y <= 0) return;
  const p = g.offsetLeft || 0, M = g.offsetTop || 0, R = Mr(c.left, u), D = Mr(c.right, u), T = Sr(c.top, y), A = Sr(c.bottom, y);
  e.clear();
  const b = r.xAxis.tickLength ?? Eo, m = A + b + Cr + r.theme.fontSize * 0.5, x = r.xAxis.type === "time", w = (() => {
    if (x) return null;
    const Z = Li(r.xAxis.min) ?? o.invert(c.left), J = Li(r.xAxis.max) ?? o.invert(c.right), re = a.length, W = re === 1 ? 0 : (J - Z) / (re - 1);
    return Ro(W);
  })(), v = r.xAxis.tickFormatter;
  for (let Z = 0; Z < a.length; Z++) {
    const J = a[Z], re = o.scale(J), W = Mr(re, u), de = a.length === 1 ? "middle" : Z === 0 ? "start" : Z === a.length - 1 ? "end" : "middle", L = v ? v(J) : x ? ec(J, f) : Do(w, J);
    if (L == null) continue;
    const X = e.addLabel(L, p + W, M + m, {
      fontSize: r.theme.fontSize,
      color: r.theme.textColor,
      anchor: de
    });
    _i(X, false, r.theme);
  }
  const I = rc, N = r.yAxis.tickLength ?? Eo, C = Li(r.yAxis.min) ?? s.invert(c.bottom), d = Li(r.yAxis.max) ?? s.invert(c.top), h = (d - C) / (I - 1), F = Ro(h), S = R - N - Cr, P = [], B = r.yAxis.tickFormatter;
  for (let Z = 0; Z < I; Z++) {
    const J = Z / (I - 1), re = C + J * (d - C), W = s.scale(re), de = Sr(W, y), L = B ? B(re) : Do(F, re);
    if (L == null) continue;
    const X = e.addLabel(L, p + S, M + de, {
      fontSize: r.theme.fontSize,
      color: r.theme.textColor,
      anchor: "end"
    });
    _i(X, false, r.theme), P.push(X);
  }
  const E = ic(r.theme.fontSize), z = ((Y = r.xAxis.name) == null ? void 0 : Y.trim()) ?? "";
  if (z.length > 0) {
    const Z = (R + D) / 2, J = m + r.theme.fontSize * 0.5, de = ((j = r.dataZoom) == null ? void 0 : j.some(($) => ($ == null ? void 0 : $.type) === "slider")) ?? false ? y - 32 : y, L = (J + de) / 2, X = e.addLabel(z, p + Z, M + L, {
      fontSize: E,
      color: r.theme.textColor,
      anchor: "middle"
    });
    _i(X, true, r.theme);
  }
  const U = ((q = r.yAxis.name) == null ? void 0 : q.trim()) ?? "";
  if (U.length > 0) {
    const Z = P.length === 0 ? 0 : P.reduce((L, X) => Math.max(L, X.getBoundingClientRect().width), 0), J = (T + A) / 2, W = S - Z - Cr - E * 0.5, de = e.addLabel(U, p + W, M + J, {
      fontSize: E,
      color: r.theme.textColor,
      anchor: "middle",
      rotation: -90
    });
    _i(de, true, r.theme);
  }
}
function Bo(e) {
  return "offsetLeft" in e;
}
function Fr(e, t) {
  return (e + 1) / 2 * t;
}
function Nr(e, t) {
  return (1 - e) / 2 * t;
}
function sc(e, t) {
  const n = yt(e) ?? [0, 0, 0, 1], i = Dt(n[3] * Dt(t)), r = Math.round(Dt(n[0]) * 255), o = Math.round(Dt(n[1]) * 255), s = Math.round(Dt(n[2]) * 255);
  return `rgba(${r}, ${o}, ${s}, ${i})`;
}
function ac(e, t) {
  if (!Number.isFinite(e)) return "";
  if (t == null) return String(e);
  const n = Math.min(20, Math.max(0, Math.floor(t)));
  return e.toFixed(n);
}
const Lo = /\{(x|y|value|name)\}/g;
function _o(e, t, n) {
  return Lo.lastIndex = 0, e.replace(Lo, (i, r) => {
    if (r === "name") return t.name ?? "";
    const o = t[r];
    return o == null ? "" : ac(o, n);
  });
}
function cc(e) {
  switch (e) {
    case "center":
      return "middle";
    case "end":
      return "end";
    case "start":
    default:
      return "start";
  }
}
function lc(e, t, n) {
  var D, T, A;
  const {
    currentOptions: i,
    xScale: r,
    yScale: o,
    canvasCssWidthForAnnotations: s,
    canvasCssHeightForAnnotations: a,
    plotLeftCss: c,
    plotTopCss: f,
    plotWidthCss: l,
    plotHeightCss: g,
    canvas: u
  } = n;
  if (!i.series.some((b) => b.type !== "pie") || !e || !t)
    return;
  if (!u || s <= 0 || a <= 0 || l <= 0 || g <= 0) {
    e.clear();
    return;
  }
  const p = Bo(u) ? u.offsetLeft : 0, M = Bo(u) ? u.offsetTop : 0;
  e.clear();
  const R = i.annotations ?? [];
  if (R.length !== 0)
    for (let b = 0; b < R.length; b++) {
      const m = R[b], x = m.label;
      if (!(x != null || m.type === "text")) continue;
      let v = null, I = null, N = { name: m.id ?? "" };
      switch (m.type) {
        case "lineX": {
          const W = r.scale(m.x);
          v = Fr(W, s), I = f, N = { ...N, x: m.x, value: m.x };
          break;
        }
        case "lineY": {
          const W = o.scale(m.y), de = Nr(W, a);
          v = c, I = de - 8, N = { ...N, y: m.y, value: m.y };
          break;
        }
        case "point": {
          const W = r.scale(m.x), de = o.scale(m.y), L = Fr(W, s), X = Nr(de, a);
          v = L, I = X, N = { ...N, x: m.x, y: m.y, value: m.y };
          break;
        }
        case "text": {
          if (m.position.space === "data") {
            const W = r.scale(m.position.x), de = o.scale(m.position.y), L = Fr(W, s), X = Nr(de, a);
            v = L, I = X, N = { ...N, x: m.position.x, y: m.position.y, value: m.position.y };
          } else {
            const W = c + m.position.x * l, de = f + m.position.y * g;
            v = W, I = de, N = { ...N, x: m.position.x, y: m.position.y, value: m.position.y };
          }
          break;
        }
        default:
          jr(m);
      }
      if (v == null || I == null || !Number.isFinite(v) || !Number.isFinite(I))
        continue;
      const C = 200;
      if (v < c - C || v > c + l + C || I < f - C || I > f + g + C)
        continue;
      const d = ((D = x == null ? void 0 : x.offset) == null ? void 0 : D[0]) ?? 0, h = ((T = x == null ? void 0 : x.offset) == null ? void 0 : T[1]) ?? 0, F = v + d, S = I + h, P = (x == null ? void 0 : x.text) ?? (x != null && x.template ? _o(x.template, N, x.decimals) : x ? (() => {
        const W = m.type === "lineX" ? "x={x}" : m.type === "lineY" ? "y={y}" : m.type === "point" ? "({x}, {y})" : m.type === "text" ? m.text : "";
        return W.includes("{") ? _o(W, N, x.decimals) : W;
      })() : m.type === "text" ? m.text : ""), B = typeof P == "string" ? P.trim() : "";
      if (B.length === 0) continue;
      const E = cc(x == null ? void 0 : x.anchor), z = ((A = m.style) == null ? void 0 : A.color) ?? i.theme.textColor, U = i.theme.fontSize, Y = x == null ? void 0 : x.background, j = (Y == null ? void 0 : Y.color) != null ? sc(Y.color, Y.opacity ?? 1) : void 0, q = (() => {
        const W = Y == null ? void 0 : Y.padding;
        return typeof W == "number" && Number.isFinite(W) ? [W, W, W, W] : Array.isArray(W) && W.length === 4 && W.every((de) => typeof de == "number" && Number.isFinite(de)) ? [W[0], W[1], W[2], W[3]] : Y ? [2, 4, 2, 4] : void 0;
      })(), Z = typeof (Y == null ? void 0 : Y.borderRadius) == "number" && Number.isFinite(Y.borderRadius) ? Y.borderRadius : void 0, J = {
        x: p + F,
        y: M + S,
        ...j ? {
          background: {
            backgroundColor: j,
            ...q ? { padding: q } : {},
            ...Z != null ? { borderRadius: Z } : {}
          }
        } : {}
      }, re = e.addLabel(B, J.x, J.y, {
        fontSize: U,
        color: z,
        anchor: E
      });
      if (J.background) {
        if (re.style.backgroundColor = J.background.backgroundColor, re.style.display = "inline-block", re.style.boxSizing = "border-box", J.background.padding) {
          const [W, de, L, X] = J.background.padding;
          re.style.padding = `${W}px ${de}px ${L}px ${X}px`;
        }
        J.background.borderRadius != null && (re.style.borderRadius = `${J.background.borderRadius}px`);
      }
    }
}
const ko = 20, uc = 0.01, fc = 0.2, Tr = 4;
function dc(e, t) {
  let n = 0, i = Ne(e);
  for (; n < i;) {
    const r = n + i >>> 1;
    Fe(e, r) < t ? n = r + 1 : i = r;
  }
  return n;
}
function mc(e, t, n) {
  return e >= n.left && e <= n.right && t >= n.top && t <= n.bottom;
}
const Ar = (e) => Math.min(1, Math.max(0, e)), pc = (e) => {
  const t = e.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!t) return null;
  const n = Number(t[1]) / 100;
  return Number.isFinite(n) ? n : null;
}, hc = (e) => {
  if (typeof e != "string") return "";
  const t = e.trim();
  return t.length > 0 ? t : "";
}, na = (e) => Array.isArray(e), yc = (e) => {
  if (na(e)) {
    const n = e[2];
    return typeof n == "number" && Number.isFinite(n) ? n : null;
  }
  const t = e.size;
  return typeof t == "number" && Number.isFinite(t) ? t : null;
}, gc = (e) => na(e) ? e : [e.x, e.y, e.size], xc = (e, t) => {
  try {
    const n = e(t);
    return typeof n == "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}, Ir = (e, t) => {
  const n = yc(t);
  if (n != null) return Math.max(0, n);
  const i = e.symbolSize;
  if (typeof i == "number")
    return Number.isFinite(i) ? Math.max(0, i) : Tr;
  if (typeof i == "function") {
    const r = xc(i, gc(t));
    return r == null ? Tr : Math.max(0, r);
  }
  return Tr;
};
function bc(e) {
  const t = /* @__PURE__ */ new Map(), n = new Array(e.length), i = new Array(e.length);
  let r = 0;
  for (let o = 0; o < e.length; o++) {
    const s = hc(e[o].stack);
    if (i[o] = s, s !== "") {
      const a = t.get(s);
      if (a !== void 0)
        n[o] = a;
      else {
        const c = r++;
        t.set(s, c), n[o] = c;
      }
    } else
      n[o] = r++;
  }
  return {
    clusterIndexBySeries: n,
    clusterCount: Math.max(1, r),
    stackIdBySeries: i
  };
}
function vc(e) {
  const t = [];
  for (let i = 0; i < e.length; i++) {
    const r = e[i].data, o = Ne(r);
    for (let s = 0; s < o; s++) {
      const a = Fe(r, s);
      Number.isFinite(a) && t.push(a);
    }
  }
  if (t.length < 2) return 1;
  t.sort((i, r) => i - r);
  let n = Number.POSITIVE_INFINITY;
  for (let i = 1; i < t.length; i++) {
    const r = t[i] - t[i - 1];
    r > 0 && r < n && (n = r);
  }
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function wc(e, t, n) {
  if (Number.isFinite(n) && n > 0) {
    const s = t.scale(0), a = t.scale(0 + n), c = Math.abs(a - s);
    if (Number.isFinite(c) && c > 0) return c;
  }
  const i = [];
  for (let o = 0; o < e.length; o++) {
    const s = e[o].data, a = Ne(s);
    for (let c = 0; c < a; c++) {
      const f = Fe(s, c);
      if (!Number.isFinite(f)) continue;
      const l = t.scale(f);
      Number.isFinite(l) && i.push(l);
    }
  }
  if (i.length < 2) return 0;
  i.sort((o, s) => o - s);
  let r = Number.POSITIVE_INFINITY;
  for (let o = 1; o < i.length; o++) {
    const s = i[o] - i[o - 1];
    s > 0 && s < r && (r = s);
  }
  return Number.isFinite(r) && r > 0 ? r : 0;
}
const Cc = (e) => {
  let t, n, i;
  for (let r = 0; r < e.length; r++) {
    const o = e[r];
    t === void 0 && o.barWidth !== void 0 && (t = o.barWidth), n === void 0 && o.barGap !== void 0 && (n = o.barGap), i === void 0 && o.barCategoryGap !== void 0 && (i = o.barCategoryGap);
  }
  return { barWidth: t, barGap: n, barCategoryGap: i };
};
function ia(e, t) {
  const n = bc(e), i = n.clusterCount, r = vc(e), o = wc(e, t, r), s = Cc(e), a = Ar(s.barGap ?? uc), c = Ar(s.barCategoryGap ?? fc), f = Math.max(0, o * (1 - c)), l = i + Math.max(0, i - 1) * a, g = l > 0 ? f / l : 0;
  let u = 0;
  const y = s.barWidth;
  if (typeof y == "number")
    u = Math.max(0, y), u = Math.min(u, g);
  else if (typeof y == "string") {
    const R = pc(y);
    u = R == null ? 0 : g * Ar(R);
  }
  u > 0 || (u = g);
  const p = u * a, M = i * u + Math.max(0, i - 1) * p;
  return {
    categoryStep: r,
    categoryWidthPx: o,
    barWidthPx: u,
    gapPx: p,
    clusterWidthPx: M,
    clusterSlots: n
  };
}
const Pr = (e) => {
  let t = Number.POSITIVE_INFINITY, n = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < e.length; i++) {
    const r = e[i].data, o = Ne(r);
    for (let s = 0; s < o; s++) {
      const a = _e(r, s);
      Number.isFinite(a) && (a < t && (t = a), a > n && (n = a));
    }
  }
  return !Number.isFinite(t) || !Number.isFinite(n) || t <= 0 && 0 <= n ? 0 : Math.abs(t) < Math.abs(n) ? t : n;
};
function Mc(e, t) {
  let n = 0;
  for (let i = 0; i < e.length; i++) {
    const r = e[i].data, o = Ne(r);
    for (let s = 0; s < o; s++) {
      const a = _e(r, s);
      if (!Number.isFinite(a)) continue;
      const c = t.scale(a);
      Number.isFinite(c) && c > n && (n = c);
    }
  }
  return Math.max(0, n);
}
function Sc(e, t, n) {
  const i = t.invert(n), r = t.invert(0), o = Math.min(i, r), s = Math.max(i, r);
  let a;
  !Number.isFinite(o) || !Number.isFinite(s) ? a = Pr(e) : o <= 0 && 0 <= s ? a = 0 : o > 0 ? a = o : s < 0 ? a = s : a = Pr(e);
  let c = t.scale(a);
  return Number.isFinite(c) || (a = Pr(e), c = t.scale(a)), Number.isFinite(c) || (a = 0, c = t.scale(0)), { baselineDomain: a, baselinePx: c };
}
function Fc(e, t, n, i) {
  return Number.isFinite(t) && t > 0 && Number.isFinite(e) ? Math.round(e / t) : Number.isFinite(i) && i > 0 && Number.isFinite(n) ? Math.round(n / i) : Math.round(n * 1e6);
}
function lr(e, t, n, i, r, o = ko) {
  var D;
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  const s = Number.isFinite(o) ? Math.max(0, o) : ko, a = s * s, c = i.invert(t);
  if (!Number.isFinite(c)) return null;
  let f = -1, l = -1, g = null, u = Number.POSITIVE_INFINITY;
  const y = [], p = [];
  for (let T = 0; T < e.length; T++) {
    const A = e[T];
    (A == null ? void 0 : A.type) === "bar" && A.visible !== false && (y.push(A), p.push(T));
  }
  if (y.length > 0) {
    const T = ia(y, i);
    if (T.barWidthPx > 0 && T.clusterWidthPx >= 0) {
      const A = Mc(y, r), { baselineDomain: b, baselinePx: m } = Sc(y, r, A), { clusterSlots: x, barWidthPx: w, gapPx: v, clusterWidthPx: I, categoryWidthPx: N, categoryStep: C } = T, d = /* @__PURE__ */ new Map();
      let h = null;
      for (let F = 0; F < y.length; F++) {
        const S = y[F], P = p[F] ?? -1;
        if (P < 0) continue;
        const B = S.data, E = Ne(B), z = x.clusterIndexBySeries[F] ?? 0, U = x.stackIdBySeries[F] ?? "";
        for (let Y = 0; Y < E; Y++) {
          const j = Fe(B, Y), q = _e(B, Y);
          if (!Number.isFinite(j) || !Number.isFinite(q)) continue;
          const Z = i.scale(j);
          if (!Number.isFinite(Z)) continue;
          const J = Z - I / 2 + z * (w + v), re = J + w;
          let W = b, de = q;
          if (U !== "") {
            let ce = d.get(U);
            ce || (ce = /* @__PURE__ */ new Map(), d.set(U, ce));
            const fe = Fc(Z, N, j, C);
            let K = ce.get(fe);
            K || (K = { posSum: b, negSum: b }, ce.set(fe, K)), q >= 0 ? (W = K.posSum, de = W + q, K.posSum = de) : (W = K.negSum, de = W + q, K.negSum = de);
          } else
            W = b, de = q;
          const L = U !== "" ? r.scale(W) : m, X = r.scale(de);
          if (!Number.isFinite(L) || !Number.isFinite(X)) continue;
          const $ = {
            left: J,
            right: re,
            top: Math.min(L, X),
            bottom: Math.max(L, X)
          };
          if (!mc(t, n, $)) continue;
          (h === null || $.top < h.top || $.top === h.top && P > h.seriesIndex) && (h = { seriesIndex: P, dataIndex: Y, top: $.top });
        }
      }
      if (h) {
        const F = (D = e[h.seriesIndex]) == null ? void 0 : D.data;
        if (F) {
          const S = Fe(F, h.dataIndex), P = _e(F, h.dataIndex), B = at(F, h.dataIndex), E = B !== void 0 ? [S, P, B] : [S, P];
          return {
            seriesIndex: h.seriesIndex,
            dataIndex: h.dataIndex,
            point: E,
            distance: 0
          };
        }
      }
    }
  }
  const M = [], R = [];
  for (let T = 0; T < e.length; T++) {
    const A = e[T];
    A.type === "pie" || A.type === "candlestick" || A.visible !== false && (M.push(A), R.push(T));
  }
  for (let T = 0; T < M.length; T++) {
    const A = M[T], b = R[T] ?? -1;
    if (b < 0) continue;
    const m = A.data, x = Ne(m);
    if (x === 0) continue;
    const v = A.type === "scatter" ? A : null;
    if (so(m)) {
      const N = dc(m, c);
      for (let C = N; C < x; C++) {
        const d = Fe(m, C), h = _e(m, C);
        if (!Number.isFinite(d) || !Number.isFinite(h)) continue;
        const F = i.scale(d), S = r.scale(h);
        if (!Number.isFinite(F) || !Number.isFinite(S)) continue;
        const P = F - t, B = S - n, E = P * P + B * B;
        if (P * P > u) break;
        let U = a;
        if (v) {
          const j = at(m, C), Z = Ir(v, j !== void 0 ? [d, h, j] : [d, h]), J = s + Z;
          U = J * J;
        }
        if (E > U) continue;
        if (E < u || E === u && (g === null || b < f || b === f && C < l)) {
          u = E, f = b, l = C;
          const j = at(m, C);
          g = j !== void 0 ? [d, h, j] : [d, h];
        }
      }
      for (let C = N - 1; C >= 0; C--) {
        const d = Fe(m, C), h = _e(m, C);
        if (!Number.isFinite(d) || !Number.isFinite(h)) continue;
        const F = i.scale(d), S = r.scale(h);
        if (!Number.isFinite(F) || !Number.isFinite(S)) continue;
        const P = F - t, B = S - n, E = P * P + B * B;
        if (P * P > u) break;
        let U = a;
        if (v) {
          const j = at(m, C), Z = Ir(v, j !== void 0 ? [d, h, j] : [d, h]), J = s + Z;
          U = J * J;
        }
        if (E > U) continue;
        if (E < u || E === u && (g === null || b < f || b === f && C < l)) {
          u = E, f = b, l = C;
          const j = at(m, C);
          g = j !== void 0 ? [d, h, j] : [d, h];
        }
      }
    } else
      for (let N = 0; N < x; N++) {
        const C = Fe(m, N), d = _e(m, N);
        if (!Number.isFinite(C) || !Number.isFinite(d)) continue;
        const h = i.scale(C), F = r.scale(d);
        if (!Number.isFinite(h) || !Number.isFinite(F)) continue;
        const S = h - t, P = F - n, B = S * S + P * P;
        let E = a;
        if (v) {
          const U = at(m, N), j = Ir(v, U !== void 0 ? [C, d, U] : [C, d]), q = s + j;
          E = q * q;
        }
        if (B > E) continue;
        if (B < u || B === u && (g === null || b < f || b === f && N < l)) {
          u = B, f = b, l = N;
          const U = at(m, N);
          g = U !== void 0 ? [C, d, U] : [C, d];
        }
      }
  }
  return g === null || !Number.isFinite(u) ? null : {
    seriesIndex: f,
    dataIndex: l,
    point: g,
    distance: Math.sqrt(u)
  };
}
const Nc = 5, Tc = 1, Ac = 4;
function Ic(e, t) {
  var M;
  const {
    currentOptions: n,
    xScale: i,
    yScale: r,
    gridArea: o,
    xTickCount: s,
    hasCartesianSeries: a,
    effectivePointer: c,
    interactionScales: f,
    seriesForRender: l,
    withAlpha: g
  } = t, u = n.gridLines, y = u.show && u.horizontal.show ? u.horizontal.count : 0, p = u.show && u.vertical.show ? u.vertical.count : 0;
  if (y === 0 && p === 0)
    e.gridRenderer.prepare(o, { lineCount: { horizontal: 0, vertical: 0 } });
  else if (y > 0 && p > 0 && u.horizontal.color !== u.vertical.color)
    e.gridRenderer.prepare(o, {
      lineCount: { horizontal: y, vertical: 0 },
      color: u.horizontal.color
    }), e.gridRenderer.prepare(o, {
      lineCount: { horizontal: 0, vertical: p },
      color: u.vertical.color,
      append: true
    });
  else {
    const R = y > 0 ? u.horizontal.color : u.vertical.color;
    e.gridRenderer.prepare(o, {
      lineCount: { horizontal: y, vertical: p },
      color: R
    });
  }
  if (a && (e.xAxisRenderer.prepare(
    n.xAxis,
    i,
    "x",
    o,
    n.theme.axisLineColor,
    n.theme.axisTickColor,
    s
  ), e.yAxisRenderer.prepare(
    n.yAxis,
    r,
    "y",
    o,
    n.theme.axisLineColor,
    n.theme.axisTickColor,
    Nc
  )), c.hasPointer && c.isInGrid) {
    const R = {
      showX: true,
      // Sync has no meaningful y, so avoid horizontal line.
      showY: c.source !== "sync",
      color: g(n.theme.axisLineColor, 0.6),
      lineWidth: Tc
    };
    e.crosshairRenderer.prepare(c.x, c.y, o, R), e.crosshairRenderer.setVisible(true);
  } else
    e.crosshairRenderer.setVisible(false);
  if (c.source === "mouse" && c.hasPointer && c.isInGrid)
    if (f) {
      const R = lr(
        l,
        c.gridX,
        c.gridY,
        f.xScale,
        f.yScale
      );
      if (R) {
        const { x: D, y: T } = Ha(R.point), A = f.xScale.scale(D), b = f.yScale.scale(T);
        if (Number.isFinite(A) && Number.isFinite(b)) {
          const m = o.left + A, x = o.top + b, w = qa(o), v = {
            centerDeviceX: m * o.devicePixelRatio,
            centerDeviceY: x * o.devicePixelRatio,
            devicePixelRatio: o.devicePixelRatio,
            canvasWidth: o.canvasWidth,
            canvasHeight: o.canvasHeight,
            scissor: w
          }, I = ((M = n.series[R.seriesIndex]) == null ? void 0 : M.color) ?? "#888";
          e.highlightRenderer.prepare(v, I, Ac), e.highlightRenderer.setVisible(true);
        } else
          e.highlightRenderer.setVisible(false);
      } else
        e.highlightRenderer.setVisible(false);
    } else
      e.highlightRenderer.setVisible(false);
  else
    e.highlightRenderer.setVisible(false);
}
function Uo(e, t, n) {
  const i = yt(e ?? n) ?? yt(n) ?? [1, 1, 1, 1], r = t == null ? 1 : Dt(t);
  return [Dt(i[0]), Dt(i[1]), Dt(i[2]), Dt(i[3] * r)];
}
function Pc(e, t) {
  const n = yt(e) ?? [0, 0, 0, 1], i = Dt(n[3] * Dt(t)), r = Math.round(Dt(n[0]) * 255), o = Math.round(Dt(n[1]) * 255), s = Math.round(Dt(n[2]) * 255);
  return `rgba(${r}, ${o}, ${s}, ${i})`;
}
function Rc(e, t) {
  if (!Number.isFinite(e)) return "";
  if (t == null) return String(e);
  const n = Math.min(20, Math.max(0, Math.floor(t)));
  return e.toFixed(n);
}
function Go(e, t, n) {
  const i = /\{(x|y|value|name)\}/g;
  return e.replace(i, (r, o) => {
    if (o === "name") return t.name ?? "";
    const s = t[o];
    return s == null ? "" : Rc(s, n);
  });
}
function Dc(e) {
  switch (e) {
    case "center":
      return "middle";
    case "end":
      return "end";
    case "start":
    default:
      return "start";
  }
}
function Ec(e) {
  var A, b, m, x, w, v, I, N, C, d, h, F, S, P;
  const {
    annotations: t,
    xScale: n,
    yScale: i,
    plotBounds: r,
    canvasCssWidth: o,
    canvasCssHeight: s,
    theme: a,
    offsetX: c = 0,
    offsetY: f = 0
  } = e, { leftCss: l, topCss: g, widthCss: u, heightCss: y } = r, p = [], M = [], R = [], D = [], T = [];
  if (t.length === 0 || o <= 0 || s <= 0 || u <= 0 || y <= 0)
    return { linesBelow: p, linesAbove: M, markersBelow: R, markersAbove: D, labels: T };
  for (let B = 0; B < t.length; B++) {
    const E = t[B], z = E.layer ?? "aboveSeries", U = z === "belowSeries" ? p : M, Y = z === "belowSeries" ? R : D, j = (A = E.style) == null ? void 0 : A.color, q = (b = E.style) == null ? void 0 : b.opacity, Z = typeof ((m = E.style) == null ? void 0 : m.lineWidth) == "number" && Number.isFinite(E.style.lineWidth) ? Math.max(0, E.style.lineWidth) : 1, J = (x = E.style) == null ? void 0 : x.lineDash, re = Uo(j, q, a.textColor);
    switch (E.type) {
      case "lineX": {
        const ve = n.scale(E.x), Te = li(ve, o);
        if (!Number.isFinite(Te)) break;
        U.push({
          axis: "vertical",
          positionCssPx: Te,
          lineWidth: Z,
          lineDash: J,
          rgba: re
        });
        break;
      }
      case "lineY": {
        const ve = i.scale(E.y), Te = ui(ve, s);
        if (!Number.isFinite(Te)) break;
        U.push({
          axis: "horizontal",
          positionCssPx: Te,
          lineWidth: Z,
          lineDash: J,
          rgba: re
        });
        break;
      }
      case "point": {
        const ve = n.scale(E.x), Te = i.scale(E.y), Xe = li(ve, o), Ke = ui(Te, s);
        if (!Number.isFinite(Xe) || !Number.isFinite(Ke)) break;
        const We = typeof ((w = E.marker) == null ? void 0 : w.size) == "number" && Number.isFinite(E.marker.size) ? Math.max(1, E.marker.size) : 6, mt = ((I = (v = E.marker) == null ? void 0 : v.style) == null ? void 0 : I.color) ?? ((N = E.style) == null ? void 0 : N.color), ft = ((d = (C = E.marker) == null ? void 0 : C.style) == null ? void 0 : d.opacity) ?? ((h = E.style) == null ? void 0 : h.opacity), ke = Uo(mt, ft, a.textColor);
        Y.push({
          xCssPx: Xe,
          yCssPx: Ke,
          sizeCssPx: We,
          fillRgba: ke
        });
        break;
      }
      case "text":
        break;
      default:
        jr(E);
    }
    const W = E.label;
    if (!(W != null || E.type === "text")) continue;
    let L = null, X = null, $ = { name: E.id ?? "" };
    switch (E.type) {
      case "lineX": {
        const ve = n.scale(E.x);
        L = li(ve, o), X = g, $ = { ...$, x: E.x, value: E.x };
        break;
      }
      case "lineY": {
        const ve = i.scale(E.y), Te = ui(ve, s);
        L = l, X = Te - 8, $ = { ...$, y: E.y, value: E.y };
        break;
      }
      case "point": {
        const ve = n.scale(E.x), Te = i.scale(E.y), Xe = li(ve, o), Ke = ui(Te, s);
        L = Xe, X = Ke, $ = { ...$, x: E.x, y: E.y, value: E.y };
        break;
      }
      case "text": {
        if (E.position.space === "data") {
          const ve = n.scale(E.position.x), Te = i.scale(E.position.y), Xe = li(ve, o), Ke = ui(Te, s);
          L = Xe, X = Ke, $ = { ...$, x: E.position.x, y: E.position.y, value: E.position.y };
        } else {
          const ve = l + E.position.x * u, Te = g + E.position.y * y;
          L = ve, X = Te, $ = { ...$, x: E.position.x, y: E.position.y, value: E.position.y };
        }
        break;
      }
      default:
        jr(E);
    }
    if (L == null || X == null || !Number.isFinite(L) || !Number.isFinite(X))
      continue;
    const ue = 200;
    if (L < r.leftCss - ue || L > r.leftCss + r.widthCss + ue || X < r.topCss - ue || X > r.topCss + r.heightCss + ue)
      continue;
    const ce = ((F = W == null ? void 0 : W.offset) == null ? void 0 : F[0]) ?? 0, fe = ((S = W == null ? void 0 : W.offset) == null ? void 0 : S[1]) ?? 0, K = L + ce, ae = X + fe, ee = (W == null ? void 0 : W.text) ?? (W != null && W.template ? Go(W.template, $, W.decimals) : W ? (() => {
      const ve = E.type === "lineX" ? "x={x}" : E.type === "lineY" ? "y={y}" : E.type === "point" ? "({x}, {y})" : E.type === "text" ? E.text : "";
      return ve.includes("{") ? Go(ve, $, W.decimals) : ve;
    })() : E.type === "text" ? E.text : ""), te = typeof ee == "string" ? ee.trim() : "";
    if (te.length === 0) continue;
    const be = Dc(W == null ? void 0 : W.anchor), le = ((P = E.style) == null ? void 0 : P.color) ?? a.textColor, ye = a.fontSize, pe = W == null ? void 0 : W.background, Be = (pe == null ? void 0 : pe.color) != null ? Pc(pe.color, pe.opacity ?? 1) : void 0, Le = (() => {
      const ve = pe == null ? void 0 : pe.padding;
      return typeof ve == "number" && Number.isFinite(ve) ? [ve, ve, ve, ve] : Array.isArray(ve) && ve.length === 4 && ve.every((Te) => typeof Te == "number" && Number.isFinite(Te)) ? [ve[0], ve[1], ve[2], ve[3]] : pe ? [2, 4, 2, 4] : void 0;
    })(), rt = typeof (pe == null ? void 0 : pe.borderRadius) == "number" && Number.isFinite(pe.borderRadius) ? pe.borderRadius : void 0, ot = {
      text: te,
      x: c + K,
      y: f + ae,
      anchor: be,
      color: le,
      fontSize: ye,
      ...Be ? {
        background: {
          backgroundColor: Be,
          ...Le ? { padding: Le } : {},
          ...rt != null ? { borderRadius: rt } : {}
        }
      } : {}
    };
    T.push(ot);
  }
  return {
    linesBelow: p,
    linesAbove: M,
    markersBelow: R,
    markersAbove: D,
    labels: T
  };
}
function ra(e) {
  return Math.max(0, Math.min(1, e));
}
function Bc(e) {
  return e.type === "area" || e.type === "line" && !!e.areaStyle;
}
function Lc(e, t) {
  const {
    currentOptions: n,
    seriesForRender: i,
    xScale: r,
    yScale: o,
    gridArea: s,
    dataStore: a,
    appendedGpuThisFrame: c,
    gpuSeriesKindByIndex: f,
    zoomState: l,
    visibleXDomain: g,
    introPhase: u,
    introProgress01: y,
    withAlpha: p,
    maxRadiusCss: M
  } = t, R = n.yAxis.min ?? n.yAxis.min ?? 0, D = [], T = u === "running" ? ra(y) : 1;
  for (let m = 0; m < i.length; m++) {
    const x = i[m];
    switch (x.type) {
      case "area": {
        const w = x.baseline ?? R, v = x.connectNulls ? Mo(x.data) : x.data;
        e.areaRenderers[m].prepare(x, v, r, o, w);
        break;
      }
      case "line": {
        const w = (() => {
          if (n.xAxis.type !== "time") return 0;
          const h = x.data, F = Ne(h);
          for (let S = 0; S < F; S++) {
            const P = Fe(h, S);
            if (Number.isFinite(P)) return P;
          }
          return 0;
        })(), v = x.connectNulls ? Mo(x.data) : x.data;
        c.has(m) || a.setSeries(m, v, { xOffset: w });
        const I = a.getSeriesBuffer(m), N = v !== x.data ? { ...x, data: v } : x;
        e.lineRenderers[m].prepare(
          N,
          I,
          r,
          o,
          w,
          s.devicePixelRatio,
          s.canvasWidth,
          s.canvasHeight
        );
        const C = (l == null ? void 0 : l.getRange()) ?? null;
        if ((C == null || Number.isFinite(C.start) && Number.isFinite(C.end) && C.start <= 0 && C.end >= 100) && x.sampling === "none" ? f[m] = "fullRawLine" : f[m] = "other", x.areaStyle) {
          const h = {
            type: "area",
            name: x.name,
            rawData: x.data,
            data: v,
            color: x.areaStyle.color,
            areaStyle: x.areaStyle,
            sampling: x.sampling,
            samplingThreshold: x.samplingThreshold,
            connectNulls: x.connectNulls
          };
          e.areaRenderers[m].prepare(h, h.data, r, o, R);
        }
        break;
      }
      case "bar": {
        D.push(x);
        break;
      }
      case "scatter": {
        if (x.mode === "density") {
          const w = x.rawData ?? x.data, v = Va(w, g.min, g.max);
          c.has(m) || a.setSeries(m, w);
          const I = a.getSeriesBuffer(m), N = a.getSeriesPointCount(m);
          e.scatterDensityRenderers[m].prepare(
            x,
            I,
            N,
            v.start,
            v.end,
            r,
            o,
            s,
            x.rawBounds
          ), f[m] = "other";
        } else {
          const w = T < 1 ? { ...x, color: p(x.color, T) } : x;
          e.scatterRenderers[m].prepare(w, x.data, r, o, s);
        }
        break;
      }
      case "pie": {
        if (T < 1 && M > 0) {
          const w = Qa(x.radius, M), v = Math.max(0, w.inner) * T, I = Math.max(v, w.outer) * T, N = { ...x, radius: [v, I] };
          e.pieRenderers[m].prepare(N, s);
          break;
        }
        e.pieRenderers[m].prepare(x, s);
        break;
      }
      case "candlestick": {
        e.candlestickRenderers[m].prepare(x, x.data, r, o, s, n.theme.backgroundColor);
        break;
      }
      default: {
        const w = x;
        throw new Error(`Unhandled series type: ${w.type}`);
      }
    }
  }
  const A = i.map((m, x) => ({ series: m, originalIndex: x })).filter(({ series: m }) => m.visible !== false), b = D.filter((m) => m.visible !== false);
  return {
    visibleSeriesForRender: A,
    barSeriesConfigs: D,
    visibleBarSeriesConfigs: b
  };
}
function _c(e, t, n) {
  for (let i = 0; i < t.length; i++) {
    const r = t[i];
    r.visible !== false && r.type === "scatter" && r.mode === "density" && e.scatterDensityRenderers[i].encodeCompute(n);
  }
}
function kc(e, t, n, i) {
  const {
    hasCartesianSeries: r,
    gridArea: o,
    mainPass: s,
    plotScissor: a,
    introPhase: c,
    introProgress01: f,
    referenceLineBelowCount: l,
    markerBelowCount: g
  } = n, { visibleSeriesForRender: u } = i, y = c === "running" ? ra(f) : 1;
  for (let p = 0; p < u.length; p++) {
    const { series: M, originalIndex: R } = u[p];
    M.type === "pie" && e.pieRenderers[R].render(s);
  }
  r && a.w > 0 && a.h > 0 && (l > 0 || g > 0) && (s.setScissorRect(a.x, a.y, a.w, a.h), l > 0 && t.referenceLineRenderer.render(s, 0, l), g > 0 && t.annotationMarkerRenderer.render(s, 0, g), s.setScissorRect(0, 0, o.canvasWidth, o.canvasHeight));
  for (let p = 0; p < u.length; p++) {
    const { series: M, originalIndex: R } = u[p];
    if (Bc(M))
      if (y < 1) {
        const D = pn(Math.floor(a.w * y), 0, a.w);
        D > 0 && a.h > 0 && (s.setScissorRect(a.x, a.y, D, a.h), e.areaRenderers[R].render(s), s.setScissorRect(0, 0, o.canvasWidth, o.canvasHeight));
      } else
        s.setScissorRect(a.x, a.y, a.w, a.h), e.areaRenderers[R].render(s), s.setScissorRect(0, 0, o.canvasWidth, o.canvasHeight);
  }
  a.w > 0 && a.h > 0 && (s.setScissorRect(a.x, a.y, a.w, a.h), e.barRenderer.render(s), s.setScissorRect(0, 0, o.canvasWidth, o.canvasHeight));
  for (let p = 0; p < u.length; p++) {
    const { series: M, originalIndex: R } = u[p];
    M.type === "candlestick" && e.candlestickRenderers[R].render(s);
  }
  for (let p = 0; p < u.length; p++) {
    const { series: M, originalIndex: R } = u[p];
    M.type === "scatter" && (M.mode === "density" ? e.scatterDensityRenderers[R].render(s) : e.scatterRenderers[R].render(s));
  }
  for (let p = 0; p < u.length; p++) {
    const { series: M, originalIndex: R } = u[p];
    if (M.type === "line")
      if (y < 1) {
        const D = pn(Math.floor(a.w * y), 0, a.w);
        D > 0 && a.h > 0 && (s.setScissorRect(a.x, a.y, D, a.h), e.lineRenderers[R].render(s), s.setScissorRect(0, 0, o.canvasWidth, o.canvasHeight));
      } else
        s.setScissorRect(a.x, a.y, a.w, a.h), e.lineRenderers[R].render(s), s.setScissorRect(0, 0, o.canvasWidth, o.canvasHeight);
  }
}
function Uc(e, t) {
  const {
    hasCartesianSeries: n,
    gridArea: i,
    overlayPass: r,
    plotScissor: o,
    referenceLineBelowCount: s,
    referenceLineAboveCount: a,
    markerBelowCount: c,
    markerAboveCount: f
  } = t;
  if (n && o.w > 0 && o.h > 0 && (a > 0 || f > 0)) {
    const g = s, u = c;
    r.setScissorRect(o.x, o.y, o.w, o.h), a > 0 && e.referenceLineRendererMsaa.render(r, g, a), f > 0 && e.annotationMarkerRendererMsaa.render(r, u, f), r.setScissorRect(0, 0, i.canvasWidth, i.canvasHeight);
  }
}
const ur = `// grid.wgsl
// Minimal grid line shader:
// - Vertex input: vec2<f32> position in clip-space coordinates
// - Uniforms: identity transform + solid RGBA color

struct VSUniforms {
  transform: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct FSUniforms {
  color: vec4<f32>,
};

@group(0) @binding(1) var<uniform> fsUniforms: FSUniforms;

struct VSIn {
  @location(0) position: vec2<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn) -> VSOut {
  var out: VSOut;
  out.clipPosition = vsUniforms.transform * vec4<f32>(in.position, 0.0, 1.0);
  return out;
}

@fragment
fn fsMain() -> @location(0) vec4<f32> {
  return fsUniforms.color;
}
`, Gc = "vsMain", zc = "fsMain", Vc = (e) => Number.isInteger(e) && e > 0 && (e & e - 1) === 0, Wc = (e, t) => {
    if (!Number.isFinite(e) || e < 0)
      throw new Error(`alignTo(value): value must be a finite non-negative number. Received: ${String(e)}`);
    if (!Vc(t))
      throw new Error(`alignTo(alignment): alignment must be a positive power of two. Received: ${String(t)}`);
    return Math.floor(e) + t - 1 & ~(t - 1);
  }, zo = (e, t, n) => {
    if (n && n.device !== e)
      throw new Error("getStageModule(pipelineCache): cache.device must match the provided GPUDevice.");
    return "module" in t ? {
      module: t.module,
      entryPoint: t.entryPoint || "",
      constants: t.constants
    } : {
      module: oa(e, t.code, t.label, n),
      entryPoint: t.entryPoint || "",
      constants: t.constants
    };
  };
function oa(e, t, n, i) {
  if (typeof t != "string" || t.length === 0)
    throw new Error("createShaderModule(code): WGSL code must be a non-empty string.");
  if (i) {
    if (i.device !== e)
      throw new Error("createShaderModule(pipelineCache): cache.device must match the provided GPUDevice.");
    return i.getOrCreateShaderModule(t, n);
  }
  return e.createShaderModule({ code: t, label: n });
}
function Lt(e, t, n) {
  if (n && n.device !== e)
    throw new Error("createRenderPipeline(pipelineCache): cache.device must match the provided GPUDevice.");
  const i = zo(e, t.vertex, n), r = i.entryPoint || Gc;
  let o;
  if (t.fragment) {
    const l = zo(e, t.fragment, n), g = l.entryPoint || zc;
    let u;
    if (t.fragment.targets)
      u = [...t.fragment.targets];
    else {
      const y = t.fragment.formats;
      if (!y)
        throw new Error(
          "createRenderPipeline(fragment): provide either `fragment.targets` or `fragment.formats` when a fragment stage is present."
        );
      if (typeof y == "string")
        u = [
          {
            format: y,
            blend: t.fragment.blend,
            writeMask: t.fragment.writeMask
          }
        ];
      else {
        u = new Array(y.length);
        for (let p = 0; p < y.length; p++)
          u[p] = {
            format: y[p],
            blend: t.fragment.blend,
            writeMask: t.fragment.writeMask
          };
      }
    }
    o = {
      module: l.module,
      entryPoint: g,
      targets: u,
      constants: l.constants
    };
  }
  const s = t.primitive ?? { topology: "triangle-list" }, a = t.multisample ?? { count: 1 };
  let c;
  t.layout != null ? c = t.layout : t.bindGroupLayouts ? c = e.createPipelineLayout({ bindGroupLayouts: [...t.bindGroupLayouts] }) : c = "auto";
  const f = {
    label: t.label,
    layout: c,
    vertex: {
      module: i.module,
      entryPoint: r,
      buffers: t.vertex.buffers ? [...t.vertex.buffers] : [],
      constants: i.constants
    },
    fragment: o,
    primitive: s,
    depthStencil: t.depthStencil,
    multisample: a
  };
  return n ? n.getOrCreateRenderPipeline(f) : e.createRenderPipeline(f);
}
function Vo(e, t, n) {
  if (n && n.device !== e)
    throw new Error("createComputePipeline(pipelineCache): cache.device must match the provided GPUDevice.");
  return n ? n.getOrCreateComputePipeline(t) : e.createComputePipeline(t);
}
function dt(e, t, n) {
  if (!Number.isFinite(t) || t <= 0)
    throw new Error(`createUniformBuffer(size): size must be a positive number. Received: ${String(t)}`);
  const i = (n == null ? void 0 : n.alignment) ?? 16, r = Wc(t, Math.max(4, i)), o = e.limits.maxUniformBufferBindingSize;
  if (r > o)
    throw new Error(
      `createUniformBuffer(size): requested size ${r} exceeds device.limits.maxUniformBufferBindingSize (${o}).`
    );
  return e.createBuffer({
    label: n == null ? void 0 : n.label,
    size: r,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
}
function ut(e, t, n) {
  const i = n instanceof ArrayBuffer ? { arrayBuffer: n, offset: 0, size: n.byteLength } : { arrayBuffer: n.buffer, offset: n.byteOffset, size: n.byteLength };
  if (i.size !== 0) {
    if (i.offset & 3 || i.size & 3)
      throw new Error(
        `writeUniformBuffer(data): data byteOffset (${i.offset}) and byteLength (${i.size}) must be multiples of 4 for queue.writeBuffer().`
      );
    if (i.size > t.size)
      throw new Error(`writeUniformBuffer(data): data byteLength (${i.size}) exceeds buffer.size (${t.size}).`);
    e.queue.writeBuffer(t, 0, i.arrayBuffer, i.offset, i.size);
  }
}
const Oc = "bgra8unorm", Xc = 5, $c = 6, Yc = [1, 1, 1, 0.8], Hc = () => {
  const e = new ArrayBuffer(64);
  return new Float32Array(e).set([
    1,
    0,
    0,
    0,
    // col0
    0,
    1,
    0,
    0,
    // col1
    0,
    0,
    1,
    0,
    // col2
    0,
    0,
    0,
    1
    // col3
  ]), e;
}, qc = (e) => Number.isFinite(e.left) && Number.isFinite(e.right) && Number.isFinite(e.top) && Number.isFinite(e.bottom) && Number.isFinite(e.canvasWidth) && Number.isFinite(e.canvasHeight), Wo = (e) => typeof e == "number" && Number.isFinite(e) ? e : void 0, Zc = (e, t) => {
  let n = e, i = t;
  if ((!Number.isFinite(n) || !Number.isFinite(i)) && (n = 0, i = 1), n === i)
    i = n + 1;
  else if (n > i) {
    const r = n;
    n = i, i = r;
  }
  return { min: n, max: i };
}, jc = (e, t, n, i, r) => {
  const { left: o, right: s, top: a, bottom: c, canvasWidth: f, canvasHeight: l } = i, g = Number.isFinite(i.devicePixelRatio) && i.devicePixelRatio > 0 ? i.devicePixelRatio : 1;
  if (!qc(i))
    throw new Error("AxisRenderer.prepare: gridArea dimensions must be finite numbers.");
  if (f <= 0 || l <= 0)
    throw new Error("AxisRenderer.prepare: canvas dimensions must be positive.");
  if (o < 0 || s < 0 || a < 0 || c < 0)
    throw new Error("AxisRenderer.prepare: gridArea margins must be non-negative.");
  const u = o * g, y = f - s * g, p = a * g, M = l - c * g, R = u / f * 2 - 1, D = y / f * 2 - 1, T = 1 - p / l * 2, A = 1 - M / l * 2, b = e.tickLength ?? $c;
  if (!Number.isFinite(b) || b < 0)
    throw new Error("AxisRenderer.prepare: tickLength must be a finite non-negative number.");
  const m = r ?? Xc, x = Math.max(1, Math.floor(m));
  if (!Number.isFinite(m) || x < 1)
    throw new Error("AxisRenderer.prepare: tickCount must be a finite number >= 1.");
  const w = b * g, v = w / f * 2, I = w / l * 2, N = Wo(e.min) ?? (n === "x" ? t.invert(R) : t.invert(A)), C = Wo(e.max) ?? (n === "x" ? t.invert(D) : t.invert(T)), d = Zc(N, C), h = d.min, F = d.max, S = 1 + x, P = new Float32Array(S * 2 * 2);
  let B = 0;
  if (n === "x") {
    P[B++] = R, P[B++] = A, P[B++] = D, P[B++] = A;
    const E = A, z = E - I;
    for (let U = 0; U < x; U++) {
      const Y = x === 1 ? 0.5 : U / (x - 1), j = h + Y * (F - h), q = t.scale(j);
      P[B++] = q, P[B++] = E, P[B++] = q, P[B++] = z;
    }
  } else {
    P[B++] = R, P[B++] = A, P[B++] = R, P[B++] = T;
    const E = R, z = E - v;
    for (let U = 0; U < x; U++) {
      const Y = x === 1 ? 0.5 : U / (x - 1), j = h + Y * (F - h), q = t.scale(j);
      P[B++] = E, P[B++] = q, P[B++] = z, P[B++] = q;
    }
  }
  return P;
};
function Oo(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? Oc, r = (t == null ? void 0 : t.sampleCount) ?? 1, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), c = dt(e, 64, { label: "axisRenderer/vsUniforms" }), f = dt(e, 16, { label: "axisRenderer/fsUniformsLine" }), l = dt(e, 16, { label: "axisRenderer/fsUniformsTick" }), g = e.createBindGroup({
    layout: a,
    entries: [
      { binding: 0, resource: { buffer: c } },
      { binding: 1, resource: { buffer: f } }
    ]
  }), u = e.createBindGroup({
    layout: a,
    entries: [
      { binding: 0, resource: { buffer: c } },
      { binding: 1, resource: { buffer: l } }
    ]
  }), y = Lt(
    e,
    {
      label: "axisRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: ur,
        label: "grid.wgsl",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }]
          }
        ]
      },
      fragment: {
        code: ur,
        label: "grid.wgsl",
        formats: i,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "line-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let p = null, M = 0;
  const R = () => {
    if (n) throw new Error("AxisRenderer is disposed.");
  };
  return {
    prepare: (b, m, x, w, v, I, N) => {
      if (R(), x !== "x" && x !== "y")
        throw new Error("AxisRenderer.prepare: orientation must be 'x' or 'y'.");
      const C = jc(b, m, x, w, N), d = C.byteLength, h = Math.max(4, d);
      if (!p || p.size < h) {
        if (p)
          try {
            p.destroy();
          } catch {
          }
        p = e.createBuffer({
          label: "axisRenderer/vertexBuffer",
          size: h,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      e.queue.writeBuffer(p, 0, C.buffer, 0, C.byteLength), M = C.length / 2, ut(e, c, Hc());
      const F = v ?? "rgba(255,255,255,0.8)", S = I ?? F, P = yt(F) ?? Yc, B = yt(S) ?? P, E = new ArrayBuffer(4 * 4);
      new Float32Array(E).set([
        P[0],
        P[1],
        P[2],
        P[3]
      ]), ut(e, f, E);
      const z = new ArrayBuffer(4 * 4);
      new Float32Array(z).set([
        B[0],
        B[1],
        B[2],
        B[3]
      ]), ut(e, l, z);
    }, render: (b) => {
      R(), !(M === 0 || !p) && (b.setPipeline(y), b.setVertexBuffer(0, p), b.setBindGroup(0, g), b.draw(Math.min(2, M)), M > 2 && (b.setBindGroup(0, u), b.draw(M - 2, 1, 2, 0)));
    }, dispose: () => {
      if (!n) {
        n = true;
        try {
          c.destroy();
        } catch {
        }
        try {
          f.destroy();
        } catch {
        }
        try {
          l.destroy();
        } catch {
        }
        if (p)
          try {
            p.destroy();
          } catch {
          }
        p = null, M = 0;
      }
    }
  };
}
const Kc = "bgra8unorm", Jc = 5, Qc = 6, el = "rgba(255,255,255,0.15)", tl = [1, 1, 1, 0.15], nl = () => {
  const e = new ArrayBuffer(64);
  return new Float32Array(e).set([
    1,
    0,
    0,
    0,
    // col0
    0,
    1,
    0,
    0,
    // col1
    0,
    0,
    1,
    0,
    // col2
    0,
    0,
    0,
    1
    // col3
  ]), e;
}, il = (e, t, n) => {
  const { left: i, right: r, top: o, bottom: s, canvasWidth: a, canvasHeight: c } = e, f = Number.isFinite(e.devicePixelRatio) && e.devicePixelRatio > 0 ? e.devicePixelRatio : 1, l = i * f, g = a - r * f, u = o * f, y = c - s * f, p = g - l, M = y - u, R = t + n, D = new Float32Array(R * 2 * 2);
  let T = 0;
  for (let A = 0; A < t; A++) {
    const b = t === 1 ? 0.5 : A / (t - 1), m = u + b * M, x = l / a * 2 - 1, w = g / a * 2 - 1, v = 1 - m / c * 2;
    D[T++] = x, D[T++] = v, D[T++] = w, D[T++] = v;
  }
  for (let A = 0; A < n; A++) {
    const b = n === 1 ? 0.5 : A / (n - 1), x = (l + b * p) / a * 2 - 1, w = 1 - u / c * 2, v = 1 - y / c * 2;
    D[T++] = x, D[T++] = w, D[T++] = x, D[T++] = v;
  }
  return D;
};
function rl(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? Kc, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), c = dt(e, 64, { label: "gridRenderer/vsUniforms" }), f = dt(e, 16, { label: "gridRenderer/fsUniforms" }), l = e.createBindGroup({
    layout: a,
    entries: [
      { binding: 0, resource: { buffer: c } },
      { binding: 1, resource: { buffer: f } }
    ]
  }), g = Lt(
    e,
    {
      label: "gridRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: ur,
        label: "grid.wgsl",
        buffers: [
          {
            arrayStride: 8,
            // vec2<f32> = 2 * 4 bytes
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }]
          }
        ]
      },
      fragment: {
        code: ur,
        label: "grid.wgsl",
        formats: i,
        // Enable standard alpha blending so `fsUniforms.color.a` behaves as expected
        // (blends into the cleared background instead of making the canvas pixels transparent).
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "line-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let u = null, y = null, p = [];
  const M = () => {
    if (n) throw new Error("GridRenderer is disposed.");
  };
  return {
    prepare: (A, b) => {
      M();
      const m = b != null && typeof b == "object" && ("lineCount" in b || "color" in b || "append" in b), x = m ? b : void 0, w = m ? x == null ? void 0 : x.lineCount : b, v = (w == null ? void 0 : w.horizontal) ?? Jc, I = (w == null ? void 0 : w.vertical) ?? Qc, N = (x == null ? void 0 : x.color) ?? el, C = (x == null ? void 0 : x.append) === true;
      if (v < 0 || I < 0)
        throw new Error("GridRenderer.prepare: line counts must be non-negative.");
      if (!Number.isFinite(A.left) || !Number.isFinite(A.right) || !Number.isFinite(A.top) || !Number.isFinite(A.bottom) || !Number.isFinite(A.canvasWidth) || !Number.isFinite(A.canvasHeight))
        throw new Error("GridRenderer.prepare: gridArea dimensions must be finite numbers.");
      if (A.canvasWidth <= 0 || A.canvasHeight <= 0)
        throw new Error("GridRenderer.prepare: canvas dimensions must be positive.");
      if (v === 0 && I === 0) {
        C || (y = null, p = []);
        return;
      }
      const d = il(A, v, I), h = (v + I) * 2, F = yt(N) ?? tl;
      let S = 0;
      if (C && y && y.byteLength > 0 && p.length > 0) {
        S = y.byteLength;
        const z = new Float32Array(y.length + d.length);
        z.set(y, 0), z.set(d, y.length), y = z, p = p.concat([{ vertexOffsetBytes: S, vertexCount: h, rgba: F }]);
      } else
        y = d, p = [{ vertexOffsetBytes: 0, vertexCount: h, rgba: F }];
      const P = y.byteLength, B = Math.max(4, P);
      if (!u || u.size < B) {
        if (u)
          try {
            u.destroy();
          } catch {
          }
        u = e.createBuffer({
          label: "gridRenderer/vertexBuffer",
          size: B,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      e.queue.writeBuffer(u, 0, y.buffer, 0, y.byteLength);
      const E = nl();
      ut(e, c, E);
    }, render: (A) => {
      if (M(), !(p.length === 0 || !u)) {
        A.setPipeline(g), A.setBindGroup(0, l);
        for (const b of p) {
          const m = new ArrayBuffer(16);
          new Float32Array(m).set([b.rgba[0], b.rgba[1], b.rgba[2], b.rgba[3]]), ut(e, f, m), A.setVertexBuffer(0, u, b.vertexOffsetBytes), A.draw(b.vertexCount);
        }
      }
    }, dispose: () => {
      if (!n) {
        n = true;
        try {
          c.destroy();
        } catch {
        }
        try {
          f.destroy();
        } catch {
        }
        if (u)
          try {
            u.destroy();
          } catch {
          }
        u = null, y = null, p = [];
      }
    }
  };
}
const Xo = `// area.wgsl
// Minimal area-fill shader (triangle-strip):
// - Vertex input: vec2<f32> position in data coords
// - Uniforms: clip-space transform + baseline value + solid RGBA color
// - Topology: triangle-strip
// - CPU duplicates vertices as p0,p0,p1,p1,... and we use vertex_index parity:
//   even index -> "top" vertex (original y)
//   odd index  -> "baseline" vertex (uniform baseline)

struct VSUniforms {
  transform: mat4x4<f32>,
  baseline: f32,
  // Pad to 16-byte multiple (uniform buffer layout requirements).
  _pad0: vec3<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct FSUniforms {
  color: vec4<f32>,
};

@group(0) @binding(1) var<uniform> fsUniforms: FSUniforms;

struct VSIn {
  @location(0) position: vec2<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  var out: VSOut;
  let useBaseline = (vertexIndex & 1u) == 1u;
  let y = select(in.position.y, vsUniforms.baseline, useBaseline);
  let pos = vec2<f32>(in.position.x, y);
  out.clipPosition = vsUniforms.transform * vec4<f32>(pos, 0.0, 1.0);
  return out;
}

@fragment
fn fsMain() -> @location(0) vec4<f32> {
  return fsUniforms.color;
}

`, ol = "bgra8unorm", $o = (e) => Math.min(1, Math.max(0, e)), sl = (e) => yt(e) ?? [0, 0, 0, 1], Yo = (e, t, n) => {
    const i = e.scale(t), r = e.scale(n);
    if (!Number.isFinite(t) || !Number.isFinite(n) || t === n || !Number.isFinite(i) || !Number.isFinite(r))
      return { a: 0, b: Number.isFinite(i) ? i : 0 };
    const o = (r - i) / (n - t), s = i - o * t;
    return { a: Number.isFinite(o) ? o : 0, b: Number.isFinite(s) ? s : 0 };
  }, al = (e, t, n, i, r) => {
    e[0] = t, e[1] = 0, e[2] = 0, e[3] = 0, e[4] = 0, e[5] = i, e[6] = 0, e[7] = 0, e[8] = 0, e[9] = 0, e[10] = 1, e[11] = 0, e[12] = n, e[13] = r, e[14] = 0, e[15] = 1;
  }, cl = (e) => {
    const t = Ne(e), n = new Float32Array(t * 2 * 2);
    let i = 0;
    for (let r = 0; r < t; r++) {
      const o = Fe(e, r), s = _e(e, r);
      !Number.isFinite(o) || !Number.isFinite(s) ? (n[i++] = 0, n[i++] = 0, n[i++] = 0, n[i++] = 0) : (n[i++] = o, n[i++] = s, n[i++] = o, n[i++] = s);
    }
    return n;
  };
function ll(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? ol, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), c = dt(e, 96, { label: "areaRenderer/vsUniforms" }), f = dt(e, 16, { label: "areaRenderer/fsUniforms" }), l = new ArrayBuffer(96), g = new Float32Array(l), u = new Float32Array(4), y = e.createBindGroup({
    layout: a,
    entries: [
      { binding: 0, resource: { buffer: c } },
      { binding: 1, resource: { buffer: f } }
    ]
  }), p = Lt(
    e,
    {
      label: "areaRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: Xo,
        label: "area.wgsl",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }]
          }
        ]
      },
      fragment: {
        code: Xo,
        label: "area.wgsl",
        formats: i,
        // Enable standard alpha blending so `areaStyle.opacity` behaves correctly.
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-strip", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let M = null, R = 0;
  const D = () => {
    if (n) throw new Error("AreaRenderer is disposed.");
  }, T = (x, w, v, I, N) => {
    al(g, x, w, v, I), g[16] = N, g[17] = 0, g[18] = 0, g[19] = 0, g[20] = 0, g[21] = 0, g[22] = 0, g[23] = 0, ut(e, c, l);
  };
  return {
    prepare: (x, w, v, I, N) => {
      D();
      const C = cl(w), d = C.byteLength, h = Math.max(4, d);
      if (!M || M.size < h) {
        if (M)
          try {
            M.destroy();
          } catch {
          }
        M = e.createBuffer({
          label: "areaRenderer/vertexBuffer",
          size: h,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      C.byteLength > 0 && e.queue.writeBuffer(M, 0, C.buffer, 0, C.byteLength), R = C.length / 2;
      const F = zt(w), { xMin: S, xMax: P, yMin: B, yMax: E } = F ?? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, { a: z, b: U } = Yo(v, S, P), { a: Y, b: j } = Yo(I, B, E), q = Number.isFinite(N ?? Number.NaN) ? N : Number.isFinite(B) ? B : 0;
      T(z, U, Y, j, q);
      const [Z, J, re, W] = sl(x.areaStyle.color), de = $o(x.areaStyle.opacity);
      u[0] = Z, u[1] = J, u[2] = re, u[3] = $o(W * de), ut(e, f, u);
    }, render: (x) => {
      D(), !(!M || R < 4) && (x.setPipeline(p), x.setBindGroup(0, y), x.setVertexBuffer(0, M), x.draw(R));
    }, dispose: () => {
      if (!n) {
        if (n = true, M)
          try {
            M.destroy();
          } catch {
          }
        M = null, R = 0;
        try {
          c.destroy();
        } catch {
        }
        try {
          f.destroy();
        } catch {
        }
      }
    }
  };
}
const Ho = `// line.wgsl — Screen-space quad expansion with SDF-based anti-aliasing.
//
// Each "instance" draws one line segment (point[i] → point[i+1]).
// 6 vertices per instance (2 triangles = 1 quad per segment).
//
// The vertex shader:
//   1. Reads endpoints from a storage buffer.
//   2. Transforms both to clip space using the mat4x4 transform.
//   3. Converts clip→screen (NDC * canvasSize * 0.5).
//   4. Computes the perpendicular direction in screen space.
//   5. Offsets vertices by ±(halfWidth + AA_PADDING) along the perpendicular.
//   6. Converts back to clip space.
//   7. Outputs \`acrossDevice\` varying for SDF-based AA.
//
// The fragment shader applies smoothstep AA on the distance-from-edge.

const AA_PADDING: f32 = 1.5;

struct VSUniforms {
  transform       : mat4x4<f32>,  // 64 bytes: data-coord → clip-space
  canvasSize      : vec2<f32>,     //  8 bytes: device pixels (width, height)
  devicePixelRatio: f32,           //  4 bytes
  lineWidthCssPx  : f32,           //  4 bytes: line width in CSS pixels
};
// Total: 80 bytes (aligned to 16).

@group(0) @binding(0) var<uniform> vsUniforms : VSUniforms;

struct FSUniforms {
  color : vec4<f32>,
};

@group(0) @binding(1) var<uniform> fsUniforms : FSUniforms;

@group(0) @binding(2) var<storage, read> points : array<vec2<f32>>;

struct VSOut {
  @builtin(position) clipPosition : vec4<f32>,
  @location(0) acrossDevice       : f32,
  @location(1) @interpolate(flat) widthDevice : f32,
};

// Returns UV for the 6 vertices of a quad (2 triangles):
//   uv.x: 0 → endpoint A, 1 → endpoint B
//   uv.y: 0 → +side, 1 → −side
fn quadUv(vid : u32) -> vec2<f32> {
  switch (vid) {
    case 0u: { return vec2<f32>(0.0, 0.0); }
    case 1u: { return vec2<f32>(1.0, 0.0); }
    case 2u: { return vec2<f32>(0.0, 1.0); }
    case 3u: { return vec2<f32>(0.0, 1.0); }
    case 4u: { return vec2<f32>(1.0, 0.0); }
    default: { return vec2<f32>(1.0, 1.0); }
  }
}

@vertex
fn vsMain(
  @builtin(vertex_index) vid : u32,
  @builtin(instance_index) iid : u32,
) -> VSOut {
  let uv = quadUv(vid);

  // Read segment endpoints in data coordinates.
  let pA_data = points[iid];
  let pB_data = points[iid + 1u];

  // ── Gap detection ──────────────────────────────────────────────
  // Null entries in the data array are packed as NaN by the CPU.
  // Collapse the quad to a degenerate point so the rasterizer discards it.
  // WGSL has no isnan(); use the IEEE 754 property that NaN != NaN.
  if (pA_data.x != pA_data.x || pA_data.y != pA_data.y ||
      pB_data.x != pB_data.x || pB_data.y != pB_data.y) {
    var out: VSOut;
    out.clipPosition = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    out.acrossDevice = 0.0;
    out.widthDevice = 0.0;
    return out;
  }

  // Transform to clip space.
  let clipA = vsUniforms.transform * vec4<f32>(pA_data, 0.0, 1.0);
  let clipB = vsUniforms.transform * vec4<f32>(pB_data, 0.0, 1.0);

  // Convert clip → screen (device pixels). 
  // screen = (ndc * 0.5 + 0.5) * canvasSize, but Y is flipped.
  let ndcA = clipA.xy / clipA.w;
  let ndcB = clipB.xy / clipB.w;
  let screenA = vec2<f32>(
    (ndcA.x * 0.5 + 0.5) * vsUniforms.canvasSize.x,
    (1.0 - (ndcA.y * 0.5 + 0.5)) * vsUniforms.canvasSize.y,
  );
  let screenB = vec2<f32>(
    (ndcB.x * 0.5 + 0.5) * vsUniforms.canvasSize.x,
    (1.0 - (ndcB.y * 0.5 + 0.5)) * vsUniforms.canvasSize.y,
  );

  // Segment direction and perpendicular in screen space.
  let delta = screenB - screenA;
  let segLen = length(delta);

  // Degenerate segment: collapse quad to a degenerate triangle.
  if (segLen < 1e-6) {
    var out : VSOut;
    out.clipPosition = clipA;
    out.acrossDevice = 0.0;
    out.widthDevice = 0.0;
    return out;
  }

  let dir = delta / segLen;
  // Perpendicular: rotate 90° CW → (dy, -dx).
  let perp = vec2<f32>(dir.y, -dir.x);

  // Compute line width in device pixels + AA padding.
  let dpr = max(vsUniforms.devicePixelRatio, 1e-6);
  let widthDevice = max(1.0, vsUniforms.lineWidthCssPx * dpr);
  let halfExtent = widthDevice * 0.5 + AA_PADDING;

  // Select endpoint: uv.x=0 → A, uv.x=1 → B.
  let baseScreen = mix(screenA, screenB, uv.x);

  // Offset perpendicular: uv.y selects +side (0) vs −side (1).
  let side = mix(1.0, -1.0, uv.y);
  let screenPos = baseScreen + perp * halfExtent * side;

  // acrossDevice: 0 at −side edge, widthDevice at +side edge.
  // Map from [−halfExtent, +halfExtent] to [0, widthDevice + 2*AA_PADDING].
  let totalExtent = 2.0 * halfExtent;
  let acrossDevice = (side * halfExtent + halfExtent) / totalExtent * totalExtent;
  // Simplified: acrossDevice = halfExtent * (1 + side) = halfExtent + halfExtent * side
  // But for the fragment shader we want [0, totalExtent]:
  // Let's define it properly:
  // At side=+1: screenPos is at +halfExtent from center → acrossDevice = totalExtent
  // At side=-1: screenPos is at -halfExtent from center → acrossDevice = 0
  let acrossDeviceVal = halfExtent * (1.0 + side);

  // Convert screen → clip.
  let clipX = (screenPos.x / vsUniforms.canvasSize.x) * 2.0 - 1.0;
  let clipY = 1.0 - (screenPos.y / vsUniforms.canvasSize.y) * 2.0;

  var out : VSOut;
  out.clipPosition = vec4<f32>(clipX, clipY, 0.0, 1.0);
  out.acrossDevice = acrossDeviceVal;
  out.widthDevice = widthDevice;
  return out;
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let totalExtent = in.widthDevice + 2.0 * AA_PADDING;
  let edgeDist = min(in.acrossDevice, totalExtent - in.acrossDevice);

  // Smooth step from 0 to AA zone for anti-aliased edges.
  let aa = max(fwidth(in.acrossDevice), 1e-3) * 1.25;
  let edgeCoverage = smoothstep(0.0, aa, edgeDist);

  // Also fade out in the AA_PADDING region (beyond the nominal half-width).
  // The padding zone is [0, AA_PADDING] at each edge.
  // Distance from the nominal edge = edgeDist - AA_PADDING (negative means inside).
  // Actually, remap: the nominal line occupies [AA_PADDING, AA_PADDING + widthDevice].
  let nominalDist = min(in.acrossDevice - AA_PADDING, (AA_PADDING + in.widthDevice) - in.acrossDevice);
  let paddingCoverage = smoothstep(0.0, aa, nominalDist);

  // Combine: paddingCoverage handles the SDF fade, edgeCoverage handles the outer trim.
  // For thin lines (< 1 device px), paddingCoverage alone provides the desired fade.
  let coverage = min(edgeCoverage, paddingCoverage);

  var color = fsUniforms.color;
  color = vec4<f32>(color.rgb, color.a * coverage);
  return color;
}
`, ul = "bgra8unorm", fl = 2, qo = (e) => Math.min(1, Math.max(0, e)), dl = (e) => yt(e) ?? [0, 0, 0, 1], Zo = (e, t, n) => {
    const i = e.scale(t), r = e.scale(n);
    if (!Number.isFinite(t) || !Number.isFinite(n) || t === n || !Number.isFinite(i) || !Number.isFinite(r))
      return { a: 0, b: Number.isFinite(i) ? i : 0 };
    const o = (r - i) / (n - t), s = i - o * t;
    return { a: Number.isFinite(o) ? o : 0, b: Number.isFinite(s) ? s : 0 };
  }, ml = (e, t, n, i, r) => {
    e[0] = t, e[1] = 0, e[2] = 0, e[3] = 0, e[4] = 0, e[5] = i, e[6] = 0, e[7] = 0, e[8] = 0, e[9] = 0, e[10] = 1, e[11] = 0, e[12] = n, e[13] = r, e[14] = 0, e[15] = 1;
  };
function pl(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? ul, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }
    ]
  }), c = dt(e, 80, { label: "lineRenderer/vsUniforms" }), f = dt(e, 16, { label: "lineRenderer/fsUniforms" }), l = new ArrayBuffer(80), g = new Float32Array(l), u = new Float32Array(4);
  let y = null;
  const p = Lt(
    e,
    {
      label: "lineRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: Ho,
        label: "line.wgsl",
        buffers: []
        // No vertex buffers — points are read from storage buffer.
      },
      fragment: {
        code: Ho,
        label: "line.wgsl",
        formats: i,
        // Enable standard alpha blending so per-series `lineStyle.opacity` and AA transparency work.
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let M = 0;
  const R = () => {
    if (n) throw new Error("LineRenderer is disposed.");
  };
  return {
    prepare: (b, m, x, w, v = 0, I = 1, N = 1, C = 1) => {
      R(), M = Ne(b.data);
      const d = zt(b.data), { xMin: h, xMax: F, yMin: S, yMax: P } = d ?? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, { a: B, b: E } = Zo(x, h, F), { a: z, b: U } = Zo(w, S, P), Y = E + B * v;
      ml(g, B, Y, z, U);
      const j = Number.isFinite(I) && I > 0 ? I : 1, q = Number.isFinite(N) && N > 0 ? N : 1, Z = Number.isFinite(C) && C > 0 ? C : 1, J = Number.isFinite(b.lineStyle.width) && b.lineStyle.width > 0 ? b.lineStyle.width : fl;
      g[16] = q, g[17] = Z, g[18] = j, g[19] = J, ut(e, c, l);
      const [re, W, de, L] = dl(b.color), X = qo(b.lineStyle.opacity);
      u[0] = re, u[1] = W, u[2] = de, u[3] = qo(L * X), ut(e, f, u), y = e.createBindGroup({
        layout: a,
        entries: [
          { binding: 0, resource: { buffer: c } },
          { binding: 1, resource: { buffer: f } },
          { binding: 2, resource: { buffer: m } }
        ]
      });
    }, render: (b) => {
      R(), !(!y || M < 2) && (b.setPipeline(p), b.setBindGroup(0, y), b.draw(6, M - 1));
    }, dispose: () => {
      if (!n) {
        n = true, y = null, M = 0;
        try {
          c.destroy();
        } catch {
        }
        try {
          f.destroy();
        } catch {
        }
      }
    }
  };
}
const jo = `// scatter.wgsl
// Instanced anti-aliased circle shader (SDF):
// - Per-instance vertex input:
//   - center   = vec2<f32> point center (transformed by VSUniforms.transform)
//   - radiusPx = f32 circle radius in pixels
// - Draw call: draw(6, instanceCount) using triangle-list expansion in VS
// - Uniforms:
//   - @group(0) @binding(0): VSUniforms { transform, viewportPx }
//   - @group(0) @binding(1): FSUniforms { color }
//
// Notes:
// - \`viewportPx\` is the current render target size in pixels (width, height).
// - The quad is expanded in clip space using \`radiusPx\` and \`viewportPx\`.

struct VSUniforms {
  transform: mat4x4<f32>,
  viewportPx: vec2<f32>,
  // Pad to 16-byte alignment (mat4x4 is 64B; vec2 adds 8B; pad to 80B).
  _pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct FSUniforms {
  color: vec4<f32>,
};

@group(0) @binding(1) var<uniform> fsUniforms: FSUniforms;

struct VSIn {
  @location(0) center: vec2<f32>,
  @location(1) radiusPx: f32,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) localPx: vec2<f32>,
  @location(1) radiusPx: f32,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Fixed local corners for 2 triangles (triangle-list).
  // \`localNdc\` is a quad in [-1, 1]^2; we convert it to pixel offsets via radiusPx.
  let localNdc = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  let corner = localNdc[vertexIndex];
  let localPx = corner * in.radiusPx;

  // Convert pixel offset to clip-space offset.
  // Clip space spans [-1, 1] across the viewport, so px -> clip is (2 / viewportPx).
  let localClip = localPx * (2.0 / vsUniforms.viewportPx);

  let centerClip = (vsUniforms.transform * vec4<f32>(in.center, 0.0, 1.0)).xy;

  var out: VSOut;
  out.clipPosition = vec4<f32>(centerClip + localClip, 0.0, 1.0);
  out.localPx = localPx;
  out.radiusPx = in.radiusPx;
  return out;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  // Signed distance to the circle boundary (negative inside).
  let dist = length(in.localPx) - in.radiusPx;

  // Analytic-ish AA: smooth edge based on derivative of dist in screen space.
  let w = fwidth(dist);
  let a = 1.0 - smoothstep(0.0, w, dist);

  // Discard fully outside to avoid unnecessary blending work.
  if (a <= 0.0) {
    discard;
  }

  return vec4<f32>(fsUniforms.color.rgb, fsUniforms.color.a * a);
}

`, hl = "bgra8unorm", Rr = 4, Qi = 16, Dr = Qi / 4, yl = (e) => Math.min(1, Math.max(0, e)), ki = (e, t, n) => Math.min(n, Math.max(t, e | 0)), gl = (e) => yt(e) ?? [0, 0, 0, 1], Ko = (e) => {
    if (!Number.isFinite(e) || e <= 0) return 1;
    const t = Math.ceil(e);
    return 2 ** Math.ceil(Math.log2(t));
  }, Jo = (e, t, n) => {
    const i = e.scale(t), r = e.scale(n);
    if (!Number.isFinite(t) || !Number.isFinite(n) || t === n || !Number.isFinite(i) || !Number.isFinite(r))
      return { a: 0, b: Number.isFinite(i) ? i : 0 };
    const o = (r - i) / (n - t), s = i - o * t;
    return { a: Number.isFinite(o) ? o : 0, b: Number.isFinite(s) ? s : 0 };
  }, xl = (e, t, n, i, r) => {
    e[0] = t, e[1] = 0, e[2] = 0, e[3] = 0, e[4] = 0, e[5] = i, e[6] = 0, e[7] = 0, e[8] = 0, e[9] = 0, e[10] = 1, e[11] = 0, e[12] = n, e[13] = r, e[14] = 0, e[15] = 1;
  }, bl = (e) => {
    const { canvasWidth: t, canvasHeight: n, devicePixelRatio: i } = e, r = e.left * i, o = t - e.right * i, s = e.top * i, a = n - e.bottom * i, c = ki(Math.floor(r), 0, Math.max(0, t)), f = ki(Math.floor(s), 0, Math.max(0, n)), l = ki(Math.ceil(o), 0, Math.max(0, t)), g = ki(Math.ceil(a), 0, Math.max(0, n)), u = Math.max(0, l - c), y = Math.max(0, g - f);
    return { x: c, y: f, w: u, h: y };
  };
function vl(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? hl, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), c = dt(e, 80, { label: "scatterRenderer/vsUniforms" }), f = dt(e, 16, { label: "scatterRenderer/fsUniforms" }), l = new ArrayBuffer(80), g = new Float32Array(l), u = new Float32Array(4), y = e.createBindGroup({
    layout: a,
    entries: [
      { binding: 0, resource: { buffer: c } },
      { binding: 1, resource: { buffer: f } }
    ]
  }), p = Lt(
    e,
    {
      label: "scatterRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: jo,
        label: "scatter.wgsl",
        buffers: [
          {
            arrayStride: Qi,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, format: "float32x2", offset: 0 },
              { shaderLocation: 1, format: "float32", offset: 8 }
            ]
          }
        ]
      },
      fragment: {
        code: jo,
        label: "scatter.wgsl",
        formats: i,
        // Standard alpha blending (circle AA uses alpha, and series color may be translucent).
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let M = null, R = 0, D = new ArrayBuffer(0), T = new Float32Array(D), A = 0, b = 0, m = [1, 1], x = null;
  const w = () => {
    if (n) throw new Error("ScatterRenderer is disposed.");
  }, v = (h) => {
    if (h <= T.length) return;
    const F = Math.max(8, Ko(h));
    D = new ArrayBuffer(F * 4), T = new Float32Array(D);
  }, I = (h, F, S, P, B, E) => {
    const z = Number.isFinite(B) && B > 0 ? B : 1, U = Number.isFinite(E) && E > 0 ? E : 1;
    xl(g, h, F, S, P), g[16] = z, g[17] = U, g[18] = 0, g[19] = 0, ut(e, c, l), m = [z, U];
  };
  return {
    prepare: (h, F, S, P, B) => {
      w();
      const E = zt(F), { xMin: z, xMax: U, yMin: Y, yMax: j } = E ?? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, { a: q, b: Z } = Jo(S, z, U), { a: J, b: re } = Jo(P, Y, j);
      B ? (A = B.canvasWidth, b = B.canvasHeight, I(q, Z, J, re, B.canvasWidth, B.canvasHeight), x = bl(B)) : (I(q, Z, J, re, m[0], m[1]), x = null);
      const [W, de, L, X] = gl(h.color);
      u[0] = W, u[1] = de, u[2] = L, u[3] = yl(X), ut(e, f, u);
      const $ = (B == null ? void 0 : B.devicePixelRatio) ?? 1, ue = $ > 0 && Number.isFinite($), ce = h.symbolSize, fe = [0, 0, void 0], K = typeof ce == "function" ? (le, ye, pe) => {
        fe[0] = le, fe[1] = ye, fe[2] = pe;
        const Be = ce(fe);
        return typeof Be == "number" && Number.isFinite(Be) ? Be : Rr;
      } : typeof ce == "number" && Number.isFinite(ce) ? (le, ye, pe) => ce : (le, ye, pe) => Rr, ae = Ne(F);
      v(ae * Dr);
      const ee = T;
      let te = 0;
      for (let le = 0; le < ae; le++) {
        const ye = Fe(F, le), pe = _e(F, le);
        if (!Number.isFinite(ye) || !Number.isFinite(pe)) continue;
        const Be = at(F, le), Le = Be ?? K(ye, pe, Be), rt = Number.isFinite(Le) ? Math.max(0, Le) : Rr, ot = ue ? rt * $ : rt;
        ot > 0 && (ee[te + 0] = ye, ee[te + 1] = pe, ee[te + 2] = ot, ee[te + 3] = 0, te += Dr);
      }
      R = te / Dr;
      const be = Math.max(4, R * Qi);
      if (!M || M.size < be) {
        const le = Math.max(Math.max(4, Ko(be)), M ? M.size : 0);
        if (M)
          try {
            M.destroy();
          } catch {
          }
        M = e.createBuffer({
          label: "scatterRenderer/instanceBuffer",
          size: le,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      M && R > 0 && e.queue.writeBuffer(M, 0, D, 0, R * Qi);
    }, render: (h) => {
      w(), !(!M || R === 0) && (x && A > 0 && b > 0 && h.setScissorRect(x.x, x.y, x.w, x.h), h.setPipeline(p), h.setBindGroup(0, y), h.setVertexBuffer(0, M), h.draw(6, R), x && A > 0 && b > 0 && h.setScissorRect(0, 0, A, b));
    }, dispose: () => {
      if (!n) {
        if (n = true, M)
          try {
            M.destroy();
          } catch {
          }
        M = null, R = 0;
        try {
          c.destroy();
        } catch {
        }
        try {
          f.destroy();
        } catch {
        }
        A = 0, b = 0, m = [1, 1], x = null;
      }
    }
  };
}
const wl = `struct ComputeUniforms {
  transform: mat4x4<f32>,
  viewportPx: vec2f,
  _pad0: vec2f,
  plotOriginPx: vec2<u32>,
  plotSizePx: vec2<u32>,
  binSizePx: u32,
  binCountX: u32,
  binCountY: u32,
  visibleStart: u32,
  visibleEnd: u32,
  normalization: u32,
  _pad1: vec2<u32>,
};

@group(0) @binding(0) var<uniform> u: ComputeUniforms;
@group(0) @binding(1) var<storage, read> points: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> bins: array<atomic<u32>>;

struct MaxBuffer {
  value: atomic<u32>,
};
@group(0) @binding(3) var<storage, read_write> maxBuf: MaxBuffer;

fn clipToDevicePx(clip: vec2f) -> vec2f {
  // clip in [-1,1] -> device pixel in [0, viewport]
  return vec2f(
    (clip.x * 0.5 + 0.5) * u.viewportPx.x,
    (-clip.y * 0.5 + 0.5) * u.viewportPx.y
  );
}

@compute @workgroup_size(256)
fn binPoints(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = u.visibleStart + gid.x;
  if (idx >= u.visibleEnd) {
    return;
  }

  let p = points[idx];
  let clip4 = u.transform * vec4f(p.x, p.y, 0.0, 1.0);
  let clip = clip4.xy / max(1e-9, clip4.w);
  let px = clipToDevicePx(clip);

  // Scissor bounds in device px
  let left = f32(u.plotOriginPx.x);
  let top = f32(u.plotOriginPx.y);
  let right = left + f32(u.plotSizePx.x);
  let bottom = top + f32(u.plotSizePx.y);

  if (px.x < left || px.x >= right || px.y < top || px.y >= bottom) {
    return;
  }

  let localX = u32((px.x - left) / f32(u.binSizePx));
  let localY = u32((px.y - top) / f32(u.binSizePx));
  if (localX >= u.binCountX || localY >= u.binCountY) {
    return;
  }

  let binIndex = localY * u.binCountX + localX;
  atomicAdd(&bins[binIndex], 1u);
}

@compute @workgroup_size(256)
fn reduceMax(@builtin(global_invocation_id) gid: vec3<u32>) {
  let binTotal = u.binCountX * u.binCountY;
  let i = gid.x;
  if (i >= binTotal) {
    return;
  }

  let v = atomicLoad(&bins[i]);
  atomicMax(&maxBuf.value, v);
}

`, Qo = `struct RenderUniforms {
  plotOriginPx: vec2<u32>,
  plotSizePx: vec2<u32>,
  binSizePx: u32,
  binCountX: u32,
  binCountY: u32,
  normalization: u32,
  _pad: vec2<u32>,
};

@group(0) @binding(0) var<uniform> u: RenderUniforms;
@group(0) @binding(1) var<storage, read> bins: array<u32>;
@group(0) @binding(2) var<storage, read> maxBuf: array<u32>;
@group(0) @binding(3) var lutTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
};

@vertex
fn vsMain(@builtin(vertex_index) vid: u32) -> VsOut {
  // Fullscreen triangle (covers clip space).
  // (0,0)->(-1,-1), (2,0)->(3,-1), (0,2)->(-1,3)
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var out: VsOut;
  out.position = vec4f(pos[vid], 0.0, 1.0);
  return out;
}

fn applyNormalization(count: f32, maxCount: f32, mode: u32) -> f32 {
  if (maxCount <= 0.0) {
    return 0.0;
  }
  let t = clamp(count / maxCount, 0.0, 1.0);
  if (mode == 1u) { // sqrt
    return sqrt(t);
  }
  if (mode == 2u) { // log
    // log1p(count) / log1p(max)
    return clamp(log(1.0 + count) / max(1e-9, log(1.0 + maxCount)), 0.0, 1.0);
  }
  return t; // linear
}

@fragment
fn fsMain(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  // pos.xy is framebuffer pixel coords (device px) with origin top-left.
  let x = pos.x;
  let y = pos.y;

  let left = f32(u.plotOriginPx.x);
  let top = f32(u.plotOriginPx.y);
  // plot scissor also applied on CPU; keep a guard anyway.
  if (x < left || y < top) {
    return vec4f(0.0);
  }

  let localX = u32((x - left) / f32(u.binSizePx));
  let localY = u32((y - top) / f32(u.binSizePx));
  if (localX >= u.binCountX || localY >= u.binCountY) {
    return vec4f(0.0);
  }

  let idx = localY * u.binCountX + localX;
  let c = f32(bins[idx]);
  let maxC = f32(maxBuf[0]);

  let t = applyNormalization(c, maxC, u.normalization);
  let lutX = i32(round(t * 255.0));
  let lut = textureLoad(lutTex, vec2<i32>(lutX, 0), 0);
  return vec4f(lut.rgb, 1.0);
}

`, Cl = "bgra8unorm", Ui = (e) => Math.min(1, Math.max(0, e)), hn = (e, t, n) => Math.min(n, Math.max(t, e | 0)), Ml = (e) => {
    if (!Number.isFinite(e) || e <= 0) return 1;
    const t = Math.ceil(e);
    return 2 ** Math.ceil(Math.log2(t));
  }, es = (e, t, n) => {
    const i = e.scale(t), r = e.scale(n);
    if (!Number.isFinite(t) || !Number.isFinite(n) || t === n || !Number.isFinite(i) || !Number.isFinite(r))
      return { a: 0, b: Number.isFinite(i) ? i : 0 };
    const o = (r - i) / (n - t), s = i - o * t;
    return { a: Number.isFinite(o) ? o : 0, b: Number.isFinite(s) ? s : 0 };
  }, Sl = (e, t, n, i, r) => {
    e[0] = t, e[1] = 0, e[2] = 0, e[3] = 0, e[4] = 0, e[5] = i, e[6] = 0, e[7] = 0, e[8] = 0, e[9] = 0, e[10] = 1, e[11] = 0, e[12] = n, e[13] = r, e[14] = 0, e[15] = 1;
  }, Fl = (e) => {
    const { canvasWidth: t, canvasHeight: n, devicePixelRatio: i } = e, r = e.left * i, o = t - e.right * i, s = e.top * i, a = n - e.bottom * i, c = hn(Math.floor(r), 0, Math.max(0, t)), f = hn(Math.floor(s), 0, Math.max(0, n)), l = hn(Math.ceil(o), 0, Math.max(0, t)), g = hn(Math.ceil(a), 0, Math.max(0, n)), u = Math.max(0, l - c), y = Math.max(0, g - f);
    return { x: c, y: f, w: u, h: y };
  }, Gi = (e, t, n) => e + (t - e) * n, Nl = (e, t, n) => [Gi(e[0], t[0], n), Gi(e[1], t[1], n), Gi(e[2], t[2], n), Gi(e[3], t[3], n)], Tl = (e) => yt(e) ?? [0, 0, 0, 1], ts = (e) => e === "plasma" ? ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"] : e === "inferno" ? ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"] : ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"], Al = (e) => {
    const n = (typeof e == "string" ? ts(e) : Array.isArray(e) && e.length > 0 ? e : ts("viridis")).map(Tl), i = Math.max(2, n.length), r = new Uint8Array(new ArrayBuffer(256 * 4));
    for (let o = 0; o < 256; o++) {
      const a = o / 255 * (i - 1), c = Math.min(i - 2, Math.max(0, Math.floor(a))), f = a - c, l = Nl(n[c], n[c + 1], f);
      r[o * 4 + 0] = hn(Math.round(Ui(l[0]) * 255), 0, 255), r[o * 4 + 1] = hn(Math.round(Ui(l[1]) * 255), 0, 255), r[o * 4 + 2] = hn(Math.round(Ui(l[2]) * 255), 0, 255), r[o * 4 + 3] = hn(Math.round(Ui(l[3]) * 255), 0, 255);
    }
    return r;
  }, Il = (e) => {
    if (typeof e == "string") return e;
    try {
      return JSON.stringify(e);
    } catch {
      return "custom";
    }
  }, Pl = (e) => e === "sqrt" ? 1 : e === "log" ? 2 : 0, Rl = new Uint32Array([0]).buffer;
function Dl(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? Cl, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
    ]
  }), c = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      // `scatterDensityColormap.wgsl` declares these as `var<storage, read>`, so they must be read-only-storage.
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } }
    ]
  }), f = dt(e, 128, { label: "scatterDensity/computeUniforms" }), l = new ArrayBuffer(128), g = new Float32Array(l, 0, 20), u = new Uint32Array(l), y = dt(e, 48, { label: "scatterDensity/renderUniforms" }), p = new ArrayBuffer(48), M = new Uint32Array(p), R = oa(
    e,
    wl,
    "scatterDensityBinning.wgsl",
    s
  ), D = e.createPipelineLayout({ bindGroupLayouts: [a] }), T = Vo(e, {
    label: "scatterDensity/binPointsPipeline",
    layout: D,
    compute: { module: R, entryPoint: "binPoints" }
  }, s), A = Vo(e, {
    label: "scatterDensity/reduceMaxPipeline",
    layout: D,
    compute: { module: R, entryPoint: "reduceMax" }
  }, s), b = Lt(
    e,
    {
      label: "scatterDensity/renderPipeline",
      bindGroupLayouts: [c],
      vertex: { code: Qo, label: "scatterDensityColormap.wgsl" },
      fragment: {
        code: Qo,
        label: "scatterDensityColormap.wgsl",
        formats: i,
        blend: void 0
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let m = null, x = null, w = 0, v = null, I = null, N = "", C = null, d = null, h = null, F = -1, S = 0, P = 0, B = 0, E = 0, z = 0, U = null, Y = 0, j = 0, q = 2, Z = true, J = false, re = new Uint32Array(0);
  const W = () => {
    if (n) throw new Error("ScatterDensityRenderer is disposed.");
  }, de = (K) => {
    const ae = Il(K.densityColormap);
    if (v || (v = e.createTexture({
      label: "scatterDensity/lutTexture",
      size: { width: 256, height: 1, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    }), I = v.createView(), N = ""), ae === N) return;
    const ee = Al(K.densityColormap);
    e.queue.writeTexture(
      { texture: v },
      ee,
      { bytesPerRow: 256 * 4, rowsPerImage: 1 },
      { width: 256, height: 1, depthOrArrayLayers: 1 }
    ), N = ae;
  }, L = (K, ae) => {
    const ee = Math.max(1, K | 0) * Math.max(1, ae | 0);
    if (m && x && ee <= w) return;
    const te = Math.max(1, ee);
    if (w = Math.max(256, Ml(te)), m) {
      try {
        m.destroy();
      } catch {
      }
      m = null;
    }
    if (x) {
      try {
        x.destroy();
      } catch {
      }
      x = null;
    }
    m = e.createBuffer({
      label: "scatterDensity/binsBuffer",
      size: w * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    }), x = e.createBuffer({
      label: "scatterDensity/maxBuffer",
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    }), re = new Uint32Array(w), C = null, d = null, Z = true;
  }, X = () => {
    !m || !x || !I || !h || (C || (C = e.createBindGroup({
      label: "scatterDensity/computeBindGroup",
      layout: a,
      entries: [
        { binding: 0, resource: { buffer: f } },
        { binding: 1, resource: { buffer: h } },
        { binding: 2, resource: { buffer: m } },
        { binding: 3, resource: { buffer: x } }
      ]
    })), d || (d = e.createBindGroup({
      label: "scatterDensity/renderBindGroup",
      layout: c,
      entries: [
        { binding: 0, resource: { buffer: y } },
        { binding: 1, resource: { buffer: m } },
        { binding: 2, resource: { buffer: x } },
        { binding: 3, resource: I }
      ]
    })));
  };
  return {
    prepare: (K, ae, ee, te, be, le, ye, pe, Be) => {
      W(), J = true;
      const Le = Fl(pe), rt = pe.devicePixelRatio, ot = Number.isFinite(K.binSize) ? Math.max(1e-6, K.binSize) : 2, ve = Math.max(1, Math.round(ot * (Number.isFinite(rt) && rt > 0 ? rt : 1))), Te = Math.max(1, Math.ceil(Le.w / ve)), Xe = Math.max(1, Math.ceil(Le.h / ve));
      L(Te, Xe), de(K);
      const Ke = Pl(K.densityNormalization);
      h !== ae && (h = ae, C = null, d = null, Z = true), F !== ee && (F = ee, Z = true), (S !== te || P !== be) && (S = te, P = be, Z = true), (B !== ve || E !== Te || z !== Xe) && (B = ve, E = Te, z = Xe, Z = true), (!U || U.x !== Le.x || U.y !== Le.y || U.w !== Le.w || U.h !== Le.h) && (U = Le, Z = true), (Y !== pe.canvasWidth || j !== pe.canvasHeight) && (Y = pe.canvasWidth, j = pe.canvasHeight, Z = true), q !== Ke && (q = Ke, Z = true);
      const We = Be, mt = (We == null ? void 0 : We.xMin) ?? 0, ft = (We == null ? void 0 : We.xMax) ?? 1, ke = (We == null ? void 0 : We.yMin) ?? 0, ct = (We == null ? void 0 : We.yMax) ?? 1, { a: At, b: Vt } = es(le, mt, ft), { a: gt, b: _t } = es(ye, ke, ct);
      Sl(g, At, Vt, gt, _t), g[16] = pe.canvasWidth > 0 ? pe.canvasWidth : 1, g[17] = pe.canvasHeight > 0 ? pe.canvasHeight : 1, g[18] = 0, g[19] = 0, u[20] = Le.x >>> 0, u[21] = Le.y >>> 0, u[22] = Le.w >>> 0, u[23] = Le.h >>> 0, u[24] = ve >>> 0, u[25] = Te >>> 0, u[26] = Xe >>> 0, u[27] = (Math.max(0, te) | 0) >>> 0, u[28] = (Math.max(0, be) | 0) >>> 0, u[29] = Ke >>> 0, ut(e, f, l), M[0] = Le.x >>> 0, M[1] = Le.y >>> 0, M[2] = Le.w >>> 0, M[3] = Le.h >>> 0, M[4] = ve >>> 0, M[5] = Te >>> 0, M[6] = Xe >>> 0, M[7] = Ke >>> 0, ut(e, y, p), X();
    }, encodeCompute: (K) => {
      if (W(), !J || !Z) return;
      if (!m || !x || !C || F <= 0) {
        Z = false;
        return;
      }
      if (!U || U.w <= 0 || U.h <= 0) {
        Z = false;
        return;
      }
      e.queue.writeBuffer(m, 0, re.buffer, 0, w * 4), e.queue.writeBuffer(x, 0, Rl);
      const ae = E * z | 0, ee = Math.max(0, P - S | 0), te = K.beginComputePass({ label: "scatterDensity/computePass" });
      te.setBindGroup(0, C), te.setPipeline(T);
      const be = 256, le = Math.ceil(ee / be);
      le > 0 && te.dispatchWorkgroups(le), te.setPipeline(A);
      const ye = Math.ceil(ae / be);
      ye > 0 && te.dispatchWorkgroups(ye), te.end(), Z = false;
    }, render: (K) => {
      W(), J && (!d || !U || !I || U.w <= 0 || U.h <= 0 || (K.setScissorRect(U.x, U.y, U.w, U.h), K.setPipeline(b), K.setBindGroup(0, d), K.draw(3), Y > 0 && j > 0 && K.setScissorRect(0, 0, Y, j)));
    }, dispose: () => {
      if (!n) {
        n = true;
        try {
          f.destroy();
        } catch {
        }
        try {
          y.destroy();
        } catch {
        }
        if (m)
          try {
            m.destroy();
          } catch {
          }
        if (x)
          try {
            x.destroy();
          } catch {
          }
        if (m = null, x = null, w = 0, v)
          try {
            v.destroy();
          } catch {
          }
        v = null, I = null, C = null, d = null, h = null;
      }
    }
  };
}
const ns = `// pie.wgsl
// Instanced anti-aliased pie-slice shader (instanced quad + SDF mask).
//
// - Per-instance vertex input:
//   - center        = vec2<f32> slice center (transformed by VSUniforms.transform)
//   - startAngleRad = f32 start angle in radians
//   - endAngleRad   = f32 end angle in radians
//   - radiiPx       = vec2<f32>(innerRadiusPx, outerRadiusPx) in *device pixels*
//   - color         = vec4<f32> RGBA color in [0..1]
//
// - Draw call: draw(6, instanceCount) using triangle-list expansion in VS
//
// - Uniforms:
//   - @group(0) @binding(0): VSUniforms { transform, viewportPx }
//
// Notes:
// - The quad is expanded in clip space using \`radiusPx\` and \`viewportPx\`.
// - Fragment uses an SDF mask for the circle boundary + an angular wedge mask.
// - Fully outside fragments are discarded to avoid unnecessary blending work.
//
// Conventions: matches other shaders in this repo (vsMain/fsMain, group 0 bindings,
// and explicit uniform padding/alignment where needed).

const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586; // 2*pi

struct VSUniforms {
  transform: mat4x4<f32>,
  viewportPx: vec2<f32>,
  // Pad to 16-byte alignment (mat4x4 is 64B; vec2 adds 8B; pad to 80B).
  _pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct VSIn {
  @location(0) center: vec2<f32>,
  @location(1) startAngleRad: f32,
  @location(2) endAngleRad: f32,
  @location(3) radiiPx: vec2<f32>, // (innerPx, outerPx)
  @location(4) color: vec4<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) localPx: vec2<f32>,
  @location(1) startAngleRad: f32,
  @location(2) endAngleRad: f32,
  @location(3) radiiPx: vec2<f32>,
  @location(4) color: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Fixed local corners for 2 triangles (triangle-list).
  // \`localNdc\` is a quad in [-1, 1]^2; we convert it to pixel offsets via radiusPx.
  let localNdc = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  let corner = localNdc[vertexIndex];
  let outerPx = in.radiiPx.y;
  let localPx = corner * outerPx;

  // Convert pixel offset to clip-space offset.
  // Clip space spans [-1, 1] across the viewport, so px -> clip is (2 / viewportPx).
  let localClip = localPx * (2.0 / vsUniforms.viewportPx);

  let centerClip = (vsUniforms.transform * vec4<f32>(in.center, 0.0, 1.0)).xy;

  var out: VSOut;
  out.clipPosition = vec4<f32>(centerClip + localClip, 0.0, 1.0);
  out.localPx = localPx;
  out.startAngleRad = in.startAngleRad;
  out.endAngleRad = in.endAngleRad;
  out.radiiPx = in.radiiPx;
  out.color = in.color;
  return out;
}

fn wrapToTau(theta: f32) -> f32 {
  // Maps theta to [0, TAU). (Input often comes from atan2 in [-PI, PI].)
  return select(theta, theta + TAU, theta < 0.0);
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  let p = in.localPx;
  let r = length(p);

  let innerPx = in.radiiPx.x;
  let outerPx = in.radiiPx.y;

  // --- Radial mask: ring between inner and outer radii (inner==0 => pie) ---
  // Positive inside the ring, negative outside.
  let radialDist = min(r - innerPx, outerPx - r);
  let radialW = fwidth(radialDist);
  let radialA = smoothstep(-radialW, radialW, radialDist);

  if (radialA <= 0.0) {
    discard;
  }

  // Compute fragment angle in [0, TAU).
  let angle = wrapToTau(atan2(p.y, p.x));

  // --- Angular mask: wedge between start/end angles with wrap ---
  let start = in.startAngleRad;
  let end = in.endAngleRad;

  // Compute span in [0, 2π) with wrap.
  var span = end - start;
  span = span + select(0.0, TAU, span < 0.0);

  // Compute rel in [0, 2π) with wrap.
  var rel = angle - start;
  rel = rel + select(0.0, TAU, rel < 0.0);

  let inside = rel <= span;

  // Signed angular distance (in radians) to nearest boundary.
  // - Inside: +min(rel, span-rel)
  // - Outside: -min(rel-span, 2π-rel)
  let dIn = min(rel, max(span - rel, 0.0));
  let dOutA = max(rel - span, 0.0);
  let dOutB = max(TAU - rel, 0.0);
  let dOut = min(dOutA, dOutB);

  let signedAngleDist = select(-dOut, dIn, inside);

  // Convert to approximate pixel distance to the boundary ray.
  // (For small angles, perpendicular distance to a ray ≈ r * angle.)
  let angleDistPx = signedAngleDist * max(r, 1.0);

  let angW = fwidth(angleDistPx);
  let angularA = smoothstep(-angW, angW, angleDistPx);

  let aOut = radialA * angularA;
  if (aOut <= 0.0) {
    discard;
  }

  return vec4<f32>(in.color.rgb, in.color.a * aOut);
}

`, El = "bgra8unorm", er = 40, Er = er / 4, On = Math.PI * 2, is = (e) => Math.min(1, Math.max(0, e)), zi = (e, t, n) => Math.min(n, Math.max(t, e | 0)), rs = (e) => {
    if (!Number.isFinite(e) || e <= 0) return 1;
    const t = Math.ceil(e);
    return 2 ** Math.ceil(Math.log2(t));
  }, Br = (e) => {
    if (!Number.isFinite(e)) return 0;
    const t = e % On;
    return t < 0 ? t + On : t;
  }, Bl = (e, t) => {
    const n = yt(e);
    if (n) return [n[0], n[1], n[2], is(n[3])];
    const i = yt(t);
    return i ? [i[0], i[1], i[2], is(i[3])] : [0, 0, 0, 1];
  }, pi = (e, t) => {
    if (typeof e == "number") return Number.isFinite(e) ? e : null;
    if (typeof e != "string") return null;
    const n = e.trim();
    if (n.length === 0) return null;
    if (n.endsWith("%")) {
      const r = Number.parseFloat(n.slice(0, -1));
      return Number.isFinite(r) ? r / 100 * t : null;
    }
    const i = Number.parseFloat(n);
    return Number.isFinite(i) ? i : null;
  }, Ll = (e, t, n) => {
    const i = (e == null ? void 0 : e[0]) ?? "50%", r = (e == null ? void 0 : e[1]) ?? "50%", o = pi(i, t), s = pi(r, n);
    return {
      x: Number.isFinite(o) ? o : t * 0.5,
      y: Number.isFinite(s) ? s : n * 0.5
    };
  }, _l = (e) => Array.isArray(e), kl = (e, t) => {
    if (e == null) return { inner: 0, outer: t * 0.7 };
    if (_l(e)) {
      const r = pi(e[0], t), o = pi(e[1], t), s = Math.max(0, Number.isFinite(r) ? r : 0), a = Math.max(s, Number.isFinite(o) ? o : t * 0.7);
      return { inner: s, outer: Math.min(t, a) };
    }
    const n = pi(e, t), i = Math.max(0, Number.isFinite(n) ? n : t * 0.7);
    return { inner: 0, outer: Math.min(t, i) };
  }, Ul = (e) => {
    const { canvasWidth: t, canvasHeight: n, devicePixelRatio: i } = e, r = e.left * i, o = t - e.right * i, s = e.top * i, a = n - e.bottom * i, c = zi(Math.floor(r), 0, Math.max(0, t)), f = zi(Math.floor(s), 0, Math.max(0, n)), l = zi(Math.ceil(o), 0, Math.max(0, t)), g = zi(Math.ceil(a), 0, Math.max(0, n)), u = Math.max(0, l - c), y = Math.max(0, g - f);
    return { x: c, y: f, w: u, h: y };
  }, Gl = new Float32Array([
    1,
    0,
    0,
    0,
    // col0
    0,
    1,
    0,
    0,
    // col1
    0,
    0,
    1,
    0,
    // col2
    0,
    0,
    0,
    1
    // col3
  ]);
function zl(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? El, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }]
  }), c = dt(e, 80, { label: "pieRenderer/vsUniforms" }), f = new ArrayBuffer(80), l = new Float32Array(f), g = e.createBindGroup({
    layout: a,
    entries: [{ binding: 0, resource: { buffer: c } }]
  }), u = Lt(
    e,
    {
      label: "pieRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: ns,
        label: "pie.wgsl",
        buffers: [
          {
            arrayStride: er,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, format: "float32x2", offset: 0 },
              // center
              { shaderLocation: 1, format: "float32", offset: 8 },
              // startAngleRad
              { shaderLocation: 2, format: "float32", offset: 12 },
              // endAngleRad
              { shaderLocation: 3, format: "float32x2", offset: 16 },
              // radiiPx
              { shaderLocation: 4, format: "float32x4", offset: 24 }
              // color
            ]
          }
        ]
      },
      fragment: {
        code: ns,
        label: "pie.wgsl",
        formats: i,
        // Standard alpha blending for AA edges and translucent slice colors.
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let y = null, p = 0, M = new ArrayBuffer(0), R = new Float32Array(M), D = 0, T = 0, A = null;
  const b = () => {
    if (n) throw new Error("PieRenderer is disposed.");
  }, m = (N) => {
    if (N <= R.length) return;
    const C = Math.max(8, rs(N));
    M = new ArrayBuffer(C * 4), R = new Float32Array(M);
  }, x = (N, C) => {
    const d = Number.isFinite(N) && N > 0 ? N : 1, h = Number.isFinite(C) && C > 0 ? C : 1;
    l.set(Gl, 0), l[16] = d, l[17] = h, l[18] = 0, l[19] = 0, ut(e, c, f);
  };
  return {
    prepare: (N, C) => {
      b();
      const d = C.devicePixelRatio, h = d > 0 && Number.isFinite(d) ? d : 1;
      D = C.canvasWidth, T = C.canvasHeight, x(C.canvasWidth, C.canvasHeight), A = Ul(C);
      const F = C.canvasWidth / h, S = C.canvasHeight / h;
      if (!(F > 0) || !(S > 0)) {
        p = 0;
        return;
      }
      const P = F - C.left - C.right, B = S - C.top - C.bottom;
      if (!(P > 0) || !(B > 0)) {
        p = 0;
        return;
      }
      const E = 0.5 * Math.min(P, B);
      if (!(E > 0)) {
        p = 0;
        return;
      }
      const z = Ll(N.center, P, B), U = C.left + z.x, Y = C.top + z.y, j = U / F * 2 - 1, q = 1 - Y / S * 2;
      if (!Number.isFinite(j) || !Number.isFinite(q)) {
        p = 0;
        return;
      }
      const Z = kl(N.radius, E), J = Math.max(0, Math.min(Z.inner, Z.outer)), re = Math.max(J, Z.outer), W = J * h, de = re * h;
      if (!(de > 0)) {
        p = 0;
        return;
      }
      let L = 0, X = 0;
      for (let te = 0; te < N.data.length; te++) {
        const be = N.data[te], le = be == null ? void 0 : be.value;
        typeof le == "number" && Number.isFinite(le) && le > 0 && be.visible !== false && (L += le, X++);
      }
      if (!(L > 0) || X === 0) {
        p = 0;
        return;
      }
      m(X * Er);
      const $ = R, ue = typeof N.startAngle == "number" && Number.isFinite(N.startAngle) ? N.startAngle : 90;
      let ce = Br(ue * Math.PI / 180), fe = 0, K = 0, ae = 0;
      for (let te = 0; te < N.data.length; te++) {
        const be = N.data[te], le = be == null ? void 0 : be.value;
        if (typeof le != "number" || !Number.isFinite(le) || le <= 0 || be.visible === false) continue;
        ae++;
        const ye = ae === X;
        let Be = le / L * On;
        if (ye ? Be = Math.max(0, On - fe) : Be = Math.max(0, Math.min(On, Be)), fe += Be, !(Be > 0)) continue;
        const Le = ce, rt = X === 1 ? ce + On : Br(ce + Be);
        ce = Br(ce + Be);
        const [ot, ve, Te, Xe] = Bl(be.color, N.color);
        $[K + 0] = j, $[K + 1] = q, $[K + 2] = Le, $[K + 3] = rt, $[K + 4] = W, $[K + 5] = de, $[K + 6] = ot, $[K + 7] = ve, $[K + 8] = Te, $[K + 9] = Xe, K += Er;
      }
      p = K / Er;
      const ee = Math.max(4, p * er);
      if (!y || y.size < ee) {
        const te = Math.max(Math.max(4, rs(ee)), y ? y.size : 0);
        if (y)
          try {
            y.destroy();
          } catch {
          }
        y = e.createBuffer({
          label: "pieRenderer/instanceBuffer",
          size: te,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      y && p > 0 && e.queue.writeBuffer(y, 0, M, 0, p * er);
    }, render: (N) => {
      b(), !(!y || p === 0) && (A && D > 0 && T > 0 && N.setScissorRect(A.x, A.y, A.w, A.h), N.setPipeline(u), N.setBindGroup(0, g), N.setVertexBuffer(0, y), N.draw(6, p), A && D > 0 && T > 0 && N.setScissorRect(0, 0, D, T));
    }, dispose: () => {
      if (!n) {
        if (n = true, y)
          try {
            y.destroy();
          } catch {
          }
        y = null, p = 0;
        try {
          c.destroy();
        } catch {
        }
        D = 0, T = 0, A = null;
      }
    }
  };
}
const os = `// candlestick.wgsl
// Instanced candlestick shader (bodies + wicks):
// - Per-instance vertex input:
//   - xClip, openClip, closeClip, lowClip, highClip, bodyWidthClip (6 floats)
//   - bodyColor rgba (4 floats)
// - Draw call: draw(18, instanceCount) using triangle-list expansion in VS
//   - vertices 0-5: body quad (2 triangles)
//   - vertices 6-11: upper wick (2 triangles)
//   - vertices 12-17: lower wick (2 triangles)
// - Uniforms:
//   - @group(0) @binding(0): VSUniforms { transform, wickWidthClip }

struct VSUniforms {
  transform: mat4x4<f32>,
  wickWidthClip: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct VSIn {
  @location(0) xClip: f32,
  @location(1) openClip: f32,
  @location(2) closeClip: f32,
  @location(3) lowClip: f32,
  @location(4) highClip: f32,
  @location(5) bodyWidthClip: f32,
  @location(6) bodyColor: vec4<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Compute body bounds
  let bodyTop = max(in.openClip, in.closeClip);
  let bodyBottom = min(in.openClip, in.closeClip);
  let bodyLeft = in.xClip - in.bodyWidthClip * 0.5;
  let bodyRight = in.xClip + in.bodyWidthClip * 0.5;

  // Wick bounds
  let wickLeft = in.xClip - vsUniforms.wickWidthClip * 0.5;
  let wickRight = in.xClip + vsUniforms.wickWidthClip * 0.5;

  var pos: vec2<f32>;

  if (vertexIndex < 6u) {
    // Body quad (vertices 0-5)
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 0.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(1.0, 1.0)
    );
    let corner = corners[vertexIndex];
    let bodyMin = vec2<f32>(bodyLeft, bodyBottom);
    let bodyMax = vec2<f32>(bodyRight, bodyTop);
    pos = bodyMin + corner * (bodyMax - bodyMin);
  } else if (vertexIndex < 12u) {
    // Upper wick (vertices 6-11): from bodyTop to highClip
    let idx = vertexIndex - 6u;
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 0.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(1.0, 1.0)
    );
    let corner = corners[idx];
    let wickMin = vec2<f32>(wickLeft, bodyTop);
    let wickMax = vec2<f32>(wickRight, in.highClip);
    pos = wickMin + corner * (wickMax - wickMin);
  } else {
    // Lower wick (vertices 12-17): from lowClip to bodyBottom
    let idx = vertexIndex - 12u;
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 0.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(1.0, 1.0)
    );
    let corner = corners[idx];
    let wickMin = vec2<f32>(wickLeft, in.lowClip);
    let wickMax = vec2<f32>(wickRight, bodyBottom);
    pos = wickMin + corner * (wickMax - wickMin);
  }

  var out: VSOut;
  out.clipPosition = vsUniforms.transform * vec4<f32>(pos, 0.0, 1.0);
  out.color = in.bodyColor;
  return out;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
`, Vl = "bgra8unorm", Wl = 1, zn = 40, Nn = zn / 4, Ol = (e) => Math.min(1, Math.max(0, e)), Vi = (e, t, n) => Math.min(n, Math.max(t, e | 0)), fi = (e) => yt(e) ?? [0, 0, 0, 1], Wi = (e) => {
    if (!Number.isFinite(e) || e <= 0) return 1;
    const t = Math.ceil(e);
    return 2 ** Math.ceil(Math.log2(t));
  }, Xl = (e) => {
    const t = e.trim().match(/^(\d+(?:\.\d+)?)%$/);
    if (!t) return null;
    const n = Number(t[1]) / 100;
    return Number.isFinite(n) ? n : null;
  }, $l = (e) => Array.isArray(e), sa = (e) => $l(e) ? { timestamp: e[0], open: e[1], close: e[2], low: e[3], high: e[4] } : { timestamp: e.timestamp, open: e.open, close: e.close, low: e.low, high: e.high }, Yl = (e) => {
    const t = e.devicePixelRatio;
    if (!(t > 0)) return null;
    const n = e.canvasWidth / t, i = e.canvasHeight / t, r = n - e.left - e.right, o = i - e.top - e.bottom;
    return !(r > 0) || !(o > 0) ? null : { plotWidthCss: r, plotHeightCss: o };
  }, Hl = (e) => {
    const { left: t, right: n, top: i, bottom: r, canvasWidth: o, canvasHeight: s, devicePixelRatio: a } = e, c = t * a, f = o - n * a, l = i * a, g = s - r * a, u = c / o * 2 - 1, y = f / o * 2 - 1, p = 1 - l / s * 2, M = 1 - g / s * 2;
    return {
      left: u,
      right: y,
      top: p,
      bottom: M,
      width: y - u,
      height: p - M
    };
  }, ql = (e) => {
    const { canvasWidth: t, canvasHeight: n, devicePixelRatio: i } = e, r = e.left * i, o = t - e.right * i, s = e.top * i, a = n - e.bottom * i, c = Vi(Math.floor(r), 0, Math.max(0, t)), f = Vi(Math.floor(s), 0, Math.max(0, n)), l = Vi(Math.ceil(o), 0, Math.max(0, t)), g = Vi(Math.ceil(a), 0, Math.max(0, n)), u = Math.max(0, l - c), y = Math.max(0, g - f);
    return { x: c, y: f, w: u, h: y };
  }, Zl = (e) => {
    const t = [];
    for (let i = 0; i < e.length; i++) {
      const { timestamp: r } = sa(e[i]);
      Number.isFinite(r) && t.push(r);
    }
    if (t.length < 2) return 1;
    t.sort((i, r) => i - r);
    let n = Number.POSITIVE_INFINITY;
    for (let i = 1; i < t.length; i++) {
      const r = t[i] - t[i - 1];
      r > 0 && r < n && (n = r);
    }
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, jl = (e, t, n, i) => {
    if (Number.isFinite(t) && t > 0) {
      const a = e.scale(0), c = e.scale(0 + t), f = Math.abs(c - a);
      if (Number.isFinite(f) && f > 0) return f;
    }
    const r = Math.abs(n.width);
    if (!(r > 0)) return 0;
    const o = Math.max(1, Math.floor(i));
    return r / o;
  }, Kl = () => {
    const e = new ArrayBuffer(64);
    return new Float32Array(e).set([
      1,
      0,
      0,
      0,
      // col0
      0,
      1,
      0,
      0,
      // col1
      0,
      0,
      1,
      0,
      // col2
      0,
      0,
      0,
      1
      // col3
    ]), e;
  };
function Jl(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? Vl, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }]
  }), c = dt(e, 80, { label: "candlestickRenderer/vsUniforms" });
  ut(e, c, Kl());
  const f = new ArrayBuffer(80), l = new Float32Array(f), g = e.createBindGroup({
    layout: a,
    entries: [{ binding: 0, resource: { buffer: c } }]
  }), u = Lt(
    e,
    {
      label: "candlestickRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: os,
        label: "candlestick.wgsl",
        buffers: [
          {
            arrayStride: zn,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, format: "float32", offset: 0 },
              { shaderLocation: 1, format: "float32", offset: 4 },
              { shaderLocation: 2, format: "float32", offset: 8 },
              { shaderLocation: 3, format: "float32", offset: 12 },
              { shaderLocation: 4, format: "float32", offset: 16 },
              { shaderLocation: 5, format: "float32", offset: 20 },
              { shaderLocation: 6, format: "float32x4", offset: 24 }
            ]
          }
        ]
      },
      fragment: {
        code: os,
        label: "candlestick.wgsl",
        formats: i,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let y = null, p = 0, M = new ArrayBuffer(0), R = new Float32Array(M), D = 0, T = 0, A = null, b = false, m = null, x = 0, w = new ArrayBuffer(0), v = new Float32Array(w);
  const I = () => {
    if (n) throw new Error("CandlestickRenderer is disposed.");
  }, N = (S) => {
    if (S <= R.length) return;
    const P = Math.max(8, Wi(S));
    M = new ArrayBuffer(P * 4), R = new Float32Array(M);
  }, C = (S) => {
    if (S <= v.length) return;
    const P = Math.max(8, Wi(S));
    w = new ArrayBuffer(P * 4), v = new Float32Array(w);
  };
  return {
    prepare: (S, P, B, E, z, U) => {
      if (I(), P.length === 0) {
        p = 0, x = 0;
        return;
      }
      const Y = Yl(z);
      if (!Y) {
        p = 0, x = 0;
        return;
      }
      const j = Hl(z), q = Y.plotWidthCss > 0 ? j.width / Y.plotWidthCss : 0;
      D = z.canvasWidth, T = z.canvasHeight, A = ql(z);
      const Z = Zl(P), J = jl(B, Z, j, P.length);
      let re = 0;
      const W = S.barWidth;
      if (typeof W == "number")
        re = Math.max(0, W) * q;
      else if (typeof W == "string") {
        const pe = Xl(W);
        re = pe == null ? 0 : J * Ol(pe);
      }
      const de = S.barMinWidth * q, L = S.barMaxWidth * q;
      re = Math.min(Math.max(re, de), L);
      const X = S.itemStyle.borderWidth ?? Wl, $ = Math.max(0, X) * q;
      l.set([
        1,
        0,
        0,
        0,
        // col0
        0,
        1,
        0,
        0,
        // col1
        0,
        0,
        1,
        0,
        // col2
        0,
        0,
        0,
        1,
        // col3
        $,
        0,
        0,
        0
      ]), ut(e, c, f);
      const ue = fi(S.itemStyle.upColor), ce = fi(S.itemStyle.downColor), fe = fi(S.itemStyle.upBorderColor), K = fi(S.itemStyle.downBorderColor), ae = U ? fi(U) : [0, 0, 0, 1];
      b = S.style === "hollow", N(P.length * Nn);
      const ee = R;
      let te = 0;
      b && C(P.length * Nn);
      const be = v;
      let le = 0;
      for (let pe = 0; pe < P.length; pe++) {
        const { timestamp: Be, open: Le, close: rt, low: ot, high: ve } = sa(P[pe]);
        if (!Number.isFinite(Be) || !Number.isFinite(Le) || !Number.isFinite(rt) || !Number.isFinite(ot) || !Number.isFinite(ve))
          continue;
        const Te = B.scale(Be), Xe = E.scale(Le), Ke = E.scale(rt), We = E.scale(ot), mt = E.scale(ve);
        if (!Number.isFinite(Te) || !Number.isFinite(Xe) || !Number.isFinite(Ke) || !Number.isFinite(We) || !Number.isFinite(mt))
          continue;
        const ft = rt > Le;
        if (b) {
          const ke = ft ? fe : K;
          if (ee[te + 0] = Te, ee[te + 1] = Xe, ee[te + 2] = Ke, ee[te + 3] = We, ee[te + 4] = mt, ee[te + 5] = re, ee[te + 6] = ke[0], ee[te + 7] = ke[1], ee[te + 8] = ke[2], ee[te + 9] = ke[3], te += Nn, ft) {
            const ct = S.itemStyle.borderWidth * q, At = Math.max(0, re - 2 * ct);
            be[le + 0] = Te, be[le + 1] = Xe, be[le + 2] = Ke, be[le + 3] = We, be[le + 4] = mt, be[le + 5] = At, be[le + 6] = ae[0], be[le + 7] = ae[1], be[le + 8] = ae[2], be[le + 9] = ae[3], le += Nn;
          }
        } else {
          const ke = ft ? ue : ce;
          ee[te + 0] = Te, ee[te + 1] = Xe, ee[te + 2] = Ke, ee[te + 3] = We, ee[te + 4] = mt, ee[te + 5] = re, ee[te + 6] = ke[0], ee[te + 7] = ke[1], ee[te + 8] = ke[2], ee[te + 9] = ke[3], te += Nn;
        }
      }
      p = te / Nn, x = le / Nn;
      const ye = Math.max(4, p * zn);
      if (!y || y.size < ye) {
        const pe = Math.max(Math.max(4, Wi(ye)), y ? y.size : 0);
        if (y)
          try {
            y.destroy();
          } catch {
          }
        y = e.createBuffer({
          label: "candlestickRenderer/instanceBuffer",
          size: pe,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      if (p > 0 && e.queue.writeBuffer(y, 0, M, 0, p * zn), b && x > 0) {
        const pe = Math.max(4, x * zn);
        if (!m || m.size < pe) {
          const Be = Math.max(Math.max(4, Wi(pe)), m ? m.size : 0);
          if (m)
            try {
              m.destroy();
            } catch {
            }
          m = e.createBuffer({
            label: "candlestickRenderer/hollowInstanceBuffer",
            size: Be,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
          });
        }
        e.queue.writeBuffer(m, 0, w, 0, x * zn);
      }
    }, render: (S) => {
      I(), !(!y || p === 0) && (A && D > 0 && T > 0 && S.setScissorRect(A.x, A.y, A.w, A.h), S.setPipeline(u), S.setBindGroup(0, g), S.setVertexBuffer(0, y), S.draw(18, p), b && m && x > 0 && (S.setVertexBuffer(0, m), S.draw(6, x)), A && D > 0 && T > 0 && S.setScissorRect(0, 0, D, T));
    }, dispose: () => {
      if (!n) {
        if (n = true, y)
          try {
            y.destroy();
          } catch {
          }
        if (y = null, p = 0, m)
          try {
            m.destroy();
          } catch {
          }
        m = null, x = 0;
        try {
          c.destroy();
        } catch {
        }
        D = 0, T = 0, A = null;
      }
    }
  };
}
const ss = `// bar.wgsl
// Instanced bar/rect shader:
// - Per-instance vertex input:
//   - rect  = vec4<f32>(x, y, width, height) in CLIP space
//   - color = vec4<f32>(r, g, b, a) in [0..1]
// - Draw call: draw(6, instanceCount) using triangle-list expansion in VS
// - Uniforms:
//   - @group(0) @binding(0): VSUniforms { transform }

struct VSUniforms {
  transform: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct VSIn {
  // rect.xy = origin, rect.zw = size (width, height)
  @location(0) rect: vec4<f32>,
  @location(1) color: vec4<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Fixed local corners for 2 triangles (triangle-list).
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0)
  );

  // Normalize negative width/height by computing min/max extents.
  let p0 = in.rect.xy;
  let p1 = in.rect.xy + in.rect.zw;
  let rectMin = min(p0, p1);
  let rectMax = max(p0, p1);
  let rectSize = rectMax - rectMin;

  let corner = corners[vertexIndex];
  let pos = rectMin + corner * rectSize;

  var out: VSOut;
  out.clipPosition = vsUniforms.transform * vec4<f32>(pos, 0.0, 1.0);
  out.color = in.color;
  return out;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}

`, Ql = "bgra8unorm", eu = 0.01, tu = 0.2, tr = 32, Lr = tr / 4, _r = (e) => Math.min(1, Math.max(0, e)), nu = (e) => yt(e) ?? [0, 0, 0, 1], as = (e) => {
    if (!Number.isFinite(e) || e <= 0) return 1;
    const t = Math.ceil(e);
    return 2 ** Math.ceil(Math.log2(t));
  }, iu = () => {
    const e = new ArrayBuffer(64);
    return new Float32Array(e).set([
      1,
      0,
      0,
      0,
      // col0
      0,
      1,
      0,
      0,
      // col1
      0,
      0,
      1,
      0,
      // col2
      0,
      0,
      0,
      1
      // col3
    ]), e;
  }, ru = (e) => {
    const t = e.trim().match(/^(\d+(?:\.\d+)?)%$/);
    if (!t) return null;
    const n = Number(t[1]) / 100;
    return Number.isFinite(n) ? n : null;
  }, cs = (e) => {
    if (typeof e != "string") return "";
    const t = e.trim();
    return t.length > 0 ? t : "";
  }, ou = (e) => {
    const t = e.devicePixelRatio;
    if (!(t > 0)) return null;
    const n = e.canvasWidth / t, i = e.canvasHeight / t, r = n - e.left - e.right, o = i - e.top - e.bottom;
    return !(r > 0) || !(o > 0) ? null : { plotWidthCss: r, plotHeightCss: o };
  }, su = (e) => {
    const { left: t, right: n, top: i, bottom: r, canvasWidth: o, canvasHeight: s, devicePixelRatio: a } = e, c = t * a, f = o - n * a, l = i * a, g = s - r * a, u = c / o * 2 - 1, y = f / o * 2 - 1, p = 1 - l / s * 2, M = 1 - g / s * 2;
    return { left: u, right: y, top: p, bottom: M };
  }, au = (e, t, n, i) => {
    if (Number.isFinite(t) && t > 0) {
      const a = e.scale(0), c = e.scale(0 + t), f = Math.abs(c - a);
      if (Number.isFinite(f) && f > 0) return f;
    }
    const r = Math.abs(n.right - n.left);
    if (!(r > 0)) return 0;
    const o = Math.max(1, Math.floor(i));
    return r / o;
  };
function cu(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? Ql, r = t == null ? void 0 : t.sampleCount, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }
    ]
  }), c = dt(e, 64, { label: "barRenderer/vsUniforms" });
  ut(e, c, iu());
  const f = e.createBindGroup({
    layout: a,
    entries: [
      { binding: 0, resource: { buffer: c } }
    ]
  }), l = Lt(
    e,
    {
      label: "barRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: ss,
        label: "bar.wgsl",
        buffers: [
          {
            arrayStride: tr,
            // rect vec4 + color vec4
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, format: "float32x4", offset: 0 },
              { shaderLocation: 1, format: "float32x4", offset: 16 }
            ]
          }
        ]
      },
      fragment: {
        code: ss,
        label: "bar.wgsl",
        formats: i,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let g = null, u = 0, y = new ArrayBuffer(0), p = new Float32Array(y);
  const M = [], R = () => {
    if (n) throw new Error("BarRenderer is disposed.");
  }, D = (I) => {
    if (I <= p.length) return;
    const N = Math.max(8, as(I));
    y = new ArrayBuffer(N * 4), p = new Float32Array(y);
  }, T = (I) => {
    M.length = 0;
    for (let C = 0; C < I.length; C++) {
      const d = I[C].data, h = Ne(d);
      for (let F = 0; F < h; F++) {
        const S = Fe(d, F);
        Number.isFinite(S) && M.push(S);
      }
    }
    if (M.length < 2) return 1;
    M.sort((C, d) => C - d);
    let N = Number.POSITIVE_INFINITY;
    for (let C = 1; C < M.length; C++) {
      const d = M[C] - M[C - 1];
      d > 0 && d < N && (N = d);
    }
    return Number.isFinite(N) && N > 0 ? N : 1;
  }, A = (I) => {
    let N, C, d;
    for (let h = 0; h < I.length; h++) {
      const F = I[h];
      N === void 0 && F.barWidth !== void 0 && (N = F.barWidth), C === void 0 && F.barGap !== void 0 && (C = F.barGap), d === void 0 && F.barCategoryGap !== void 0 && (d = F.barCategoryGap);
    }
    return { barWidth: N, barGap: C, barCategoryGap: d };
  }, b = (I) => {
    let N = Number.POSITIVE_INFINITY, C = Number.NEGATIVE_INFINITY;
    for (let d = 0; d < I.length; d++) {
      const h = I[d].data, F = Ne(h);
      for (let S = 0; S < F; S++) {
        const P = _e(h, S);
        Number.isFinite(P) && (P < N && (N = P), P > C && (C = P));
      }
    }
    return !Number.isFinite(N) || !Number.isFinite(C) || N <= 0 && 0 <= C ? 0 : Math.abs(N) < Math.abs(C) ? N : C;
  }, m = (I, N, C) => {
    const d = N.invert(C.bottom), h = N.invert(C.top), F = Math.min(d, h), S = Math.max(d, h);
    return !Number.isFinite(F) || !Number.isFinite(S) ? b(I) : F <= 0 && 0 <= S ? 0 : F > 0 ? F : S < 0 ? S : b(I);
  };
  return {
    prepare: (I, N, C, d, h) => {
      if (R(), I.length === 0) {
        u = 0;
        return;
      }
      const F = ou(h);
      if (!F) {
        u = 0;
        return;
      }
      const S = su(h), P = S.right - S.left, B = F.plotWidthCss > 0 ? P / F.plotWidthCss : 0, E = /* @__PURE__ */ new Map(), z = new Array(I.length);
      let U = 0;
      for (let ye = 0; ye < I.length; ye++) {
        const pe = cs(I[ye].stack);
        if (pe !== "") {
          const Be = E.get(pe);
          if (Be !== void 0)
            z[ye] = Be;
          else {
            const Le = U++;
            E.set(pe, Le), z[ye] = Le;
          }
        } else
          z[ye] = U++;
      }
      U = Math.max(1, U);
      const Y = T(I), j = A(I), q = _r(j.barGap ?? eu), Z = _r(j.barCategoryGap ?? tu);
      let J = 1;
      for (let ye = 0; ye < I.length; ye++) {
        const pe = Ne(I[ye].data);
        J = Math.max(J, Math.floor(pe));
      }
      const re = au(C, Y, S, J), W = Math.max(0, re * (1 - Z)), de = U + Math.max(0, U - 1) * q, L = de > 0 ? W / de : 0;
      let X = 0;
      const $ = j.barWidth;
      if (typeof $ == "number")
        X = Math.max(0, $) * B, X = Math.min(X, L);
      else if (typeof $ == "string") {
        const ye = ru($);
        X = ye == null ? 0 : L * _r(ye);
      }
      X > 0 || (X = L);
      const ue = X * q, ce = U * X + Math.max(0, U - 1) * ue;
      let fe = m(I, d, S), K = d.scale(fe);
      if (!Number.isFinite(K)) {
        const ye = b(I);
        if (fe = ye, K = d.scale(ye), Number.isFinite(K) || (fe = 0, K = d.scale(0)), !Number.isFinite(K)) {
          u = 0;
          return;
        }
      }
      let ae = 0;
      for (let ye = 0; ye < I.length; ye++)
        ae += Math.max(0, Ne(I[ye].data));
      D(ae * Lr);
      const ee = p;
      let te = 0;
      const be = /* @__PURE__ */ new Map();
      for (let ye = 0; ye < I.length; ye++) {
        const pe = I[ye], Be = pe.data, [Le, rt, ot, ve] = nu(pe.color), Te = cs(pe.stack), Xe = z[ye] ?? 0, Ke = Ne(Be);
        for (let We = 0; We < Ke; We++) {
          const mt = Fe(Be, We), ft = _e(Be, We), ke = C.scale(mt);
          if (!Number.isFinite(ke) || !Number.isFinite(ft)) continue;
          const ct = ke - ce / 2 + Xe * (X + ue);
          let At = K, Vt = 0;
          if (Te !== "") {
            let gt = be.get(Te);
            gt || (gt = /* @__PURE__ */ new Map(), be.set(Te, gt));
            let _t;
            Number.isFinite(re) && re > 0 && Number.isFinite(ke) ? _t = Math.round((ke - S.left) / re) : Number.isFinite(Y) && Y > 0 ? _t = Math.round(mt / Y) : _t = Math.round(mt * 1e6);
            let Wt = gt.get(_t);
            Wt || (Wt = { posSum: fe, negSum: fe }, gt.set(_t, Wt));
            let kt, vt;
            ft >= 0 ? (kt = Wt.posSum, vt = kt + ft, Wt.posSum = vt) : (kt = Wt.negSum, vt = kt + ft, Wt.negSum = vt);
            const Jt = d.scale(kt), Et = d.scale(vt);
            if (!Number.isFinite(Jt) || !Number.isFinite(Et)) continue;
            At = Jt, Vt = Et - Jt;
          } else {
            const gt = d.scale(ft);
            if (!Number.isFinite(gt)) continue;
            Vt = gt - K;
          }
          ee[te + 0] = ct, ee[te + 1] = At, ee[te + 2] = X, ee[te + 3] = Vt, ee[te + 4] = Le, ee[te + 5] = rt, ee[te + 6] = ot, ee[te + 7] = ve, te += Lr;
        }
      }
      u = te / Lr;
      const le = Math.max(4, u * tr);
      if (!g || g.size < le) {
        const ye = Math.max(Math.max(4, as(le)), g ? g.size : 0);
        if (g)
          try {
            g.destroy();
          } catch {
          }
        g = e.createBuffer({
          label: "barRenderer/instanceBuffer",
          size: ye,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      u > 0 && e.queue.writeBuffer(g, 0, y, 0, u * tr);
    }, render: (I) => {
      R(), !(!g || u === 0) && (I.setPipeline(l), I.setBindGroup(0, f), I.setVertexBuffer(0, g), I.draw(6, u));
    }, dispose: () => {
      if (!n) {
        if (n = true, g)
          try {
            g.destroy();
          } catch {
          }
        g = null, u = 0;
        try {
          c.destroy();
        } catch {
        }
      }
    }
  };
}
function lu(e) {
  const { device: t, targetFormat: n, pipelineCache: i, sampleCount: r } = e, o = [], s = [], a = [], c = [], f = [], l = [], g = cu(t, { targetFormat: n, pipelineCache: i, sampleCount: r });
  function u(m) {
    for (; o.length > m;) {
      const x = o.pop();
      x == null || x.dispose();
    }
    for (; o.length < m;)
      o.push(ll(t, { targetFormat: n, pipelineCache: i, sampleCount: r }));
  }
  function y(m) {
    for (; s.length > m;) {
      const x = s.pop();
      x == null || x.dispose();
    }
    for (; s.length < m;)
      s.push(pl(t, { targetFormat: n, pipelineCache: i, sampleCount: r }));
  }
  function p(m) {
    for (; a.length > m;) {
      const x = a.pop();
      x == null || x.dispose();
    }
    for (; a.length < m;)
      a.push(vl(t, { targetFormat: n, pipelineCache: i, sampleCount: r }));
  }
  function M(m) {
    for (; c.length > m;) {
      const x = c.pop();
      x == null || x.dispose();
    }
    for (; c.length < m;)
      c.push(Dl(t, { targetFormat: n, pipelineCache: i, sampleCount: r }));
  }
  function R(m) {
    for (; f.length > m;) {
      const x = f.pop();
      x == null || x.dispose();
    }
    for (; f.length < m;)
      f.push(zl(t, { targetFormat: n, pipelineCache: i, sampleCount: r }));
  }
  function D(m) {
    for (; l.length > m;) {
      const x = l.pop();
      x == null || x.dispose();
    }
    for (; l.length < m;)
      l.push(Jl(t, { targetFormat: n, pipelineCache: i, sampleCount: r }));
  }
  let T = null;
  function A() {
    return T || (T = {
      areaRenderers: o,
      lineRenderers: s,
      scatterRenderers: a,
      scatterDensityRenderers: c,
      pieRenderers: f,
      candlestickRenderers: l,
      barRenderer: g
    }), T;
  }
  function b() {
    for (let m = 0; m < o.length; m++)
      o[m].dispose();
    o.length = 0;
    for (let m = 0; m < s.length; m++)
      s[m].dispose();
    s.length = 0;
    for (let m = 0; m < a.length; m++)
      a[m].dispose();
    a.length = 0;
    for (let m = 0; m < c.length; m++)
      c[m].dispose();
    c.length = 0;
    for (let m = 0; m < f.length; m++)
      f[m].dispose();
    f.length = 0;
    for (let m = 0; m < l.length; m++)
      l[m].dispose();
    l.length = 0, g.dispose();
  }
  return {
    ensureAreaRendererCount: u,
    ensureLineRendererCount: y,
    ensureScatterRendererCount: p,
    ensureScatterDensityRendererCount: M,
    ensurePieRendererCount: R,
    ensureCandlestickRendererCount: D,
    getState: A,
    dispose: b
  };
}
const Xn = 4, hi = 4, ls = `
struct VSOut { @builtin(position) pos: vec4f };

@vertex
fn vsMain(@builtin(vertex_index) i: u32) -> VSOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  var o: VSOut;
  o.pos = vec4f(positions[i], 0.0, 1.0);
  return o;
}

// Using textureLoad (no filtering) for pixel-exact blit into the MSAA overlay pass.
@group(0) @binding(0) var srcTex: texture_2d<f32>;

@fragment
fn fsMain(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let xy = vec2<i32>(pos.xy);
  return textureLoad(srcTex, xy, 0);
}
`;
function _n(e) {
  if (e)
    try {
      e.destroy();
    } catch {
    }
}
function uu(e) {
  const { device: t, targetFormat: n } = e, i = {
    mainColorTexture: null,
    mainColorView: null,
    mainResolveTexture: null,
    mainResolveView: null,
    overlayMsaaTexture: null,
    overlayMsaaView: null,
    overlayBlitBindGroup: null,
    overlayTargetsWidth: 0,
    overlayTargetsHeight: 0,
    overlayTargetsFormat: null
  }, r = t.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "float", viewDimension: "2d" }
    }]
  }), o = Lt(t, {
    label: "textureManager/overlayBlitPipeline",
    bindGroupLayouts: [r],
    vertex: { code: ls, label: "textureManager/overlayBlit.wgsl" },
    fragment: { code: ls, label: "textureManager/overlayBlit.wgsl", formats: n },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: hi }
  }, e.pipelineCache);
  function s(l, g) {
    const u = Number.isFinite(l) ? Math.max(1, Math.floor(l)) : 1, y = Number.isFinite(g) ? Math.max(1, Math.floor(g)) : 1;
    i.mainColorTexture && i.mainResolveTexture && i.overlayMsaaTexture && i.overlayBlitBindGroup && i.overlayTargetsWidth === u && i.overlayTargetsHeight === y && i.overlayTargetsFormat === n || (_n(i.mainColorTexture), _n(i.mainResolveTexture), _n(i.overlayMsaaTexture), i.mainColorTexture = t.createTexture({
      label: "textureManager/mainColorTexture",
      size: { width: u, height: y },
      sampleCount: Xn,
      format: n,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    }), i.mainColorView = i.mainColorTexture.createView(), i.mainResolveTexture = t.createTexture({
      label: "textureManager/mainResolveTexture",
      size: { width: u, height: y },
      format: n,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    }), i.mainResolveView = i.mainResolveTexture.createView(), i.overlayMsaaTexture = t.createTexture({
      label: "textureManager/annotationOverlayMsaaTexture",
      size: { width: u, height: y },
      sampleCount: hi,
      format: n,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    }), i.overlayMsaaView = i.overlayMsaaTexture.createView(), i.overlayBlitBindGroup = t.createBindGroup({
      label: "textureManager/overlayBlitBindGroup",
      layout: r,
      entries: [{ binding: 0, resource: i.mainResolveView }]
    }), i.overlayTargetsWidth = u, i.overlayTargetsHeight = y, i.overlayTargetsFormat = n, a = null);
  }
  let a = null;
  function c() {
    return a || (a = {
      mainColorView: i.mainColorView,
      mainResolveView: i.mainResolveView,
      overlayMsaaView: i.overlayMsaaView,
      overlayBlitBindGroup: i.overlayBlitBindGroup,
      overlayBlitPipeline: o,
      msaaSampleCount: hi,
      mainSceneMsaaSampleCount: Xn
    }), a;
  }
  function f() {
    _n(i.mainColorTexture), _n(i.mainResolveTexture), _n(i.overlayMsaaTexture), i.mainColorTexture = null, i.mainColorView = null, i.mainResolveTexture = null, i.mainResolveView = null, i.overlayMsaaTexture = null, i.overlayMsaaView = null, i.overlayBlitBindGroup = null, i.overlayTargetsWidth = 0, i.overlayTargetsHeight = 0, i.overlayTargetsFormat = null, a = null;
  }
  return {
    ensureTextures: s,
    getState: c,
    dispose: f
  };
}
const us = `// crosshair.wgsl
// Minimal crosshair line shader:
// - Vertex input: vec2<f32> position in clip-space coordinates
// - VS uniform: transform mat4 (identity)
// - FS uniform: solid RGBA color

struct VSUniforms {
  transform: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct FSUniforms {
  color: vec4<f32>,
};

@group(0) @binding(1) var<uniform> fsUniforms: FSUniforms;

struct VSIn {
  @location(0) position: vec2<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn) -> VSOut {
  var out: VSOut;
  out.clipPosition = vsUniforms.transform * vec4<f32>(in.position, 0.0, 1.0);
  return out;
}

@fragment
fn fsMain() -> @location(0) vec4<f32> {
  return fsUniforms.color;
}

`, fu = (e) => e + 3 & -4, du = 1024, mu = 128, pu = 16384, hu = (e) => {
    if (e.byteOffset & 3)
      throw new Error("createStreamBuffer.write: data.byteOffset must be 4-byte aligned.");
    return new Uint32Array(e.buffer, e.byteOffset, e.byteLength >>> 2);
  };
function yu(e, t) {
  if (!Number.isFinite(t) || t <= 0)
    throw new Error(`createStreamBuffer(maxSize): maxSize (bytes) must be a positive number. Received: ${String(t)}`);
  const n = Math.max(4, Math.floor(t)), i = fu(n), r = e.limits.maxBufferSize;
  if (i > r)
    throw new Error(
      `createStreamBuffer(maxSize): requested size ${i} bytes exceeds device.limits.maxBufferSize (${r}).`
    );
  const o = i >>> 2, s = (T) => ({
    buffer: e.createBuffer({
      label: T,
      size: i,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    }),
    mirror: new Uint32Array(o)
  }), a = [s("streamBuffer/a"), s("streamBuffer/b")];
  let c = false, f = 0, l = 0;
  const g = () => {
    if (c) throw new Error("createStreamBuffer: StreamBuffer is disposed.");
  }, u = (T, A, b) => {
    const m = a[T], x = m.mirror;
    if (b < 0 || b > A.length)
      throw new Error("createStreamBuffer.write: internal error (invalid usedWords).");
    if (b === 0) return;
    const w = b << 2;
    e.queue.writeBuffer(m.buffer, 0, A.buffer, A.byteOffset, w), x.set(A.subarray(0, b), 0);
  }, y = (T, A, b) => {
    const m = a[T], x = m.mirror;
    if (b < 0 || b > A.length)
      throw new Error("createStreamBuffer.write: internal error (invalid usedWords).");
    const w = b << 2;
    if (w > 0 && w <= du) {
      u(T, A, b);
      return;
    }
    const v = [];
    let I = 0, N = 0, C = 0;
    for (; C < b;) {
      for (; C < b && x[C] === A[C];) C++;
      if (C >= b) break;
      const d = C;
      for (C++; C < b && x[C] !== A[C];) C++;
      const h = C;
      if (v.push([d, h]), I++, N += h - d, I > mu || N > pu) {
        u(T, A, b);
        return;
      }
    }
    for (let d = 0; d < v.length; d++) {
      const [h, F] = v[d], S = h << 2, P = F - h << 2;
      e.queue.writeBuffer(m.buffer, S, A.buffer, A.byteOffset + S, P), x.set(A.subarray(h, F), h);
    }
  };
  return {
    write: (T) => {
      if (g(), T.length & 1)
        throw new Error("createStreamBuffer.write: data length must be even (vec2<f32> vertices).");
      const A = T.byteLength;
      if (A > i)
        throw new Error(
          `createStreamBuffer.write: data.byteLength (${A}) exceeds capacity (${i}). Increase maxSize.`
        );
      const b = T.length >>> 1;
      if (A === 0) {
        l = b;
        return;
      }
      const m = hu(T), x = 1 - f;
      y(x, m, m.length), f = x, l = b;
    }, getBuffer: () => (g(), a[f].buffer), getVertexCount: () => (g(), l), dispose: () => {
      if (!c) {
        c = true, l = 0;
        for (const T of a)
          try {
            T.buffer.destroy();
          } catch {
          }
      }
    }
  };
}
const gu = "bgra8unorm", xu = [1, 1, 1, 0.8], bu = 8, vu = 6, wu = 4, aa = 8192, Cu = () => {
  const e = new ArrayBuffer(64);
  return new Float32Array(e).set([
    1,
    0,
    0,
    0,
    // col0
    0,
    1,
    0,
    0,
    // col1
    0,
    0,
    1,
    0,
    // col2
    0,
    0,
    0,
    1
    // col3
  ]), e;
}, Mu = (e) => Number.isFinite(e.left) && Number.isFinite(e.right) && Number.isFinite(e.top) && Number.isFinite(e.bottom) && Number.isFinite(e.canvasWidth) && Number.isFinite(e.canvasHeight), Oi = (e, t, n) => Math.min(n, Math.max(t, e | 0)), Su = (e, t) => {
  if (!Number.isFinite(e) || e < 0)
    throw new Error("CrosshairRenderer.prepare: lineWidth must be a finite non-negative number.");
  if (e === 0) return [];
  const n = e * t, i = Math.max(1, Math.min(bu, Math.round(n))), r = (i - 1) / 2, o = [];
  for (let s = 0; s < i; s++) o.push(s - r);
  return o;
}, kn = (e, t) => e / t * 2 - 1, Un = (e, t) => 1 - e / t * 2, Xi = (e, t) => {
  e.push(t[0], t[1], t[2], t[3]);
}, fs = (e, t) => {
  if (!Number.isFinite(e) || !Number.isFinite(t)) return [];
  const n = Math.min(e, t), i = Math.max(e, t);
  if (i <= n) return [];
  const r = vu, s = r + wu;
  if (!Number.isFinite(s)) return [];
  const a = Math.ceil((i - n) / s);
  if (!Number.isFinite(a) || a <= 0) return [];
  const c = [];
  let f = n;
  for (; f < i;) {
    const l = f, g = Math.min(f + r, i);
    g > l && c.push([l, g]), f += s;
  }
  return c;
}, Fu = (e, t, n, i) => {
  if (!Number.isFinite(e) || !Number.isFinite(t))
    throw new Error("CrosshairRenderer.prepare: x and y must be finite numbers.");
  if (!Mu(n))
    throw new Error("CrosshairRenderer.prepare: gridArea dimensions must be finite numbers.");
  if (n.canvasWidth <= 0 || n.canvasHeight <= 0)
    throw new Error("CrosshairRenderer.prepare: canvas dimensions must be positive.");
  if (n.left < 0 || n.right < 0 || n.top < 0 || n.bottom < 0)
    throw new Error("CrosshairRenderer.prepare: gridArea margins must be non-negative.");
  const { canvasWidth: r, canvasHeight: o } = n, s = Number.isFinite(n.devicePixelRatio) && n.devicePixelRatio > 0 ? n.devicePixelRatio : 1, a = n.left * s, c = r - n.right * s, f = n.top * s, l = o - n.bottom * s, g = Oi(Math.floor(a), 0, Math.max(0, r)), u = Oi(Math.floor(f), 0, Math.max(0, o)), y = Oi(Math.ceil(c), 0, Math.max(0, r)), p = Oi(Math.ceil(l), 0, Math.max(0, o)), M = Math.max(0, y - g), R = Math.max(0, p - u), D = e * s, T = t * s, A = Su(i.lineWidth, s);
  if (A.length === 0 || !i.showX && !i.showY)
    return {
      vertices: new Float32Array(0),
      scissor: { x: g, y: u, w: M, h: R }
    };
  const b = [], m = i.showX ? fs(f, l) : [], x = i.showY ? fs(a, c) : [], v = ((i.showX ? m.length : 0) + (i.showY ? x.length : 0)) * A.length * 2, I = v > 0 && v <= aa, N = (h) => {
    const F = kn(h, r), S = Un(f, o), P = Un(l, o);
    Xi(b, [F, S, F, P]);
  }, C = (h) => {
    const F = Un(h, o), S = kn(a, r), P = kn(c, r);
    Xi(b, [S, F, P, F]);
  };
  if (i.showX)
    for (let h = 0; h < A.length; h++) {
      const F = D + A[h];
      if (!I) {
        N(F);
        continue;
      }
      const S = kn(F, r);
      for (let P = 0; P < m.length; P++) {
        const [B, E] = m[P], z = Un(B, o), U = Un(E, o);
        Xi(b, [S, z, S, U]);
      }
    }
  if (i.showY)
    for (let h = 0; h < A.length; h++) {
      const F = T + A[h];
      if (!I) {
        C(F);
        continue;
      }
      const S = Un(F, o);
      for (let P = 0; P < x.length; P++) {
        const [B, E] = x[P], z = kn(B, r), U = kn(E, r);
        Xi(b, [z, S, U, S]);
      }
    }
  return { vertices: new Float32Array(b), scissor: { x: g, y: u, w: M, h: R } };
};
function Nu(e, t) {
  let n = false, i = true;
  const r = (t == null ? void 0 : t.targetFormat) ?? gu, o = (t == null ? void 0 : t.sampleCount) ?? 1, s = Number.isFinite(o) ? Math.max(1, Math.floor(o)) : 1, a = t == null ? void 0 : t.pipelineCache, c = e.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), f = dt(e, 64, { label: "crosshairRenderer/vsUniforms" }), l = dt(e, 16, { label: "crosshairRenderer/fsUniforms" }), g = e.createBindGroup({
    layout: c,
    entries: [
      { binding: 0, resource: { buffer: f } },
      { binding: 1, resource: { buffer: l } }
    ]
  }), u = Lt(
    e,
    {
      label: "crosshairRenderer/pipeline",
      bindGroupLayouts: [c],
      vertex: {
        code: us,
        label: "crosshair.wgsl",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }]
          }
        ]
      },
      fragment: {
        code: us,
        label: "crosshair.wgsl",
        formats: r,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "line-list", cullMode: "none" },
      multisample: { count: s }
    },
    a
  ), y = yu(e, aa * 8);
  let p = 0, M = 0, R = 0, D = { x: 0, y: 0, w: 0, h: 0 };
  const T = () => {
    if (n) throw new Error("CrosshairRenderer is disposed.");
  };
  return {
    prepare: (w, v, I, N) => {
      if (T(), typeof N.showX != "boolean" || typeof N.showY != "boolean")
        throw new Error("CrosshairRenderer.prepare: showX/showY must be boolean.");
      if (typeof N.color != "string")
        throw new Error("CrosshairRenderer.prepare: color must be a string.");
      if (!Number.isFinite(N.lineWidth) || N.lineWidth < 0)
        throw new Error("CrosshairRenderer.prepare: lineWidth must be a finite non-negative number.");
      const { vertices: C, scissor: d } = Fu(w, v, I, N);
      C.byteLength === 0 ? p = 0 : (y.write(C), p = y.getVertexCount()), ut(e, f, Cu());
      const h = yt(N.color) ?? xu, F = new ArrayBuffer(4 * 4);
      new Float32Array(F).set([h[0], h[1], h[2], h[3]]), ut(e, l, F), M = I.canvasWidth, R = I.canvasHeight, D = d;
    }, render: (w) => {
      T(), i && p !== 0 && (M <= 0 || R <= 0 || (w.setScissorRect(D.x, D.y, D.w, D.h), w.setPipeline(u), w.setBindGroup(0, g), w.setVertexBuffer(0, y.getBuffer()), w.draw(p), w.setScissorRect(0, 0, M, R)));
    }, setVisible: (w) => {
      T(), i = !!w;
    }, dispose: () => {
      if (!n) {
        n = true;
        try {
          f.destroy();
        } catch {
        }
        try {
          l.destroy();
        } catch {
        }
        y.dispose(), p = 0, M = 0, R = 0, D = { x: 0, y: 0, w: 0, h: 0 };
      }
    }
  };
}
const ds = `// highlight.wgsl
// Draws an anti-aliased ring highlight around a point.
//
// Contract:
// - \`@builtin(position)\` in the fragment stage is framebuffer-space pixels.
// - The renderer supplies \`center\` and ring sizes in *device pixels*.

struct Uniforms {
  center: vec2<f32>,
  radius: f32,
  thickness: f32,
  color: vec4<f32>,
  outlineColor: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Fullscreen triangle.
  // Covers clip-space [-1,1] with 3 verts: (-1,-1), (3,-1), (-1,3)
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  var out: VSOut;
  out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  return out;
}

fn ringCoverage(distancePx: f32, radiusPx: f32, thicknessPx: f32) -> f32 {
  let aa = 1.0; // ~1px antialias band (device pixels)
  let halfT = max(0.5, thicknessPx * 0.5);
  let a0 = smoothstep(radiusPx - halfT - aa, radiusPx - halfT + aa, distancePx);
  let a1 = smoothstep(radiusPx + halfT - aa, radiusPx + halfT + aa, distancePx);
  return clamp(a0 - a1, 0.0, 1.0);
}

@fragment
fn fsMain(@builtin(position) fragPos: vec4<f32>) -> @location(0) vec4<f32> {
  let d = distance(fragPos.xy, u.center);

  let ring = ringCoverage(d, u.radius, u.thickness);
  let outline = ringCoverage(d, u.radius, u.thickness + 2.0);

  let cover = max(ring, outline);
  if (cover <= 0.0) {
    discard;
  }

  // Blend between outline and ring color based on relative coverage,
  // then apply total coverage as alpha.
  let t = clamp(select(0.0, ring / cover, cover > 0.0), 0.0, 1.0);
  let rgb = mix(u.outlineColor.rgb, u.color.rgb, t);
  let a = mix(u.outlineColor.a, u.color.a, t) * cover;
  return vec4<f32>(rgb, a);
}

`, Tu = "bgra8unorm", Au = [1, 1, 1, 1], $i = (e) => Math.min(1, Math.max(0, e)), Yi = (e, t, n) => Math.min(n, Math.max(t, e | 0)), Iu = (e) => Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.w) && Number.isFinite(e.h), Pu = (e, t) => {
    const n = Number.isFinite(t) ? t : 1;
    return [$i(e[0] * n), $i(e[1] * n), $i(e[2] * n), $i(e[3])];
  }, Ru = (e) => 0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2];
function Du(e, t) {
  let n = false, i = true;
  const r = (t == null ? void 0 : t.targetFormat) ?? Tu, o = (t == null ? void 0 : t.sampleCount) ?? 1, s = Number.isFinite(o) ? Math.max(1, Math.floor(o)) : 1, a = t == null ? void 0 : t.pipelineCache, c = e.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
  }), f = dt(e, 48, { label: "highlightRenderer/uniforms" }), l = e.createBindGroup({
    layout: c,
    entries: [{ binding: 0, resource: { buffer: f } }]
  }), g = Lt(
    e,
    {
      label: "highlightRenderer/pipeline",
      bindGroupLayouts: [c],
      vertex: { code: ds, label: "highlight.wgsl" },
      fragment: {
        code: ds,
        label: "highlight.wgsl",
        formats: r,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: s }
    },
    a
  );
  let u = 0, y = 0, p = { x: 0, y: 0, w: 0, h: 0 }, M = false;
  const R = () => {
    if (n) throw new Error("HighlightRenderer is disposed.");
  };
  return {
    prepare: (m, x, w) => {
      if (R(), !Number.isFinite(m.centerDeviceX) || !Number.isFinite(m.centerDeviceY))
        throw new Error("HighlightRenderer.prepare: point center must be finite.");
      if (!Number.isFinite(m.canvasWidth) || !Number.isFinite(m.canvasHeight) || m.canvasWidth <= 0 || m.canvasHeight <= 0)
        throw new Error("HighlightRenderer.prepare: canvasWidth/canvasHeight must be positive finite numbers.");
      if (!Iu(m.scissor))
        throw new Error("HighlightRenderer.prepare: scissor must be finite.");
      if (!Number.isFinite(w) || w < 0)
        throw new Error("HighlightRenderer.prepare: size must be a finite non-negative number.");
      const v = m.devicePixelRatio, I = Number.isFinite(v) && v > 0 ? v : 1, N = w * I, C = Math.max(1, N * 1.5), d = Math.max(1, Math.round(Math.max(2, C * 0.25))), h = yt(x) ?? Au, F = Pu(h, 1.25), P = Ru(h) > 0.7 ? [0, 0, 0, 0.9] : [1, 1, 1, 0.9], B = new ArrayBuffer(12 * 4);
      new Float32Array(B).set([
        m.centerDeviceX,
        m.centerDeviceY,
        C,
        d,
        F[0],
        F[1],
        F[2],
        1,
        P[0],
        P[1],
        P[2],
        P[3]
      ]), ut(e, f, B), u = m.canvasWidth, y = m.canvasHeight;
      const E = Yi(Math.floor(m.scissor.x), 0, Math.max(0, m.canvasWidth)), z = Yi(Math.floor(m.scissor.y), 0, Math.max(0, m.canvasHeight)), U = Yi(Math.ceil(m.scissor.x + m.scissor.w), 0, Math.max(0, m.canvasWidth)), Y = Yi(Math.ceil(m.scissor.y + m.scissor.h), 0, Math.max(0, m.canvasHeight));
      p = { x: E, y: z, w: Math.max(0, U - E), h: Math.max(0, Y - z) }, M = true;
    }, render: (m) => {
      R(), i && M && (u <= 0 || y <= 0 || p.w === 0 || p.h === 0 || (m.setScissorRect(p.x, p.y, p.w, p.h), m.setPipeline(g), m.setBindGroup(0, l), m.draw(3), m.setScissorRect(0, 0, u, y)));
    }, setVisible: (m) => {
      R(), i = !!m;
    }, dispose: () => {
      if (!n) {
        n = true;
        try {
          f.destroy();
        } catch {
        }
        u = 0, y = 0, p = { x: 0, y: 0, w: 0, h: 0 }, M = false;
      }
    }
  };
}
const ms = `// Reference line renderer (axis-aligned, instanced quads).
//
// Coordinate conventions:
// - Instance position is provided in CANVAS-LOCAL CSS pixels (same coordinate space as pointer events).
// - Plot rect is provided in DEVICE pixels (computed from grid margins + DPR).
// - Line width and dash lengths are provided in CSS pixels and converted in-shader using DPR.
//
// Scissoring/clipping:
// - The render coordinator is expected to set a scissor rect for the plot area before drawing.
// - This shader simply draws full-height/full-width quads; clipping is handled by scissor.
//
// Dash semantics:
// - lineDash is a repeating on/off sequence in CSS pixels, starting with "on" at t=0.
// - Up to 8 dash entries are supported per line (truncated on CPU).
//
// Performance:
// - Vertex stage expands each instance into a quad (2 triangles, 6 vertices).
// - We intentionally avoid snapping to integer device pixels to prevent visible stepping/jiggle
//   while zooming; edge AA is handled in the fragment stage.

struct VSUniforms {
  canvasSize : vec2<f32>,     // device pixels (canvas.width, canvas.height)
  plotOrigin : vec2<f32>,     // device pixels (plotLeft, plotTop)
  plotSize : vec2<f32>,       // device pixels (plotWidth, plotHeight)
  devicePixelRatio : f32,
  _pad0 : f32,
};

@group(0) @binding(0) var<uniform> u : VSUniforms;

struct VSIn {
  // axisPos.x = axis (0 = vertical, 1 = horizontal)
  // axisPos.y = position in CANVAS-LOCAL CSS pixels (x for vertical, y for horizontal)
  @location(0) axisPos : vec2<f32>,

  // widthDashCount.x = lineWidth in CSS px
  // widthDashCount.y = dashCount (float, cast to u32)
  @location(1) widthDashCount : vec2<f32>,

  // dashMeta.x = dashTotal (CSS px)
  // dashMeta.y = reserved (unused)
  @location(2) dashMeta : vec2<f32>,

  @location(3) dash0_3 : vec4<f32>,
  @location(4) dash4_7 : vec4<f32>,

  // Premultiplied or straight alpha is fine; blending is handled by pipeline state.
  @location(5) color : vec4<f32>,
};

struct VSOut {
  @builtin(position) position : vec4<f32>,

  // Distance along the line in CSS pixels (0..plotLengthCss).
  @location(0) alongCss : f32,

  // Packed dash metadata to avoid extra varyings.
  // dashInfo.x = dashCount (float, cast to u32)
  // dashInfo.y = dashTotal (CSS px)
  @location(1) @interpolate(flat) dashInfo : vec2<f32>,

  @location(2) @interpolate(flat) dash0_3 : vec4<f32>,
  @location(3) @interpolate(flat) dash4_7 : vec4<f32>,
  @location(4) @interpolate(flat) color : vec4<f32>,

  // Axis-aligned quad anti-aliasing (device pixels).
  // acrossDevice ranges [0..widthDevice] across the stroke thickness.
  @location(5) acrossDevice : f32,
  @location(6) @interpolate(flat) widthDevice : f32,
};

fn quadUv(vid : u32) -> vec2<f32> {
  // Two triangles covering [0,1]x[0,1].
  // 0: (0,0) 1:(1,0) 2:(0,1) 3:(0,1) 4:(1,0) 5:(1,1)
  switch (vid) {
    case 0u: { return vec2<f32>(0.0, 0.0); }
    case 1u: { return vec2<f32>(1.0, 0.0); }
    case 2u: { return vec2<f32>(0.0, 1.0); }
    case 3u: { return vec2<f32>(0.0, 1.0); }
    case 4u: { return vec2<f32>(1.0, 0.0); }
    default: { return vec2<f32>(1.0, 1.0); }
  }
}

@vertex
fn vsMain(in : VSIn, @builtin(vertex_index) vid : u32) -> VSOut {
  let uv = quadUv(vid);
  let dpr = max(1e-6, u.devicePixelRatio);
  // IMPORTANT: Do NOT snap reference lines to integer device pixels.
  // Snapping looks crisp at rest but causes visible "jiggle" / stepping while zooming because
  // the line position is continuously changing (data-space → screen-space), and rounding
  // quantizes that motion to adjacent pixels. We rely on analytic AA in the fragment stage
  // to keep strokes stable and reasonably crisp across DPRs.

  let axis = in.axisPos.x;
  let posCss = in.axisPos.y;
  let widthCss = max(0.0, in.widthDashCount.x);
  let widthDevice = max(1.0, widthCss * dpr);

  var xDevice : f32;
  var yDevice : f32;
  var alongCss : f32;
  var acrossDevice : f32;

  if (axis < 0.5) {
    // Vertical line at x = posCss (canvas-local CSS px), spanning plot height.
    let centerX = posCss * dpr;
    let startX = centerX - 0.5 * widthDevice;
    xDevice = startX + uv.x * widthDevice;
    yDevice = u.plotOrigin.y + uv.y * u.plotSize.y;
    alongCss = (uv.y * u.plotSize.y) / dpr;
    acrossDevice = uv.x * widthDevice;
  } else {
    // Horizontal line at y = posCss (canvas-local CSS px), spanning plot width.
    let centerY = posCss * dpr;
    let startY = centerY - 0.5 * widthDevice;
    xDevice = u.plotOrigin.x + uv.x * u.plotSize.x;
    yDevice = startY + uv.y * widthDevice;
    alongCss = (uv.x * u.plotSize.x) / dpr;
    acrossDevice = uv.y * widthDevice;
  }

  let clipX = (xDevice / u.canvasSize.x) * 2.0 - 1.0;
  let clipY = 1.0 - (yDevice / u.canvasSize.y) * 2.0;

  var out : VSOut;
  out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
  out.alongCss = alongCss;
  out.dashInfo = vec2<f32>(in.widthDashCount.y, in.dashMeta.x);
  out.dash0_3 = in.dash0_3;
  out.dash4_7 = in.dash4_7;
  out.color = in.color;
  out.acrossDevice = acrossDevice;
  out.widthDevice = widthDevice;
  return out;
}

fn dashValue(i : u32, d0 : vec4<f32>, d1 : vec4<f32>) -> f32 {
  switch (i) {
    case 0u: { return d0.x; }
    case 1u: { return d0.y; }
    case 2u: { return d0.z; }
    case 3u: { return d0.w; }
    case 4u: { return d1.x; }
    case 5u: { return d1.y; }
    case 6u: { return d1.z; }
    default: { return d1.w; }
  }
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  // Analytic edge anti-aliasing for axis-aligned quads (reduces shimmering during zoom).
  // This is a lightweight alternative to full MSAA for thin strokes.
  let edgeDist = min(in.acrossDevice, in.widthDevice - in.acrossDevice);
  // Slightly widen AA to reduce temporal shimmer on moving 1-2px strokes.
  // Keep conservative so lines remain reasonably crisp.
  let aa = max(fwidth(in.acrossDevice), 1e-3) * 1.25;
  let edgeCoverage = smoothstep(0.0, aa, edgeDist);
  var color = in.color;
  color.a = color.a * edgeCoverage;

  let dashCount = u32(round(in.dashInfo.x));
  let dashTotal = in.dashInfo.y;

  // IMPORTANT: derivative ops (fwidth) must execute in uniform control flow.
  // So compute the dash parameterization unconditionally (using a safe total) BEFORE any early-return.
  let dashTotalSafe = max(dashTotal, 1.0);
  let t = in.alongCss - floor(in.alongCss / dashTotalSafe) * dashTotalSafe;
  // Anti-alias dash edges along the line axis (CSS pixels).
  // This reduces shimmer during zoom for dashed reference lines without requiring MSAA.
  let dashAa = max(fwidth(t), 1e-3);

  // Solid line (no dash pattern).
  if (dashCount == 0u || dashTotal <= 0.0) {
    return color;
  }

  var acc = 0.0;
  var on = true;

  for (var i : u32 = 0u; i < 8u; i = i + 1u) {
    if (i >= dashCount) { break; }
    let seg = dashValue(i, in.dash0_3, in.dash4_7);
    if (seg <= 0.0) { continue; }

    if (t < acc + seg) {
      // IMPORTANT: Avoid \`discard\` for off segments.
      // Discard can cause temporal popping on moving dashed edges; prefer a smooth alpha mask.
      //
      // Fade in/out near dash boundaries for smooth edges. This produces coverage in [0..1]
      // within the current segment, going to 0 at segment boundaries.
      let inFromStart = smoothstep(0.0, dashAa, t - acc);
      let inFromEnd = smoothstep(0.0, dashAa, (acc + seg) - t);
      let segCoverage = min(inFromStart, inFromEnd);

      // On segments contribute alpha; off segments contribute 0 alpha (no discard).
      let dashMask = select(0.0, segCoverage, on);
      color.a = color.a * dashMask;
      return color;
    }

    acc = acc + seg;
    on = !on;
  }

  // Defensive fallback if the dash list is degenerate.
  // If we didn't find a segment (shouldn't happen), default to transparent (safer than solid).
  color.a = 0.0;
  return color;
}
`, Vn = 8, Eu = "bgra8unorm", Bu = (e) => Number.isFinite(e.left) && Number.isFinite(e.right) && Number.isFinite(e.top) && Number.isFinite(e.bottom) && Number.isFinite(e.canvasWidth) && Number.isFinite(e.canvasHeight), Lu = (e) => {
    if (!e || e.length === 0)
      return { dashCount: 0, dashTotal: 0, values: new Array(Vn).fill(0) };
    const t = [];
    for (let s = 0; s < e.length; s++) {
      const a = e[s];
      typeof a == "number" && Number.isFinite(a) && a > 0 && t.push(a);
    }
    if (t.length === 0)
      return { dashCount: 0, dashTotal: 0, values: new Array(Vn).fill(0) };
    const n = t.length % 2 === 1 ? t.concat(t) : t, i = Math.min(Vn, n.length), r = new Array(Vn).fill(0);
    let o = 0;
    for (let s = 0; s < i; s++)
      r[s] = n[s], o += n[s];
    return !Number.isFinite(o) || o <= 0 ? { dashCount: 0, dashTotal: 0, values: new Array(Vn).fill(0) } : { dashCount: i, dashTotal: o, values: r };
  };
function ps(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? Eu, r = (t == null ? void 0 : t.sampleCount) ?? 1, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }]
  }), c = dt(e, 32, { label: "referenceLineRenderer/vsUniforms" }), f = e.createBindGroup({
    layout: a,
    entries: [{ binding: 0, resource: { buffer: c } }]
  }), l = 72, g = l / 4, u = Lt(
    e,
    {
      label: "referenceLineRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: ms,
        label: "referenceLine.wgsl",
        buffers: [
          {
            arrayStride: l,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, format: "float32x2", offset: 0 },
              // axisPos
              { shaderLocation: 1, format: "float32x2", offset: 8 },
              // widthDashCount
              { shaderLocation: 2, format: "float32x2", offset: 16 },
              // dashMeta
              { shaderLocation: 3, format: "float32x4", offset: 24 },
              // dash0_3
              { shaderLocation: 4, format: "float32x4", offset: 40 },
              // dash4_7
              { shaderLocation: 5, format: "float32x4", offset: 56 }
              // color
            ]
          }
        ]
      },
      fragment: {
        code: ms,
        label: "referenceLine.wgsl",
        formats: i,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let y = null, p = 0, M = 0;
  const R = () => {
    if (n) throw new Error("ReferenceLineRenderer is disposed.");
  };
  return {
    prepare: (b, m) => {
      if (R(), !Array.isArray(m))
        throw new Error("ReferenceLineRenderer.prepare: lines must be an array.");
      if (!Bu(b))
        throw new Error("ReferenceLineRenderer.prepare: gridArea dimensions must be finite numbers.");
      if (b.canvasWidth <= 0 || b.canvasHeight <= 0)
        throw new Error("ReferenceLineRenderer.prepare: canvas dimensions must be positive.");
      if (b.left < 0 || b.right < 0 || b.top < 0 || b.bottom < 0)
        throw new Error("ReferenceLineRenderer.prepare: gridArea margins must be non-negative.");
      const x = Number.isFinite(b.devicePixelRatio) && b.devicePixelRatio > 0 ? b.devicePixelRatio : 1, w = b.left * x, v = b.top * x, I = b.canvasWidth - b.right * x, N = b.canvasHeight - b.bottom * x, C = I - w, d = N - v;
      if (!(C > 0) || !(d > 0)) {
        M = 0;
        return;
      }
      const h = new Float32Array(8);
      if (h[0] = b.canvasWidth, h[1] = b.canvasHeight, h[2] = w, h[3] = v, h[4] = C, h[5] = d, h[6] = x, h[7] = 0, ut(e, c, h), m.length === 0) {
        M = 0;
        return;
      }
      if (!y || p < m.length) {
        const S = Math.max(1, Math.ceil(m.length * 1.5)), P = Math.max(4, S * l);
        if (y)
          try {
            y.destroy();
          } catch {
          }
        y = e.createBuffer({
          label: "referenceLineRenderer/instanceBuffer",
          size: P,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        }), p = S;
      }
      const F = new Float32Array(m.length * g);
      for (let S = 0; S < m.length; S++) {
        const P = m[S], B = S * g;
        if (P.axis !== "vertical" && P.axis !== "horizontal")
          throw new Error("ReferenceLineRenderer.prepare: line.axis must be 'vertical' or 'horizontal'.");
        if (!Number.isFinite(P.positionCssPx))
          throw new Error("ReferenceLineRenderer.prepare: line.positionCssPx must be a finite number.");
        if (!Number.isFinite(P.lineWidth) || P.lineWidth < 0)
          throw new Error("ReferenceLineRenderer.prepare: line.lineWidth must be a finite non-negative number.");
        const E = P.rgba;
        if (!Array.isArray(E) || E.length !== 4)
          throw new Error("ReferenceLineRenderer.prepare: line.rgba must be a tuple [r,g,b,a].");
        const z = Lu(P.lineDash);
        F[B + 0] = P.axis === "vertical" ? 0 : 1, F[B + 1] = P.positionCssPx, F[B + 2] = P.lineWidth, F[B + 3] = z.dashCount, F[B + 4] = z.dashTotal, F[B + 5] = 0;
        for (let U = 0; U < Vn; U++)
          F[B + 6 + U] = z.values[U];
        F[B + 14] = E[0], F[B + 15] = E[1], F[B + 16] = E[2], F[B + 17] = E[3];
      }
      e.queue.writeBuffer(y, 0, F.buffer, F.byteOffset, F.byteLength), M = m.length;
    }, render: (b, m = 0, x) => {
      if (R(), M === 0 || !y) return;
      const w = Number.isFinite(m) ? Math.max(0, Math.floor(m)) : 0, v = Math.max(0, M - w), I = x == null ? v : Number.isFinite(x) ? Math.max(0, Math.min(v, Math.floor(x))) : v;
      I !== 0 && (b.setPipeline(u), b.setBindGroup(0, f), b.setVertexBuffer(0, y), b.draw(6, I, 0, w));
    }, dispose: () => {
      if (!n) {
        n = true;
        try {
          c.destroy();
        } catch {
        }
        if (y)
          try {
            y.destroy();
          } catch {
          }
        y = null, p = 0, M = 0;
      }
    }
  };
}
const hs = `// annotationMarker.wgsl
// Instanced annotation marker shader (circle SDF with optional stroke).
//
// Coordinate contract:
// - Instance center is CANVAS-LOCAL CSS pixels (xCssPx, yCssPx)
// - Instance size is diameter in CSS pixels (sizeCssPx)
// - Uniform provides render target size in *device* pixels and DPR for CSS→device conversion.
//
// Draw call: draw(6, instanceCount) using triangle-list quad expansion in VS.

struct VSUniforms {
  viewportPx: vec2<f32>, // render target size in device pixels (width, height)
  dpr: f32,              // device pixel ratio (CSS px -> device px)
  _pad0: f32,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct VSIn {
  // Center in CANVAS-LOCAL CSS pixels.
  @location(0) centerCssPx: vec2<f32>,
  // Marker diameter in CSS pixels.
  @location(1) sizeCssPx: f32,
  // Stroke width in CSS pixels (0 disables stroke).
  @location(2) strokeWidthCssPx: f32,
  // Colors are straight-alpha RGBA in 0..1.
  @location(3) fillRgba: vec4<f32>,
  @location(4) strokeRgba: vec4<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
  // Local quad coordinates in [-1, 1]^2 (used for circle SDF).
  @location(0) local: vec2<f32>,
  // Half-size in device pixels (radius in screen space).
  @location(1) halfSizePx: f32,
  @location(2) strokeWidthPx: f32,
  @location(3) fillRgba: vec4<f32>,
  @location(4) strokeRgba: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Fixed local corners for 2 triangles (triangle-list).
  let localCorners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  let corner = localCorners[vertexIndex];

  let dpr = select(1.0, vsUniforms.dpr, vsUniforms.dpr > 0.0);
  let centerPx = in.centerCssPx * dpr;
  let halfSizePx = 0.5 * max(0.0, in.sizeCssPx) * dpr;
  let strokeWidthPx = max(0.0, in.strokeWidthCssPx) * dpr;

  let posPx = centerPx + corner * halfSizePx;

  // Convert device pixels to clip-space with origin at top-left:
  // x: [0..w] -> [-1..1], y: [0..h] -> [1..-1]
  let clipX = (posPx.x / vsUniforms.viewportPx.x) * 2.0 - 1.0;
  let clipY = 1.0 - (posPx.y / vsUniforms.viewportPx.y) * 2.0;

  var out: VSOut;
  out.clipPosition = vec4<f32>(clipX, clipY, 0.0, 1.0);
  out.local = corner;
  out.halfSizePx = halfSizePx;
  out.strokeWidthPx = strokeWidthPx;
  out.fillRgba = in.fillRgba;
  out.strokeRgba = in.strokeRgba;
  return out;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  if (in.halfSizePx <= 0.0) {
    discard;
  }

  // Circle SDF in normalized space: dist == 1 at the circle boundary.
  let dist = length(in.local);
  let aa = max(1e-6, fwidth(dist));

  // Coverage inside the circle.
  let outerCoverage = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, dist);
  if (outerCoverage <= 0.0) {
    discard;
  }

  // Optional stroke: compute inner radius in normalized units.
  let strokeNorm = clamp(in.strokeWidthPx / max(1e-6, in.halfSizePx), 0.0, 1.0);
  let inner = max(0.0, 1.0 - strokeNorm);
  let innerCoverage = 1.0 - smoothstep(inner - aa, inner + aa, dist);

  let fillCoverage = clamp(innerCoverage, 0.0, 1.0);
  let strokeCoverage = clamp(outerCoverage - innerCoverage, 0.0, 1.0);

  let fillA = clamp(in.fillRgba.a, 0.0, 1.0) * fillCoverage;
  let strokeA = clamp(in.strokeRgba.a, 0.0, 1.0) * strokeCoverage;
  let outA = fillA + strokeA;
  if (outA <= 0.0) {
    discard;
  }

  // Straight-alpha output: compute a weighted average RGB for correct blending.
  let rgb = (in.fillRgba.rgb * fillA + in.strokeRgba.rgb * strokeA) / outA;
  return vec4<f32>(rgb, outA);
}

`, _u = "bgra8unorm", nr = 12, kr = nr * 4, dn = (e) => Math.min(1, Math.max(0, e)), ys = (e) => {
    if (!Number.isFinite(e) || e <= 0) return 1;
    const t = Math.ceil(e);
    return 2 ** Math.ceil(Math.log2(t));
  };
function gs(e, t) {
  let n = false;
  const i = (t == null ? void 0 : t.targetFormat) ?? _u, r = (t == null ? void 0 : t.sampleCount) ?? 1, o = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 1, s = t == null ? void 0 : t.pipelineCache, a = e.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }]
  }), c = dt(e, 16, { label: "annotationMarkerRenderer/vsUniforms" }), f = new Float32Array(4), l = e.createBindGroup({
    layout: a,
    entries: [{ binding: 0, resource: { buffer: c } }]
  }), g = Lt(
    e,
    {
      label: "annotationMarkerRenderer/pipeline",
      bindGroupLayouts: [a],
      vertex: {
        code: hs,
        label: "annotationMarker.wgsl",
        buffers: [
          {
            arrayStride: kr,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, format: "float32x2", offset: 0 },
              // centerCssPx
              { shaderLocation: 1, format: "float32", offset: 8 },
              // sizeCssPx
              { shaderLocation: 2, format: "float32", offset: 12 },
              // strokeWidthCssPx
              { shaderLocation: 3, format: "float32x4", offset: 16 },
              // fillRgba
              { shaderLocation: 4, format: "float32x4", offset: 32 }
              // strokeRgba
            ]
          }
        ]
      },
      fragment: {
        code: hs,
        label: "annotationMarker.wgsl",
        formats: i,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: o }
    },
    s
  );
  let u = null, y = 0, p = new ArrayBuffer(0), M = new Float32Array(p);
  const R = () => {
    if (n) throw new Error("AnnotationMarkerRenderer is disposed.");
  }, D = (x) => {
    if (x <= M.length) return;
    const w = Math.max(32, ys(x));
    p = new ArrayBuffer(w * 4), M = new Float32Array(p);
  }, T = (x, w, v) => {
    const I = Number.isFinite(x) && x > 0 ? x : 1, N = Number.isFinite(w) && w > 0 ? w : 1, C = Number.isFinite(v) && v > 0 ? v : 1;
    f[0] = I, f[1] = N, f[2] = C, f[3] = 0, ut(e, c, f);
  };
  return {
    prepare: ({ canvasWidth: x, canvasHeight: w, devicePixelRatio: v, instances: I }) => {
      if (R(), !Number.isFinite(x) || !Number.isFinite(w) || x <= 0 || w <= 0)
        throw new Error("AnnotationMarkerRenderer.prepare: canvasWidth/canvasHeight must be positive finite numbers.");
      if (!Array.isArray(I))
        throw new Error("AnnotationMarkerRenderer.prepare: instances must be an array.");
      T(x, w, v), D(I.length * nr);
      const N = M;
      let C = 0;
      for (let h = 0; h < I.length; h++) {
        const F = I[h];
        if (!Number.isFinite(F.xCssPx) || !Number.isFinite(F.yCssPx) || !Number.isFinite(F.sizeCssPx) || F.sizeCssPx <= 0) continue;
        const S = F.strokeWidthCssPx ?? 0, P = F.strokeRgba ?? [0, 0, 0, 0], B = dn(F.fillRgba[0]), E = dn(F.fillRgba[1]), z = dn(F.fillRgba[2]), U = dn(F.fillRgba[3]), Y = dn(P[0]), j = dn(P[1]), q = dn(P[2]), Z = dn(P[3]);
        N[C + 0] = F.xCssPx, N[C + 1] = F.yCssPx, N[C + 2] = F.sizeCssPx, N[C + 3] = Number.isFinite(S) ? Math.max(0, S) : 0, N[C + 4] = B, N[C + 5] = E, N[C + 6] = z, N[C + 7] = U, N[C + 8] = Y, N[C + 9] = j, N[C + 10] = q, N[C + 11] = Z, C += nr;
      }
      if (y = C / nr, y === 0)
        return;
      const d = Math.max(4, y * kr);
      if (!u || u.size < d) {
        const h = Math.max(Math.max(4, ys(d)), u ? u.size : 0);
        if (u)
          try {
            u.destroy();
          } catch {
          }
        u = e.createBuffer({
          label: "annotationMarkerRenderer/instanceBuffer",
          size: h,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      e.queue.writeBuffer(u, 0, p, 0, y * kr);
    }, render: (x, w = 0, v) => {
      if (R(), !u || y === 0) return;
      const I = Number.isFinite(w) ? Math.max(0, Math.floor(w)) : 0, N = Math.max(0, y - I), C = v == null ? N : Number.isFinite(v) ? Math.max(0, Math.min(N, Math.floor(v))) : N;
      C !== 0 && (x.setPipeline(g), x.setBindGroup(0, l), x.setVertexBuffer(0, u), x.draw(6, C, 0, I));
    }, dispose: () => {
      if (!n) {
        if (n = true, u)
          try {
            u.destroy();
          } catch {
          }
        u = null, y = 0;
        try {
          c.destroy();
        } catch {
        }
      }
    }
  };
}
const ku = 6, Uu = 500;
function Gu(e, t) {
  let n = false, i = t;
  const r = {
    mousemove: /* @__PURE__ */ new Set(),
    click: /* @__PURE__ */ new Set(),
    mouseleave: /* @__PURE__ */ new Set()
  };
  let o = null, s = null;
  const a = (b) => {
    const m = e.getBoundingClientRect();
    if (m.width === 0 || m.height === 0) return null;
    const x = b.clientX - m.left, w = b.clientY - m.top, v = i.left, I = i.top, N = m.width - i.left - i.right, C = m.height - i.top - i.bottom, d = x - v, h = w - I, F = d >= 0 && d <= N && h >= 0 && h <= C;
    return { x, y: w, gridX: d, gridY: h, plotWidthCss: N, plotHeightCss: C, isInGrid: F, originalEvent: b };
  }, c = (b, m) => {
    const x = a(m);
    if (x)
      for (const w of r[b]) w(x);
  }, f = (b) => {
    o && b.isPrimary && b.pointerId === o.pointerId && (o = null);
  }, l = (b) => {
    n || c("mousemove", b);
  }, g = (b) => {
    n || (f(b), c("mouseleave", b));
  }, u = (b) => {
    n || (f(b), c("mouseleave", b));
  }, y = (b) => {
    if (!n) {
      if (s === b.pointerId) {
        s = null;
        return;
      }
      f(b), c("mouseleave", b);
    }
  }, p = (b) => {
    if (n || !b.isPrimary || b.pointerType === "mouse" && b.button !== 0) return;
    const m = e.getBoundingClientRect();
    if (!(m.width === 0 || m.height === 0)) {
      o = {
        pointerId: b.pointerId,
        startClientX: b.clientX,
        startClientY: b.clientY,
        startTimeMs: b.timeStamp
      };
      try {
        e.setPointerCapture(b.pointerId);
      } catch {
      }
    }
  }, M = (b) => {
    if (n || !b.isPrimary || !o || b.pointerId !== o.pointerId) return;
    const m = b.timeStamp - o.startTimeMs, x = b.clientX - o.startClientX, w = b.clientY - o.startClientY, v = x * x + w * w;
    o = null;
    try {
      e.hasPointerCapture(b.pointerId) && (s = b.pointerId, e.releasePointerCapture(b.pointerId));
    } catch {
    }
    const I = ku;
    m <= Uu && v <= I * I && c("click", b);
  };
  return e.addEventListener("pointermove", l, { passive: true }), e.addEventListener("pointerleave", g, { passive: true }), e.addEventListener("pointercancel", u, { passive: true }), e.addEventListener("lostpointercapture", y, { passive: true }), e.addEventListener("pointerdown", p, { passive: true }), e.addEventListener("pointerup", M, { passive: true }), {
    canvas: e, on: (b, m) => {
      n || r[b].add(m);
    }, off: (b, m) => {
      r[b].delete(m);
    }, updateGridArea: (b) => {
      i = b;
    }, dispose: () => {
      n || (n = true, o = null, s = null, e.removeEventListener("pointermove", l), e.removeEventListener("pointerleave", g), e.removeEventListener("pointercancel", u), e.removeEventListener("lostpointercapture", y), e.removeEventListener("pointerdown", p), e.removeEventListener("pointerup", M), r.mousemove.clear(), r.click.clear(), r.mouseleave.clear());
    }
  };
}
const Hi = (e, t, n) => Math.min(n, Math.max(t, e)), zu = (e, t) => {
  const n = e.deltaY;
  if (!Number.isFinite(n) || n === 0) return 0;
  switch (e.deltaMode) {
    case WheelEvent.DOM_DELTA_PIXEL:
      return n;
    case WheelEvent.DOM_DELTA_LINE:
      return n * 16;
    case WheelEvent.DOM_DELTA_PAGE:
      return n * (Number.isFinite(t) && t > 0 ? t : 800);
    default:
      return n;
  }
}, Vu = (e, t) => {
  const n = e.deltaX;
  if (!Number.isFinite(n) || n === 0) return 0;
  switch (e.deltaMode) {
    case WheelEvent.DOM_DELTA_PIXEL:
      return n;
    case WheelEvent.DOM_DELTA_LINE:
      return n * 16;
    case WheelEvent.DOM_DELTA_PAGE:
      return n * (Number.isFinite(t) && t > 0 ? t : 800);
    default:
      return n;
  }
}, Wu = (e) => {
  const t = Math.abs(e);
  if (!Number.isFinite(t) || t === 0) return 1;
  const n = Math.min(t, 200);
  return Math.exp(n * 2e-3);
}, Ou = (e) => e.pointerType === "mouse" && (e.buttons & 4) !== 0, Xu = (e) => e.pointerType === "mouse" && e.shiftKey && (e.buttons & 1) !== 0;
function $u(e, t) {
  let n = false, i = false, r = null, o = false, s = 0;
  const a = typeof navigator < "u" && navigator.maxTouchPoints > 0, c = /* @__PURE__ */ new Map();
  let f = 0, l = "";
  const g = () => {
    f = 0;
  }, u = () => {
    o = false, s = 0;
  }, y = (v) => {
    if (r = v, !i) return;
    const I = v.originalEvent;
    if (!(v.isInGrid && (Xu(I) || Ou(I)))) {
      u();
      return;
    }
    const C = v.plotWidthCss;
    if (!(C > 0) || !Number.isFinite(C)) {
      u();
      return;
    }
    if (!o) {
      o = true, s = v.gridX;
      return;
    }
    const d = v.gridX - s;
    if (s = v.gridX, !Number.isFinite(d) || d === 0) return;
    const { start: h, end: F } = t.getRange(), S = F - h;
    if (!Number.isFinite(S) || S === 0) return;
    const P = -(d / C) * S;
    !Number.isFinite(P) || P === 0 || t.pan(P);
  }, p = (v) => {
    r = null, u();
  }, M = (v) => {
    if (!i || n) return;
    const I = r;
    if (!I || !I.isInGrid) return;
    const N = I.plotWidthCss, C = I.plotHeightCss;
    if (!(N > 0) || !(C > 0)) return;
    const d = zu(v, C), h = Vu(v, N);
    if (Math.abs(h) > Math.abs(d) && h !== 0) {
      const { start: U, end: Y } = t.getRange(), j = Y - U;
      if (!Number.isFinite(j) || j === 0) return;
      const q = h / N * j;
      if (!Number.isFinite(q) || q === 0) return;
      v.preventDefault(), t.pan(q);
      return;
    }
    if (d === 0) return;
    const F = Wu(d);
    if (!(F > 1)) return;
    const { start: S, end: P } = t.getRange(), B = P - S;
    if (!Number.isFinite(B) || B === 0) return;
    const E = Hi(I.gridX / N, 0, 1), z = Hi(S + E * B, 0, 100);
    v.preventDefault(), d < 0 ? t.zoomIn(z, F) : t.zoomOut(z, F);
  }, R = (v, I) => {
    const N = I.getBoundingClientRect();
    if (N.width === 0 || N.height === 0) return false;
    const C = v.clientX - N.left, d = v.clientY - N.top;
    return C >= 0 && C <= N.width && d >= 0 && d <= N.height;
  }, D = (v) => {
    !i || n || v.pointerType !== "touch" || (v.preventDefault(), !(r ? r.isInGrid : R(v, e.canvas))) || c.size >= 2 || (c.set(v.pointerId, { x: v.clientX, y: v.clientY }), e.canvas.setPointerCapture(v.pointerId), g());
  }, T = (v) => {
    if (!i || n || v.pointerType !== "touch" || !c.has(v.pointerId)) return;
    const I = c.size;
    if (I === 1) {
      const N = c.get(v.pointerId);
      if (!N) return;
      const C = v.clientX - N.x;
      if (c.set(v.pointerId, { x: v.clientX, y: v.clientY }), !Number.isFinite(C) || C === 0) return;
      const d = (r == null ? void 0 : r.plotWidthCss) ?? 0;
      if (!(d > 0)) return;
      const { start: h, end: F } = t.getRange(), S = F - h;
      if (!Number.isFinite(S) || S === 0) return;
      const P = -(C / d) * S;
      if (!Number.isFinite(P) || P === 0) return;
      t.pan(P);
    } else if (I === 2) {
      c.set(v.pointerId, { x: v.clientX, y: v.clientY });
      const N = c.values(), C = N.next().value, d = N.next().value, h = Math.hypot(C.x - d.x, C.y - d.y), F = (C.x + d.x) / 2;
      if (!Number.isFinite(h) || h === 0) return;
      if (f > 0 && Number.isFinite(f)) {
        const S = f / h, B = e.canvas.getBoundingClientRect(), E = (r == null ? void 0 : r.plotWidthCss) ?? 0;
        if (!(E > 0) || B.width === 0) {
          f = h;
          return;
        }
        const z = r ? r.x - r.gridX : 0, U = F - B.left - z, Y = Hi(U / E, 0, 1), { start: j, end: q } = t.getRange(), Z = q - j;
        if (!Number.isFinite(Z) || Z === 0) {
          f = h;
          return;
        }
        const J = Hi(j + Y * Z, 0, 100);
        S > 1 ? t.zoomOut(J, S) : S > 0 && S < 1 && t.zoomIn(J, 1 / S);
      }
      f = h;
    }
  }, A = (v) => {
    !i || n || v.pointerType === "touch" && (c.delete(v.pointerId), g());
  }, b = (v) => {
    !i || n || v.pointerType === "touch" && (c.delete(v.pointerId), g());
  }, m = () => {
    if (!(n || i) && (i = true, e.on("mousemove", y), e.on("mouseleave", p), e.canvas.addEventListener("wheel", M, { passive: false }), a)) {
      const v = e.canvas;
      l = v.style.touchAction, v.style.touchAction = "none", v.addEventListener("pointerdown", D, { passive: false }), v.addEventListener("pointermove", T, { passive: false }), v.addEventListener("pointerup", A), v.addEventListener("pointercancel", b);
    }
  }, x = () => {
    if (!(n || !i)) {
      if (i = false, e.off("mousemove", y), e.off("mouseleave", p), e.canvas.removeEventListener("wheel", M), a) {
        const v = e.canvas;
        v.style.touchAction = l, v.removeEventListener("pointerdown", D), v.removeEventListener("pointermove", T), v.removeEventListener("pointerup", A), v.removeEventListener("pointercancel", b);
      }
      c.clear(), g(), r = null, u();
    }
  };
  return {
    enable: m, disable: x, dispose: () => {
      n || (x(), n = true);
    }
  };
}
const Yu = 0.5, Hu = 100, Kt = (e, t, n) => Math.min(n, Math.max(t, e)), Ur = (e) => Kt(e, 0, 1), xs = (e) => Object.is(e, -0) ? 0 : e, qu = (e) => ({ start: e.start, end: e.end });
function Zu(e, t, n) {
  let i = 0, r = 100, o = null;
  const s = /* @__PURE__ */ new Set();
  let a = (() => {
    const x = Number.isFinite(n == null ? void 0 : n.minSpan) ? n.minSpan : Yu;
    return Kt(Number.isFinite(x) ? x : 0, 0, 100);
  })(), c = (() => {
    const x = Number.isFinite(n == null ? void 0 : n.maxSpan) ? n.maxSpan : Hu;
    return Kt(Number.isFinite(x) ? x : 100, 0, 100);
  })(), f = Math.min(a, c), l = Math.max(a, c);
  const g = () => {
    const x = { start: i, end: r };
    if (o !== null && o.start === x.start && o.end === x.end)
      return;
    o = qu(x);
    const w = Array.from(s);
    for (const v of w) v({ start: i, end: r });
  }, u = (x, w, v) => {
    if (v) {
      if (typeof v == "string")
        switch (v) {
          case "start":
            return { center: x, ratio: 0 };
          case "end":
            return { center: w, ratio: 1 };
          case "center":
            return { center: (x + w) * 0.5, ratio: 0.5 };
        }
      if (v && Number.isFinite(v.center) && Number.isFinite(v.ratio))
        return { center: v.center, ratio: v.ratio };
    }
  }, y = (x, w, v) => {
    if (!Number.isFinite(x) || !Number.isFinite(w)) return;
    let I = x, N = w;
    if (I > N) {
      const h = I;
      I = N, N = h;
    }
    let C = N - I;
    if (!Number.isFinite(C) || C < 0) return;
    const d = Kt(C, f, l);
    if (d !== C) {
      const h = v != null && v.anchor && Number.isFinite(v.anchor.center) ? Kt(v.anchor.center, 0, 100) : (I + N) * 0.5, F = v != null && v.anchor && Number.isFinite(v.anchor.ratio) ? Ur(v.anchor.ratio) : 0.5;
      I = h - F * d, N = I + d, C = d;
    }
    if (C > 100 && (I = 0, N = 100, C = 100), I < 0) {
      const h = -I;
      I += h, N += h;
    }
    if (N > 100) {
      const h = N - 100;
      I -= h, N -= h;
    }
    I = Kt(I, 0, 100), N = Kt(N, 0, 100), I = xs(I), N = xs(N), !(I === i && N === r) && (i = I, r = N, (v == null ? void 0 : v.emit) !== false && g());
  };
  return y(e, t, { emit: false }), {
    getRange: () => ({ start: i, end: r }), setRange: (x, w) => {
      y(x, w);
    }, setRangeAnchored: (x, w, v) => {
      y(x, w, { anchor: u(x, w, v) });
    }, setSpanConstraints: (x, w) => {
      const v = typeof x == "number" && Number.isFinite(x) ? Kt(x, 0, 100) : a, I = typeof w == "number" && Number.isFinite(w) ? Kt(w, 0, 100) : c;
      if (v === a && I === c) return;
      a = v, c = I, f = Math.min(a, c), l = Math.max(a, c);
      const N = i, C = r, d = 1e-6, h = C >= 100 - d ? "end" : N <= 0 + d ? "start" : "center";
      y(N, C, { anchor: u(N, C, h) });
    }, zoomIn: (x, w) => {
      if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 1) return;
      const v = Kt(x, 0, 100), I = r - i, N = I === 0 ? 0.5 : Ur((v - i) / I), C = I / w, d = v - N * C, h = d + C;
      y(d, h, { anchor: { center: v, ratio: N } });
    }, zoomOut: (x, w) => {
      if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 1) return;
      const v = Kt(x, 0, 100), I = r - i, N = I === 0 ? 0.5 : Ur((v - i) / I), C = I * w, d = v - N * C, h = d + C;
      y(d, h, { anchor: { center: v, ratio: N } });
    }, pan: (x) => {
      Number.isFinite(x) && y(i + x, r + x);
    }, onChange: (x) => (s.add(x), () => {
      s.delete(x);
    })
  };
}
const Gr = /* @__PURE__ */ new WeakMap(), bs = (e) => {
  const t = typeof e == "object" && e !== null ? e : null;
  if (t && Gr.has(t))
    return Gr.get(t);
  let n = false;
  const i = Ne(e);
  for (let r = 0; r < i; r++) {
    const o = Fe(e, r);
    if (Number.isNaN(o)) {
      n = true;
      break;
    }
  }
  return t && Gr.set(t, n), n;
}, ju = (e, t) => {
  const n = [];
  for (let c = 0; c < e.length; c++) {
    const f = e[c];
    (f == null ? void 0 : f.type) === "bar" && n.push({ globalSeriesIndex: c, s: f });
  }
  if (n.length === 0) return null;
  const i = ia(
    n.map((c) => c.s),
    t
  ), r = i.barWidthPx, o = i.gapPx, s = i.clusterWidthPx;
  if (!Number.isFinite(r) || !(r > 0)) return null;
  const a = /* @__PURE__ */ new Map();
  for (let c = 0; c < n.length; c++) {
    const f = n[c].globalSeriesIndex, l = i.clusterSlots.clusterIndexBySeries[c] ?? 0;
    a.set(f, l);
  }
  return {
    barWidth: r,
    gap: o,
    clusterWidth: s,
    clusterIndexByGlobalSeriesIndex: a
  };
}, vs = (e, t) => {
  let n = 0, i = Ne(e);
  for (; n < i;) {
    const r = n + i >>> 1;
    Fe(e, r) < t ? n = r + 1 : i = r;
  }
  return n;
};
function ws(e, t, n, i) {
  if (!Number.isFinite(t)) return [];
  const r = Number.POSITIVE_INFINITY, o = r * r, s = n.invert(t);
  if (!Number.isFinite(s)) return [];
  const a = [], c = ju(e, n);
  for (let f = 0; f < e.length; f++) {
    const l = e[f];
    if (l.type === "pie" || l.type === "candlestick" || l.visible === false) continue;
    const g = l.data, u = Ne(g);
    if (u === 0) continue;
    if (l.type === "bar" && c) {
      const D = c.clusterIndexByGlobalSeriesIndex.get(f);
      if (D !== void 0) {
        const { barWidth: T, gap: A, clusterWidth: b } = c, m = -b / 2 + D * (T + A), x = 0;
        if (Number.isFinite(T) && T > 0 && Number.isFinite(m)) {
          let w = -1;
          const v = (I) => {
            if (!Number.isFinite(I)) return false;
            const N = I + m, C = N + T;
            return t >= N - x && t < C + x;
          };
          if (bs(g))
            for (let I = 0; I < u; I++) {
              const N = Fe(g, I);
              if (!Number.isFinite(N)) continue;
              const C = n.scale(N);
              v(C) && (w = w < 0 ? I : Math.min(w, I));
            }
          else {
            const I = n.invert(t - m);
            if (Number.isFinite(I)) {
              const N = vs(g, I), C = (d) => {
                if (d < 0 || d >= u) return null;
                const h = Fe(g, d);
                if (!Number.isFinite(h)) return null;
                const F = n.scale(h);
                return Number.isFinite(F) ? F : null;
              };
              for (let d = N - 1; d >= 0; d--) {
                const h = C(d);
                if (h === null) continue;
                const F = h + m, S = F + T;
                if (S + x <= t) break;
                t >= F - x && t < S + x && (w = w < 0 ? d : Math.min(w, d));
              }
              for (let d = N; d < u; d++) {
                const h = C(d);
                if (h === null) continue;
                const F = h + m;
                if (F - x > t) break;
                const S = F + T;
                t < S + x && (w = w < 0 ? d : Math.min(w, d));
              }
            }
          }
          if (w >= 0) {
            const I = Fe(g, w), N = _e(g, w), C = at(g, w), d = C !== void 0 ? [I, N, C] : [I, N];
            a.push({ seriesIndex: f, dataIndex: w, point: d });
            continue;
          }
        }
      }
    }
    let y = -1, p = null, M = o;
    const R = (D, T) => {
      if (!Number.isFinite(T) || !(T < M || T === M && (y < 0 || D < y))) return;
      M = T, y = D;
      const b = Fe(g, D), m = _e(g, D), x = at(g, D);
      p = x !== void 0 ? [b, m, x] : [b, m];
    };
    if (bs(g))
      for (let D = 0; D < u; D++) {
        const T = Fe(g, D);
        if (!Number.isFinite(T)) continue;
        const A = n.scale(T);
        if (!Number.isFinite(A)) continue;
        const b = A - t;
        R(D, b * b);
      }
    else {
      const D = vs(g, s);
      let T = D - 1, A = D;
      const b = (m) => {
        const x = Fe(g, m);
        if (!Number.isFinite(x)) return null;
        const w = n.scale(x);
        if (!Number.isFinite(w)) return null;
        const v = w - t;
        return v * v;
      };
      for (; T >= 0 || A < u;) {
        for (; T >= 0 && b(T) === null;) T--;
        for (; A < u && b(A) === null;) A++;
        if (T < 0 && A >= u) break;
        const m = T >= 0 ? b(T) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY, x = A < u ? b(A) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
        if (m > M && x > M) break;
        m <= x ? (T >= 0 && m <= M && R(T, m), T--, A < u && x <= M && x === m && (R(A, x), A++)) : (A < u && x <= M && R(A, x), A++);
      }
    }
    p !== null && a.push({ seriesIndex: f, dataIndex: y, point: p });
  }
  return a;
}
const Ku = (e) => Math.min(1, Math.max(0, e)), Ju = (e) => {
  const t = e.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!t) return null;
  const n = Number(t[1]) / 100;
  return Number.isFinite(n) ? n : null;
}, ao = (e) => Array.isArray(e), Pn = (e) => ao(e) ? e[0] : e.timestamp, Qu = (e) => ao(e) ? e[1] : e.open, ef = (e) => ao(e) ? e[2] : e.close, Cs = /* @__PURE__ */ new WeakMap(), tf = (e) => {
  const t = Cs.get(e);
  if (t !== void 0) return t;
  const n = [];
  for (let o = 0; o < e.length; o++) {
    const s = Pn(e[o]);
    Number.isFinite(s) && n.push(s);
  }
  if (n.length < 2) return 1;
  n.sort((o, s) => o - s);
  let i = Number.POSITIVE_INFINITY;
  for (let o = 1; o < n.length; o++) {
    const s = n[o] - n[o - 1];
    s > 0 && s < i && (i = s);
  }
  const r = Number.isFinite(i) && i > 0 ? i : 1;
  return Cs.set(e, r), r;
};
function Kr(e, t, n, i) {
  if (t.length === 0) return 0;
  const r = tf(t);
  let o = 0;
  if (Number.isFinite(r) && r > 0) {
    let g = null;
    for (let u = 0; u < t.length; u++) {
      const y = Pn(t[u]);
      if (Number.isFinite(y)) {
        g = y;
        break;
      }
    }
    if (g != null) {
      const u = n.scale(g), y = n.scale(g + r), p = Math.abs(y - u);
      Number.isFinite(p) && p > 0 && (o = p);
    }
  }
  (!(o > 0) || !Number.isFinite(o)) && (o = (Number.isFinite(i ?? Number.NaN) ? i : 0) / Math.max(1, t.length));
  let s = 0;
  const a = e.barWidth;
  if (typeof a == "number")
    s = Number.isFinite(a) ? Math.max(0, a) : 0;
  else if (typeof a == "string") {
    const g = Ju(a);
    s = g == null ? 0 : o * Ku(g);
  }
  const c = Number.isFinite(e.barMinWidth) ? Math.max(0, e.barMinWidth) : 0, f = Number.isFinite(e.barMaxWidth) ? Math.max(0, e.barMaxWidth) : Number.POSITIVE_INFINITY, l = Math.max(c, f);
  return s = Math.min(Math.max(s, c), l), Number.isFinite(s) ? s : 0;
}
const qi = /* @__PURE__ */ new WeakMap(), nf = (e) => {
  const t = qi.get(e);
  if (t !== void 0) return t;
  let n = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < e.length; i++) {
    const r = Pn(e[i]);
    if (!Number.isFinite(r) || r < n)
      return qi.set(e, false), false;
    n = r;
  }
  return qi.set(e, true), true;
}, rf = (e, t) => {
  let n = 0, i = e.length;
  for (; n < i;) {
    const r = n + i >>> 1;
    Pn(e[r]) < t ? n = r + 1 : i = r;
  }
  return n;
};
function Jr(e, t, n, i, r, o) {
  if (!Number.isFinite(t) || !Number.isFinite(n) || !Number.isFinite(o) || !(o > 0)) return null;
  const s = i.invert(t);
  if (!Number.isFinite(s)) return null;
  const a = o / 2;
  let c = null, f = Number.POSITIVE_INFINITY;
  const l = (u, y, p, M) => {
    if (Number.isFinite(M)) {
      if (M < f) {
        f = M, c = { seriesIndex: u, dataIndex: y, point: p };
        return;
      }
      M === f && c && (y < c.dataIndex ? c = { seriesIndex: u, dataIndex: y, point: p } : y === c.dataIndex && u < c.seriesIndex && (c = { seriesIndex: u, dataIndex: y, point: p }));
    }
  }, g = (u) => {
    const y = Qu(u), p = ef(u);
    if (!Number.isFinite(y) || !Number.isFinite(p)) return false;
    const M = r.scale(y), R = r.scale(p);
    if (!Number.isFinite(M) || !Number.isFinite(R)) return false;
    const D = Math.min(M, R), T = Math.max(M, R);
    return n >= D && n <= T;
  };
  for (let u = 0; u < e.length; u++) {
    const p = e[u].data, M = p.length;
    if (M === 0) continue;
    if (!nf(p)) {
      for (let T = 0; T < M; T++) {
        const A = p[T], b = Pn(A);
        if (!Number.isFinite(b)) continue;
        const m = i.scale(b);
        if (!Number.isFinite(m)) continue;
        const x = Math.abs(t - m);
        x > a || g(A) && l(u, T, A, x);
      }
      continue;
    }
    const D = rf(p, s);
    for (let T = D - 1; T >= 0; T--) {
      const A = p[T], b = Pn(A), m = i.scale(b);
      if (!Number.isFinite(m)) continue;
      if (m < t - a) break;
      const x = Math.abs(t - m);
      x > a || g(A) && l(u, T, A, x);
    }
    for (let T = D; T < M; T++) {
      const A = p[T], b = Pn(A), m = i.scale(b);
      if (!Number.isFinite(m)) continue;
      if (m > t + a) break;
      const x = Math.abs(t - m);
      x > a || g(A) && l(u, T, A, x);
    }
  }
  return c;
}
const mn = Math.PI * 2, Zi = (e) => {
  if (!Number.isFinite(e)) return 0;
  const t = e % mn;
  return t < 0 ? t + mn : t;
};
function Qr(e, t, n, i, r) {
  if (!Number.isFinite(e) || !Number.isFinite(t) || !Number.isFinite(i.x) || !Number.isFinite(i.y)) return null;
  const o = Number.isFinite(r.inner) ? Math.max(0, r.inner) : 0, s = Number.isFinite(r.outer) ? Math.max(0, r.outer) : 0;
  if (!(s > 0)) return null;
  const a = e - i.x, c = i.y - t, f = Math.hypot(a, c);
  if (!Number.isFinite(f) || f <= o || f > s) return null;
  const l = Zi(Math.atan2(c, a)), g = n.series, u = g.data;
  let y = 0, p = 0;
  for (let A = 0; A < u.length; A++) {
    const b = u[A], m = b == null ? void 0 : b.value;
    typeof m == "number" && Number.isFinite(m) && m > 0 && b.visible !== false && (y += m, p++);
  }
  if (!(y > 0) || p === 0) return null;
  const M = typeof g.startAngle == "number" && Number.isFinite(g.startAngle) ? g.startAngle : 90;
  let R = Zi(M * Math.PI / 180), D = 0, T = 0;
  for (let A = 0; A < u.length; A++) {
    const b = u[A], m = b == null ? void 0 : b.value;
    if (typeof m != "number" || !Number.isFinite(m) || m <= 0 || (b == null ? void 0 : b.visible) === false) continue;
    T++;
    const x = T === p;
    let v = m / y * mn;
    if (x ? v = Math.max(0, mn - D) : v = Math.max(0, Math.min(mn, v)), D += v, !(v > 0)) continue;
    const I = R, N = p === 1 ? R + mn : Zi(R + v);
    R = Zi(R + v);
    let C = N - I;
    C < 0 && (C += mn);
    let d = l - I;
    if (d < 0 && (d += mn), d <= C)
      return { seriesIndex: n.seriesIndex, dataIndex: A, slice: b };
  }
  return null;
}
const $n = (e, t) => {
  if (!Number.isFinite(t))
    throw new Error(`${e} must be a finite number. Received: ${String(t)}`);
};
function yn() {
  let e = 0, t = 1, n = 0, i = 1;
  const r = {
    domain(o, s) {
      return $n("domain min", o), $n("domain max", s), e = o, t = s, r;
    },
    range(o, s) {
      return $n("range min", o), $n("range max", s), n = o, i = s, r;
    },
    scale(o) {
      if (!Number.isFinite(o)) return Number.NaN;
      if (e === t)
        return (n + i) / 2;
      const s = (o - e) / (t - e);
      return n + s * (i - n);
    },
    invert(o) {
      if (!Number.isFinite(o)) return Number.NaN;
      if (e === t)
        return e;
      if (n === i)
        return (e + t) / 2;
      const s = (o - n) / (i - n);
      return e + s * (t - e);
    }
  };
  return r;
}
const of = (e) => {
  switch (e) {
    case "start":
      return { translateX: "0%", originX: "0%" };
    case "middle":
      return { translateX: "-50%", originX: "50%" };
    case "end":
      return { translateX: "-100%", originX: "100%" };
  }
};
function Ms(e, t) {
  const n = getComputedStyle(e), i = n.position, r = n.overflow, o = (t == null ? void 0 : t.clip) ?? false, s = i === "static", a = !o && (r === "hidden" || r === "scroll" || r === "auto"), c = s ? e.style.position : null, f = a ? e.style.overflow : null;
  s && (e.style.position = "relative"), a && (e.style.overflow = "visible");
  const l = document.createElement("div");
  l.style.position = "absolute", l.style.inset = "0", l.style.pointerEvents = "none", l.style.overflow = o ? "hidden" : "visible", l.style.zIndex = "10", e.appendChild(l);
  let g = false;
  return {
    clear: () => {
      g || l.replaceChildren();
    }, addLabel: (M, R, D, T) => {
      if (g)
        return document.createElement("span");
      const A = document.createElement("span");
      A.textContent = M, A.style.position = "absolute", A.style.left = `${R}px`, A.style.top = `${D}px`, A.style.pointerEvents = "none", A.style.userSelect = "none", A.style.whiteSpace = "nowrap", A.style.lineHeight = "1", (T == null ? void 0 : T.fontSize) != null && (A.style.fontSize = `${T.fontSize}px`), (T == null ? void 0 : T.color) != null && (A.style.color = T.color);
      const b = (T == null ? void 0 : T.rotation) ?? 0, m = (T == null ? void 0 : T.anchor) ?? "start", { translateX: x, originX: w } = of(m);
      return A.style.transformOrigin = `${w} 50%`, A.style.transform = `translateX(${x}) translateY(-50%) rotate(${b}deg)`, l.appendChild(A), A;
    }, dispose: () => {
      if (!g) {
        g = true;
        try {
          l.remove();
        } finally {
          c !== null && (e.style.position = c), f !== null && (e.style.overflow = f);
        }
      }
    }
  };
}
const Ss = (e, t) => {
  var i;
  const n = (i = e.name) == null ? void 0 : i.trim();
  return n || `Series ${t + 1}`;
}, sf = (e, t, n) => {
  var o;
  const i = (o = e.color) == null ? void 0 : o.trim();
  if (i) return i;
  const r = n.colorPalette;
  return r.length > 0 ? r[t % r.length] ?? "#000000" : "#000000";
}, Fs = (e, t) => {
  const n = e == null ? void 0 : e.trim();
  return n || `Slice ${t + 1}`;
}, af = (e, t, n, i) => {
  const r = e == null ? void 0 : e.trim();
  if (r) return r;
  const o = i.colorPalette, s = o.length;
  return s > 0 ? o[(t + n) % s] ?? "#000000" : "#000000";
};
function cf(e, t = "right", n) {
  const r = getComputedStyle(e).position === "static", o = r ? e.style.position : null;
  r && (e.style.position = "relative");
  const s = document.createElement("div");
  s.style.position = "absolute", s.style.pointerEvents = "auto", s.style.userSelect = "none", s.style.boxSizing = "border-box", s.style.padding = "8px", s.style.borderRadius = "8px", s.style.borderStyle = "solid", s.style.borderWidth = "1px", s.style.maxHeight = "calc(100% - 16px)", s.style.overflow = "auto";
  const a = document.createElement("div");
  a.style.display = "flex", a.style.gap = "8px", s.appendChild(a), n && (a.addEventListener("click", (u) => {
    const p = u.target.closest("[data-series-index]");
    if (p) {
      const M = parseInt(p.dataset.seriesIndex, 10);
      if (!isNaN(M)) {
        const R = p.dataset.sliceIndex;
        if (R !== void 0) {
          const D = parseInt(R, 10);
          if (!isNaN(D)) {
            n(M, D);
            return;
          }
        }
        n(M);
      }
    }
  }), a.addEventListener("keydown", (u) => {
    if (u.key === "Enter" || u.key === " ") {
      const p = u.target.closest("[data-series-index]");
      if (p) {
        u.preventDefault();
        const M = parseInt(p.dataset.seriesIndex, 10);
        if (!isNaN(M)) {
          const R = p.dataset.sliceIndex;
          if (R !== void 0) {
            const D = parseInt(R, 10);
            if (!isNaN(D)) {
              n(M, D);
              return;
            }
          }
          n(M);
        }
      }
    }
  })), ((u) => {
    switch (s.style.top = "", s.style.right = "", s.style.bottom = "", s.style.left = "", s.style.maxWidth = "", a.style.flexDirection = "", a.style.flexWrap = "", a.style.alignItems = "", u) {
      case "right": {
        s.style.top = "8px", s.style.right = "8px", s.style.maxWidth = "40%", a.style.flexDirection = "column", a.style.flexWrap = "nowrap", a.style.alignItems = "flex-start";
        return;
      }
      case "left": {
        s.style.top = "8px", s.style.left = "8px", s.style.maxWidth = "40%", a.style.flexDirection = "column", a.style.flexWrap = "nowrap", a.style.alignItems = "flex-start";
        return;
      }
      case "top": {
        s.style.top = "8px", s.style.left = "8px", s.style.right = "8px", a.style.flexDirection = "row", a.style.flexWrap = "wrap", a.style.alignItems = "center";
        return;
      }
      case "bottom": {
        s.style.bottom = "8px", s.style.left = "8px", s.style.right = "8px", a.style.flexDirection = "row", a.style.flexWrap = "wrap", a.style.alignItems = "center";
        return;
      }
    }
  })(t), e.appendChild(s);
  let f = false;
  return {
    update: (u, y) => {
      if (f) return;
      s.style.color = y.textColor, s.style.background = y.backgroundColor, s.style.borderColor = y.axisLineColor, s.style.fontFamily = y.fontFamily, s.style.fontSize = `${y.fontSize}px`;
      const p = [];
      for (let M = 0; M < u.length; M++) {
        const R = u[M];
        if (R.type === "pie")
          for (let D = 0; D < R.data.length; D++) {
            const T = R.data[D], A = (T == null ? void 0 : T.visible) !== false, b = document.createElement("div");
            b.style.display = "flex", b.style.alignItems = "center", b.style.gap = "6px", b.style.lineHeight = "1.1", b.style.whiteSpace = "nowrap", b.style.cursor = n ? "pointer" : "default", b.style.opacity = A ? "1" : "0.5", b.style.transition = "opacity 0.2s", n && (b.setAttribute("role", "button"), b.setAttribute("aria-pressed", String(A)), b.setAttribute("aria-label", `Toggle ${Fs(T == null ? void 0 : T.name, D)} visibility`), b.tabIndex = 0, b.dataset.seriesIndex = String(M), b.dataset.sliceIndex = String(D));
            const m = document.createElement("div");
            m.style.width = "10px", m.style.height = "10px", m.style.borderRadius = "2px", m.style.flex = "0 0 auto", m.style.background = af(T == null ? void 0 : T.color, M, D, y), m.style.border = `1px solid ${y.axisLineColor}`;
            const x = document.createElement("span");
            x.textContent = Fs(T == null ? void 0 : T.name, D), x.style.textDecoration = A ? "none" : "line-through", b.appendChild(m), b.appendChild(x), p.push(b);
          }
        else {
          if (R.showInLegend === false)
            continue;
          const D = R.visible !== false, T = document.createElement("div");
          T.style.display = "flex", T.style.alignItems = "center", T.style.gap = "6px", T.style.lineHeight = "1.1", T.style.whiteSpace = "nowrap", T.style.cursor = n ? "pointer" : "default", T.style.opacity = D ? "1" : "0.5", T.style.transition = "opacity 0.2s", n && (T.setAttribute("role", "button"), T.setAttribute("aria-pressed", String(D)), T.setAttribute("aria-label", `Toggle ${Ss(R, M)} visibility`), T.tabIndex = 0, T.dataset.seriesIndex = String(M));
          const A = document.createElement("div");
          A.style.width = "10px", A.style.height = "10px", A.style.borderRadius = "2px", A.style.flex = "0 0 auto", A.style.background = sf(R, M, y), A.style.border = `1px solid ${y.axisLineColor}`;
          const b = document.createElement("span");
          b.textContent = Ss(R, M), b.style.textDecoration = D ? "none" : "line-through", T.appendChild(A), T.appendChild(b), p.push(T);
        }
      }
      a.replaceChildren(...p);
    }, dispose: () => {
      if (!f) {
        f = true;
        try {
          s.remove();
        } finally {
          o !== null && (e.style.position = o);
        }
      }
    }
  };
}
const Ns = (e, t, n) => n < t || e < t ? t : e > n ? n : e;
function Ts(e) {
  const n = getComputedStyle(e).position === "static", i = n ? e.style.position : null;
  n && (e.style.position = "relative");
  const r = document.createElement("div");
  r.style.position = "absolute", r.style.left = "0", r.style.top = "0", r.style.pointerEvents = "none", r.style.userSelect = "none", r.style.boxSizing = "border-box", r.style.zIndex = "var(--chartgpu-tooltip-z, 10)", r.style.padding = "var(--chartgpu-tooltip-padding, 6px 8px)", r.style.borderRadius = "var(--chartgpu-tooltip-radius, 8px)", r.style.borderStyle = "solid", r.style.borderWidth = "var(--chartgpu-tooltip-border-width, 1px)", r.style.borderColor = "var(--chartgpu-tooltip-border, rgba(224,224,224,0.35))", r.style.boxShadow = "var(--chartgpu-tooltip-shadow, 0 6px 18px rgba(0,0,0,0.35))", r.style.maxWidth = "var(--chartgpu-tooltip-max-width, min(320px, 100%))", r.style.overflow = "hidden", r.style.fontFamily = 'var(--chartgpu-tooltip-font-family, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji")', r.style.fontSize = "var(--chartgpu-tooltip-font-size, 12px)", r.style.lineHeight = "var(--chartgpu-tooltip-line-height, 1.2)", r.style.color = "var(--chartgpu-tooltip-color, #e0e0e0)", r.style.background = "var(--chartgpu-tooltip-bg, rgba(26,26,46,0.95))", r.style.whiteSpace = "normal", r.style.opacity = "0", r.style.transitionProperty = "opacity";
  const o = 140;
  r.style.transitionDuration = `${o}ms`, r.style.transitionTimingFunction = "ease", r.style.willChange = "opacity", r.style.display = "none", r.style.visibility = "hidden", r.setAttribute("role", "tooltip"), e.appendChild(r);
  let s = false, a = 0, c = null, f = null;
  const l = () => {
    c != null && (window.clearTimeout(c), c = null), f != null && (window.cancelAnimationFrame(f), f = null);
  }, g = () => r.style.display === "none" || r.style.visibility === "hidden", u = () => {
    const R = r.style.visibility;
    r.style.visibility = "hidden";
    const D = r.offsetWidth, T = r.offsetHeight;
    return r.style.visibility = R, { width: D, height: T };
  };
  return {
    show: (R, D, T) => {
      if (s) return;
      a += 1, l();
      const A = g();
      r.innerHTML = T;
      const b = 12, m = 12, x = 8;
      r.style.display = "block", r.style.visibility = "hidden";
      const { width: w, height: v } = u(), I = e.clientWidth, N = e.clientHeight;
      let C = R + b, d = D + m;
      if (C + w > I - x && (C = R - b - w), d + v > N - x && (d = D - m - v), C = Ns(C, x, I - x - w), d = Ns(d, x, N - x - v), r.style.left = `${C}px`, r.style.top = `${d}px`, r.style.visibility = "visible", A) {
        r.style.opacity = "0";
        const h = a;
        f = window.requestAnimationFrame(() => {
          f = null, !s && h === a && (r.style.opacity = "1");
        });
      } else
        r.style.opacity = "1";
    }, hide: () => {
      if (s) return;
      if (a += 1, l(), r.style.display === "none" || r.style.visibility === "hidden") {
        r.style.opacity = "0", r.style.visibility = "hidden", r.style.display = "none";
        return;
      }
      r.style.opacity = "0";
      const R = a;
      c = window.setTimeout(() => {
        c = null, !s && R === a && (r.style.visibility = "hidden", r.style.display = "none");
      }, o + 50);
    }, dispose: () => {
      if (!s) {
        s = true;
        try {
          l(), r.remove();
        } finally {
          i !== null && (e.style.position = i);
        }
      }
    }
  };
}
const ir = "—";
function on(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function In(e) {
  if (!Number.isFinite(e)) return ir;
  const i = (Object.is(e, -0) ? 0 : e).toFixed(2).replace(/\.?0+$/, "");
  return i === "-0" ? "0" : i;
}
function ca(e) {
  const t = e.seriesName.trim();
  return t.length > 0 ? t : `Series ${e.seriesIndex + 1}`;
}
function la(e) {
  const t = e.trim();
  return t.length === 0 ? "#888" : /^#[0-9a-fA-F]{3}$/.test(t) || /^#[0-9a-fA-F]{6}$/.test(t) || /^#[0-9a-fA-F]{8}$/.test(t) || /^rgba?\(\s*\d{1,3}\s*(?:,\s*|\s+)\d{1,3}\s*(?:,\s*|\s+)\d{1,3}(?:\s*(?:,\s*|\/\s*)(?:0|1|0?\.\d+))?\s*\)$/.test(
    t
  ) || /^[a-zA-Z]+$/.test(t) ? t : "#888";
}
function ua(e) {
  return e.length === 5;
}
function lf(e, t) {
  if (!Number.isFinite(e) || !Number.isFinite(t) || e === 0) return ir;
  const n = (t - e) / e * 100;
  return Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(2)}%` : ir;
}
function fa(e, t) {
  const n = on(ca(e)), i = on(t);
  return [
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">',
    '<span style="display:flex;align-items:center;gap:8px;min-width:0;">',
    `<span style="width:8px;height:8px;border-radius:999px;flex:0 0 auto;background-color:${on(la(e.color))};"></span>`,
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n}</span>`,
    "</span>",
    `<span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${i}</span>`,
    "</div>"
  ].join("");
}
function da(e) {
  const [, t, n, i, r] = e.value, o = on(ca(e)), s = on(la(e.color)), a = In(t), c = In(r), f = In(i), l = In(n), g = n > t, u = g ? "▲" : "▼", y = g ? "#22c55e" : "#ef4444", p = lf(t, n), M = `O: ${a} H: ${c} L: ${f} C: ${l}`, R = on(M), D = on(u), T = on(p), A = on(y);
  return [
    '<div style="display:flex;flex-direction:column;gap:4px;">',
    // Series name row
    '<div style="display:flex;align-items:center;gap:8px;">',
    `<span style="width:8px;height:8px;border-radius:999px;flex:0 0 auto;background-color:${s};"></span>`,
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">${o}</span>`,
    "</div>",
    // OHLC values row
    `<div style="font-variant-numeric:tabular-nums;white-space:nowrap;font-size:0.9em;">${R}</div>`,
    // Change row with arrow
    '<div style="display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;">',
    `<span style="color:${A};font-weight:700;">${D}</span>`,
    `<span style="color:${A};font-weight:600;">${T}</span>`,
    "</div>",
    "</div>"
  ].join("");
}
function uf(e) {
  return da(e);
}
function di(e) {
  return ua(e.value) ? uf(e) : fa(e, In(e.value[1]));
}
function zr(e) {
  if (e.length === 0) return "";
  const t = `x: ${In(e[0].value[0])}`, n = `<div style="margin:0 0 6px 0;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;">${on(
    t
  )}</div>`, i = e.map((r) => ua(r.value) ? da(r) : fa(r, In(r.value[1]))).join('<div style="height:4px;"></div>');
  return `${n}${i}`;
}
const ff = (e) => Number.isFinite(e) ? e : 0, df = (e) => Number.isFinite(e) ? e : null;
function As() {
  const e = /* @__PURE__ */ new Map();
  function t(o, s, a, c, f, l) {
    const g = Symbol("Animation");
    if (Array.isArray(o) || Array.isArray(s)) {
      if (!Array.isArray(o) || !Array.isArray(s))
        throw new Error('Array animation requires both "from" and "to" to be arrays');
      if (o.length !== s.length)
        throw new Error(
          `Array animation length mismatch: from.length=${o.length}, to.length=${s.length}`
        );
      const u = new Array(o.length);
      return e.set(g, {
        kind: "array",
        from: o,
        to: s,
        duration: a,
        easing: c,
        onUpdate: f,
        onComplete: l,
        startTime: null,
        out: u
      }), g;
    }
    return e.set(g, {
      kind: "scalar",
      from: o,
      to: s,
      duration: a,
      easing: c,
      onUpdate: f,
      onComplete: l,
      startTime: null
    }), g;
  }
  function n(o) {
    e.delete(o);
  }
  function i() {
    e.clear();
  }
  function r(o) {
    var c;
    const s = df(o);
    if (s === null) return;
    const a = Array.from(e.keys());
    for (const f of a) {
      const l = e.get(f);
      if (!l) continue;
      const g = l.startTime ?? s;
      l.startTime === null && e.set(f, { ...l, startTime: g });
      const u = ff(l.duration), y = Math.max(0, s - g), p = u <= 0 || y >= u, M = u <= 0 ? 1 : y / u, R = p ? 1 : l.easing(M);
      if (l.kind === "scalar") {
        const D = l.from + (l.to - l.from) * R;
        if (l.onUpdate(D), !e.has(f)) continue;
      } else {
        const D = l.out.length;
        for (let T = 0; T < D; T++) {
          const A = l.from[T] ?? 0, b = l.to[T] ?? 0;
          l.out[T] = A + (b - A) * R;
        }
        if (l.onUpdate(l.out), !e.has(f)) continue;
      }
      p && ((c = l.onComplete) == null || c.call(l), e.delete(f));
    }
  }
  return {
    animate: t,
    cancel: n,
    cancelAll: i,
    update: r
  };
}
const pr = (e) => Number.isNaN(e) || e <= 0 ? 0 : e >= 1 ? 1 : e;
function Is(e) {
  return pr(e);
}
function mf(e) {
  const n = 1 - pr(e);
  return 1 - n * n * n;
}
function pf(e) {
  const t = pr(e);
  if (t < 0.5) return 4 * t * t * t;
  const n = -2 * t + 2;
  return 1 - n * n * n / 2;
}
function hf(e) {
  const t = pr(e), n = 7.5625, i = 2.75;
  if (t < 1 / i)
    return n * t * t;
  if (t < 2 / i) {
    const o = t - 1.5 / i;
    return n * o * o + 0.75;
  }
  if (t < 2.5 / i) {
    const o = t - 2.25 / i;
    return n * o * o + 0.9375;
  }
  const r = t - 2.625 / i;
  return n * r * r + 0.984375;
}
function yf(e) {
  switch (e) {
    case "linear":
      return Is;
    case "cubicOut":
      return mf;
    case "cubicInOut":
      return pf;
    case "bounceOut":
      return hf;
    default:
      return Is;
  }
}
const Yn = Ca;
function gf(e) {
  return e ? e.clientWidth : 0;
}
function xf(e) {
  if (!e) return { width: 0, height: 0 };
  const t = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return { width: e.width / t, height: e.height / t };
}
const bf = "bgra8unorm", eo = 5, fr = 24 * 60 * 60 * 1e3, vf = 30 * fr, wf = 365 * fr, Cf = 9, Vr = 1, Mf = 6, dr = (e) => typeof e == "number" && Number.isFinite(e) ? e : null, gn = (e) => typeof e == "number" && Number.isFinite(e) ? e : void 0, Sf = 2e4, Ff = (e) => {
  throw new Error(`RenderCoordinator: unreachable value: ${String(e)}`);
}, ma = (e) => Array.isArray(e), Nf = (e) => ma(e) ? { x: e[0], y: e[1] } : { x: e.x, y: e.y }, Ps = (e) => {
  const t = Ne(e);
  if (t === 0) return { x: [], y: [] };
  const n = new Array(t), i = new Array(t);
  let r = false, o;
  for (let s = 0; s < t; s++) {
    n[s] = Fe(e, s), i[s] = _e(e, s);
    const a = at(e, s);
    a !== void 0 ? (r = true, o || (o = new Array(s)), o[s] = a) : o && (o[s] = void 0);
  }
  return r && o ? { x: n, y: i, size: o } : { x: n, y: i };
}, Tf = (e, t) => {
  const n = zt(t);
  if (!n) return e;
  if (!e) return n;
  let i = Math.min(e.xMin, n.xMin), r = Math.max(e.xMax, n.xMax), o = Math.min(e.yMin, n.yMin), s = Math.max(e.yMax, n.yMax);
  return i === r && (r = i + 1), o === s && (s = o + 1), { xMin: i, xMax: r, yMin: o, yMax: s };
}, Af = (e, t) => {
  if (t.length === 0) return e;
  let n = (e == null ? void 0 : e.xMin) ?? Number.POSITIVE_INFINITY, i = (e == null ? void 0 : e.xMax) ?? Number.NEGATIVE_INFINITY, r = (e == null ? void 0 : e.yMin) ?? Number.POSITIVE_INFINITY, o = (e == null ? void 0 : e.yMax) ?? Number.NEGATIVE_INFINITY;
  for (let s = 0; s < t.length; s++) {
    const a = t[s], c = sn(a) ? a[0] : a.timestamp, f = sn(a) ? a[3] : a.low, l = sn(a) ? a[4] : a.high;
    !Number.isFinite(c) || !Number.isFinite(f) || !Number.isFinite(l) || (c < n && (n = c), c > i && (i = c), f < r && (r = f), l > o && (o = l));
  }
  return !Number.isFinite(n) || !Number.isFinite(i) || !Number.isFinite(r) || !Number.isFinite(o) ? e : (n === i && (i = n + 1), r === o && (o = r + 1), { xMin: n, xMax: i, yMin: r, yMax: o });
}, pa = (e, t) => {
  let n = Number.POSITIVE_INFINITY, i = Number.NEGATIVE_INFINITY, r = Number.POSITIVE_INFINITY, o = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < e.length; s++) {
    const a = e[s];
    if (a.type === "pie") continue;
    const c = (t == null ? void 0 : t[s]) ?? null;
    if (c) {
      const u = c;
      if (Number.isFinite(u.xMin) && Number.isFinite(u.xMax) && Number.isFinite(u.yMin) && Number.isFinite(u.yMax)) {
        u.xMin < n && (n = u.xMin), u.xMax > i && (i = u.xMax), u.yMin < r && (r = u.yMin), u.yMax > o && (o = u.yMax);
        continue;
      }
    }
    const f = a.rawBounds;
    if (f) {
      const u = f;
      if (Number.isFinite(u.xMin) && Number.isFinite(u.xMax) && Number.isFinite(u.yMin) && Number.isFinite(u.yMax)) {
        u.xMin < n && (n = u.xMin), u.xMax > i && (i = u.xMax), u.yMin < r && (r = u.yMin), u.yMax > o && (o = u.yMax);
        continue;
      }
    }
    if (a.type === "candlestick") {
      const u = a.rawData ?? a.data;
      for (let y = 0; y < u.length; y++) {
        const p = u[y];
        if (sn(p)) {
          const M = p[0], R = p[3], D = p[4];
          if (!Number.isFinite(M) || !Number.isFinite(R) || !Number.isFinite(D)) continue;
          const T = Math.min(R, D), A = Math.max(R, D);
          M < n && (n = M), M > i && (i = M), T < r && (r = T), A > o && (o = A);
        } else {
          const M = p.timestamp, R = p.low, D = p.high;
          if (!Number.isFinite(M) || !Number.isFinite(R) || !Number.isFinite(D)) continue;
          const T = Math.min(R, D), A = Math.max(R, D);
          M < n && (n = M), M > i && (i = M), T < r && (r = T), A > o && (o = A);
        }
      }
      continue;
    }
    const l = a.data, g = Ne(l);
    for (let u = 0; u < g; u++) {
      const y = Fe(l, u), p = _e(l, u);
      !Number.isFinite(y) || !Number.isFinite(p) || (y < n && (n = y), y > i && (i = y), p < r && (r = p), p > o && (o = p));
    }
  }
  return !Number.isFinite(n) || !Number.isFinite(i) || !Number.isFinite(r) || !Number.isFinite(o) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (n === i && (i = n + 1), r === o && (o = r + 1), { xMin: n, xMax: i, yMin: r, yMax: o });
}, vi = (e, t) => {
  let n = e, i = t;
  if ((!Number.isFinite(n) || !Number.isFinite(i)) && (n = 0, i = 1), n === i)
    i = n + 1;
  else if (n > i) {
    const r = n;
    n = i, i = r;
  }
  return { min: n, max: i };
}, Rs = (e, t) => {
  const n = e.canvas;
  if (!n) throw new Error("RenderCoordinator: gpuContext.canvas is required.");
  const i = e.devicePixelRatio ?? 1, r = Number.isFinite(i) && i > 0 ? i : 1, o = n.width, s = n.height;
  if (!Number.isFinite(o) || !Number.isFinite(s))
    throw new Error(
      `RenderCoordinator: Invalid canvas dimensions: width=${o}, height=${s}. Canvas must be initialized with finite dimensions before rendering.`
    );
  const a = Math.max(1, Math.floor(o)), c = Math.max(1, Math.floor(s)), f = Number.isFinite(t.grid.left) ? t.grid.left : 0, l = Number.isFinite(t.grid.right) ? t.grid.right : 0, g = Number.isFinite(t.grid.top) ? t.grid.top : 0, u = Number.isFinite(t.grid.bottom) ? t.grid.bottom : 0, y = Math.max(0, f), p = Math.max(0, l), M = Math.max(0, g), R = Math.max(0, u);
  return {
    left: y,
    right: p,
    top: M,
    bottom: R,
    canvasWidth: a,
    // Device pixels (clamped above)
    canvasHeight: c,
    // Device pixels (clamped above)
    devicePixelRatio: r
    // Explicit DPR (validated above)
  };
}, If = (e) => {
  const t = Math.max(0, Math.min(255, Math.round(e[0] * 255))), n = Math.max(0, Math.min(255, Math.round(e[1] * 255))), i = Math.max(0, Math.min(255, Math.round(e[2] * 255))), r = Math.max(0, Math.min(1, e[3]));
  return `rgba(${t},${n},${i},${r})`;
}, Ds = (e, t) => {
  const n = yt(e);
  if (!n) return e;
  const i = Math.max(0, Math.min(1, n[3] * t));
  return If([n[0], n[1], n[2], i]);
}, Pf = (e) => {
  const { left: t, right: n, top: i, bottom: r, canvasWidth: o, canvasHeight: s, devicePixelRatio: a } = e, c = t * a, f = o - n * a, l = i * a, g = s - r * a, u = c / o * 2 - 1, y = f / o * 2 - 1, p = 1 - l / s * 2, M = 1 - g / s * 2;
  return {
    left: u,
    right: y,
    top: p,
    bottom: M
  };
}, rn = (e) => Math.min(1, Math.max(0, e)), Hn = (e, t, n) => Math.min(n, Math.max(t, e | 0)), yi = (e, t, n) => e + (t - e) * rn(n), ji = (e, t, n) => vi(yi(e.min, t.min, n), yi(e.max, t.max, n)), Rf = (e) => {
  const { canvasWidth: t, canvasHeight: n, devicePixelRatio: i } = e, r = e.left * i, o = t - e.right * i, s = e.top * i, a = n - e.bottom * i, c = Hn(Math.floor(r), 0, Math.max(0, t)), f = Hn(Math.floor(s), 0, Math.max(0, n)), l = Hn(Math.ceil(o), 0, Math.max(0, t)), g = Hn(Math.ceil(a), 0, Math.max(0, n)), u = Math.max(0, l - c), y = Math.max(0, g - f);
  return { x: c, y: f, w: u, h: y };
}, to = (e, t) => (e + 1) / 2 * t, Es = (e, t) => (1 - e) / 2 * t, sn = ar, gi = (e, t) => {
  if (typeof e == "number") return Number.isFinite(e) ? e : null;
  if (typeof e != "string") return null;
  const n = e.trim();
  if (n.length === 0) return null;
  if (n.endsWith("%")) {
    const r = Number.parseFloat(n.slice(0, -1));
    return Number.isFinite(r) ? r / 100 * t : null;
  }
  const i = Number.parseFloat(n);
  return Number.isFinite(i) ? i : null;
}, Df = (e, t, n) => {
  const i = (e == null ? void 0 : e[0]) ?? "50%", r = (e == null ? void 0 : e[1]) ?? "50%", o = gi(i, t), s = gi(r, n);
  return {
    x: Number.isFinite(o) ? o : t * 0.5,
    y: Number.isFinite(s) ? s : n * 0.5
  };
}, Ef = (e) => Array.isArray(e), Bf = (e, t) => {
  if (e == null) return { inner: 0, outer: t * 0.7 };
  if (Ef(e)) {
    const r = gi(e[0], t), o = gi(e[1], t), s = Math.max(0, Number.isFinite(r) ? r : 0), a = Math.max(s, Number.isFinite(o) ? o : t * 0.7);
    return { inner: s, outer: Math.min(t, a) };
  }
  const n = gi(e, t), i = Math.max(0, Number.isFinite(n) ? n : t * 0.7);
  return { inner: 0, outer: Math.min(t, i) };
}, Ht = (e) => String(Math.trunc(e)).padStart(2, "0"), Lf = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
], _f = (e, t) => {
  if (!Number.isFinite(e)) return null;
  (!Number.isFinite(t) || t < 0) && (t = 0);
  const n = new Date(e);
  if (!Number.isFinite(n.getTime())) return null;
  const i = n.getFullYear(), r = n.getMonth() + 1, o = n.getDate(), s = n.getHours(), a = n.getMinutes();
  return t < fr ? `${Ht(s)}:${Ht(a)}` : t <= 7 * fr ? `${Ht(r)}/${Ht(o)} ${Ht(s)}:${Ht(a)}` : t < 3 * vf ? `${Ht(r)}/${Ht(o)}` : t <= wf ? `${Lf[n.getMonth()] ?? Ht(r)} ${Ht(o)}` : `${i}/${Ht(r)}`;
}, rr = (e, t, n) => {
  const i = Math.max(1, Math.floor(n)), r = new Array(i);
  for (let o = 0; o < i; o++) {
    const s = i === 1 ? 0.5 : o / (i - 1);
    r[o] = e + s * (t - e);
  }
  return r;
}, kf = (e) => {
  const {
    axisMin: t,
    axisMax: n,
    xScale: i,
    plotClipLeft: r,
    plotClipRight: o,
    canvasCssWidth: s,
    visibleRangeMs: a,
    measureCtx: c,
    measureCache: f,
    fontSize: l,
    fontFamily: g,
    tickFormatter: u
  } = e, y = dr(t) ?? i.invert(r), p = dr(n) ?? i.invert(o);
  if (!c || s <= 0)
    return { tickCount: eo, tickValues: rr(y, p, eo) };
  c.font = `${l}px ${g}`, f && f.size > 2e3 && f.clear();
  const M = f ? `${l}px ${g}@@` : null;
  for (let R = Cf; R >= Vr; R--) {
    const D = rr(y, p, R);
    let T = Number.NEGATIVE_INFINITY, A = true;
    for (let b = 0; b < D.length; b++) {
      const m = D[b], x = u ? u(m) : _f(m, a);
      if (x == null) continue;
      const w = (() => {
        if (!M) return c.measureText(x).width;
        const h = M + x, F = f.get(h);
        if (F != null) return F;
        const S = c.measureText(x).width;
        return f.set(h, S), S;
      })(), v = i.scale(m), I = to(v, s), N = R === 1 ? "middle" : b === 0 ? "start" : b === D.length - 1 ? "end" : "middle", C = N === "start" ? I : N === "end" ? I - w : I - w * 0.5, d = N === "start" ? I + w : N === "end" ? I : I + w * 0.5;
      if (C < T + Mf) {
        A = false;
        break;
      }
      T = d;
    }
    if (A)
      return { tickCount: R, tickValues: D };
  }
  return { tickCount: Vr, tickValues: rr(y, p, Vr) };
}, Tn = (e, t) => {
  const n = pa(e.series, t), i = gn(e.xAxis.min) ?? n.xMin, r = gn(e.xAxis.max) ?? n.xMax;
  return vi(i, r);
}, Uf = (e) => {
  let t = Number.POSITIVE_INFINITY, n = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < e.length; i++) {
    const r = e[i];
    if (r.type === "pie") continue;
    if (r.type === "candlestick") {
      const a = r.data;
      for (let c = 0; c < a.length; c++) {
        const f = a[c], l = sn(f) ? f[3] : f.low, g = sn(f) ? f[4] : f.high;
        if (!Number.isFinite(l) || !Number.isFinite(g)) continue;
        const u = Math.min(l, g), y = Math.max(l, g);
        u < t && (t = u), y > n && (n = y);
      }
      continue;
    }
    const o = r.data, s = Ne(o);
    for (let a = 0; a < s; a++) {
      const c = _e(o, a);
      Number.isFinite(c) && (c < t && (t = c), c > n && (n = c));
    }
  }
  return !Number.isFinite(t) || !Number.isFinite(n) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (t === n && (n = t + 1), { xMin: 0, xMax: 1, yMin: t, yMax: n });
}, Wr = (e, t, n) => {
  const i = gn(e.yAxis.min), r = gn(e.yAxis.max);
  if (i !== void 0 && r !== void 0)
    return vi(i, r);
  const o = e.yAxis.autoBounds ?? "visible";
  let s;
  o === "visible" && n ? s = n : s = pa(e.series, t);
  const a = i ?? s.yMin, c = r ?? s.yMax;
  return vi(a, c);
}, An = (e, t) => {
  if (!t) return { ...e, spanFraction: 1 };
  const n = e.max - e.min;
  if (!Number.isFinite(n) || n === 0) return { ...e, spanFraction: 1 };
  const i = t.start, r = t.end, o = e.min + i / 100 * n, s = e.min + r / 100 * n, a = vi(o, s), c = (r - i) / 100, f = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 1;
  return { min: a.min, max: a.max, spanFraction: f };
}, ha = (e) => {
  if (e === false || e == null) return null;
  const t = e === true ? {} : e;
  if (!t) return null;
  const n = t.duration ?? 300, i = t.delay ?? 0, r = Number.isFinite(n) ? Math.max(0, n) : 300, o = Number.isFinite(i) ? Math.max(0, i) : 0;
  return {
    durationMs: r,
    delayMs: o,
    easing: yf(t.easing)
  };
}, Gf = (e) => ha(e), zf = (e) => ha(e), Or = (e, t, n, i, r) => {
  const o = e.point, s = sn(o) ? o[0] : o.timestamp, a = sn(o) ? o[1] : o.open, c = sn(o) ? o[2] : o.close;
  if (!Number.isFinite(s) || !Number.isFinite(a) || !Number.isFinite(c))
    return null;
  const f = (a + c) / 2, l = t.scale(s), g = n.scale(f);
  if (!Number.isFinite(l) || !Number.isFinite(g))
    return null;
  const u = i.left + l, y = i.top + g, p = Yn(r) ? r.offsetLeft + u : u, M = Yn(r) ? r.offsetTop + y : y;
  return !Number.isFinite(p) || !Number.isFinite(M) ? null : { x: p, y: M };
}, Bs = (e) => {
  let t = Number.POSITIVE_INFINITY, n = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < e.length; i++) {
    const r = e[i].data, o = Ne(r);
    for (let s = 0; s < o; s++) {
      const a = _e(r, s);
      Number.isFinite(a) && (a < t && (t = a), a > n && (n = a));
    }
  }
  return !Number.isFinite(t) || !Number.isFinite(n) || t <= 0 && 0 <= n ? 0 : Math.abs(t) < Math.abs(n) ? t : n;
}, Vf = (e, t, n) => {
  const i = t.invert(n.bottom), r = t.invert(n.top), o = Math.min(i, r), s = Math.max(i, r);
  return !Number.isFinite(o) || !Number.isFinite(s) ? Bs(e) : o <= 0 && 0 <= s ? 0 : o > 0 ? o : s < 0 ? s : Bs(e);
}, Wf = (e, t, n, i) => {
  const r = rn(i);
  if (r >= 1) return e;
  const o = Vf(n, e, t), s = e.scale(o), a = {
    domain(c, f) {
      return e.domain(c, f), a;
    },
    range(c, f) {
      return e.range(c, f), a;
    },
    scale(c) {
      const f = e.scale(c);
      return !Number.isFinite(f) || !Number.isFinite(s) ? f : s + (f - s) * r;
    },
    invert(c) {
      return e.invert(c);
    }
  };
  return a;
};
function Of(e, t, n) {
  var uo, fo, mo;
  if (!e.initialized)
    throw new Error("RenderCoordinator: gpuContext must be initialized.");
  const i = e.device;
  if (!i)
    throw new Error("RenderCoordinator: gpuContext.device is required.");
  if (!e.canvas)
    throw new Error("RenderCoordinator: gpuContext.canvas is required.");
  if (!e.canvasContext)
    throw new Error("RenderCoordinator: gpuContext.canvasContext is required.");
  const r = e.preferredFormat ?? bf, o = n == null ? void 0 : n.pipelineCache, s = Yn(e.canvas) ? e.canvas.parentElement : null, a = s ? Ms(s) : null, c = s ? Ms(s, { clip: true }) : null, f = (k, O) => {
    if (y) return;
    const G = p.series;
    if (k < 0 || k >= G.length) return;
    const H = G[k];
    if (!H) return;
    if (O !== void 0 && H.type === "pie") {
      const ie = H.data;
      if (O < 0 || O >= ie.length) return;
      const se = ie.map(
        (ne, Re) => Re === O ? { ...ne, visible: ne.visible === false } : ne
      ), he = G.map(
        (ne, Re) => Re === k ? { ...ne, data: se } : ne
      );
      Ge({ ...p, series: he });
      return;
    }
    const Q = G.map(
      (ie, se) => se === k ? { ...ie, visible: ie.visible === false } : ie
    );
    Ge({ ...p, series: Q });
  }, l = s && ((uo = t.legend) == null ? void 0 : uo.show) !== false ? cf(s, (fo = t.legend) == null ? void 0 : fo.position, f) : null, g = (() => {
    if (typeof document > "u")
      return null;
    try {
      return document.createElement("canvas").getContext("2d");
    } catch {
      return null;
    }
  })(), u = g ? /* @__PURE__ */ new Map() : null;
  let y = false, p = t, M = t.series.length, R = "pending", D = 0;
  const T = As();
  let A = null, b = false;
  const m = As();
  let x = null, w = 1, v = null;
  const I = {
    cartesianDataBySeriesIndex: [],
    pieDataBySeriesIndex: []
  }, N = () => {
    I.cartesianDataBySeriesIndex.length = 0, I.pieDataBySeriesIndex.length = 0;
  }, C = (k, O, G, H, Q) => {
    if (G === 0) return Q ?? [];
    const ie = Q && Q.length === G ? Q : (() => {
      const he = new Array(G);
      for (let ne = 0; ne < G; ne++) {
        const Re = Fe(O, ne);
        he[ne] = [Re, 0];
      }
      return he;
    })(), se = rn(H);
    for (let he = 0; he < G; he++) {
      const ne = Fe(k, he), Re = Fe(O, he), Se = _e(k, he), Me = _e(O, he), Ae = Number.isFinite(ne) && Number.isFinite(Re) ? yi(ne, Re, se) : Re, De = Number.isFinite(Se) && Number.isFinite(Me) ? yi(Se, Me, se) : Me, Ee = ie[he];
      ma(Ee) ? (Ee[0] = Ae, Ee[1] = De) : (Ee.x = Ae, Ee.y = De);
    }
    return ie;
  }, d = (k, O, G, H) => {
    var Re, Se;
    const Q = k.data, ie = O.data;
    if (Q.length !== ie.length) return O;
    const se = ie.length, he = H && H.length === se ? H : (() => {
      const Me = new Array(se);
      for (let Ae = 0; Ae < se; Ae++)
        Me[Ae] = { ...ie[Ae], value: 0 };
      return Me;
    })(), ne = rn(G);
    for (let Me = 0; Me < se; Me++) {
      const Ae = (Re = Q[Me]) == null ? void 0 : Re.value, De = (Se = ie[Me]) == null ? void 0 : Se.value, Ee = typeof Ae == "number" && typeof De == "number" && Number.isFinite(Ae) && Number.isFinite(De) ? Math.max(0, yi(Ae, De, ne)) : typeof De == "number" && Number.isFinite(De) ? De : 0;
      he[Me].value = Ee;
    }
    return { ...O, data: he };
  }, h = (k, O, G, H) => {
    if (k.length !== O.length) return O;
    const Q = new Array(O.length);
    for (let ie = 0; ie < O.length; ie++) {
      const se = k[ie], he = O[ie];
      if (se.type !== he.type) {
        Q[ie] = he;
        continue;
      }
      if (he.type === "pie") {
        const Ee = (H == null ? void 0 : H.pieDataBySeriesIndex[ie]) ?? null, Nt = d(se, he, G, Ee);
        H && (H.pieDataBySeriesIndex[ie] = Nt.data), Q[ie] = Nt;
        continue;
      }
      const ne = se.data, Re = he.data, Se = Ne(ne), Me = Ne(Re);
      if (Se !== Me) {
        Q[ie] = he;
        continue;
      }
      if (Me > Sf) {
        Q[ie] = he;
        continue;
      }
      const Ae = (H == null ? void 0 : H.cartesianDataBySeriesIndex[ie]) ?? null, De = C(ne, Re, Se, G, Ae);
      if (!De) {
        Q[ie] = he;
        continue;
      }
      H && (H.cartesianDataBySeriesIndex[ie] = De), Q[ie] = { ...he, data: De };
    }
    return Q;
  }, F = (k, O, G) => {
    const H = ji(k.from.xBaseDomain, k.to.xBaseDomain, O), Q = An(H, G), ie = ji(k.from.yBaseDomain, k.to.yBaseDomain, O), se = h(k.from.series, k.to.series, O, null);
    return {
      xBaseDomain: H,
      xVisibleDomain: { min: Q.min, max: Q.max },
      yBaseDomain: ie,
      series: se
    };
  }, S = /* @__PURE__ */ new Set(), P = /* @__PURE__ */ new Set();
  let B = new Array(t.series.length).fill(null), E = new Array(t.series.length).fill(null), z = p.series, U = p.series, Y = null;
  const j = (k) => {
    if ((k.yAxis.autoBounds ?? "visible") !== "visible") return false;
    const G = gn(k.yAxis.min), H = gn(k.yAxis.max);
    return !(G !== void 0 && H !== void 0);
  }, q = () => {
    j(p) ? Y = Uf(U) : Y = null;
  };
  let Z = [], J = false, re = null, W = null, de = null, L = false, X = false;
  const $ = /* @__PURE__ */ new Map();
  let ue = new Array(p.series.length).fill("unknown");
  const ce = /* @__PURE__ */ new Set();
  let fe = s && ((mo = p.tooltip) == null ? void 0 : mo.show) !== false ? Ts(s) : null, K = null, ae = null, ee = null;
  const te = (k, O, G, H) => {
    fe == null || fe.show(k, O, G);
  }, be = () => {
    fe == null || fe.hide();
  }, le = () => {
    K = null, ae = null, ee = null, be();
  };
  ((k, O) => {
    l == null || l.update(k, O);
  })(p.series, p.theme);
  let pe = Ta(i);
  const Be = rl(i, { targetFormat: r, sampleCount: Xn, pipelineCache: o }), Le = Oo(i, { targetFormat: r, pipelineCache: o }), rt = Oo(i, { targetFormat: r, pipelineCache: o }), ot = Nu(i, { targetFormat: r, pipelineCache: o });
  ot.setVisible(false);
  const ve = Du(i, { targetFormat: r, pipelineCache: o });
  ve.setVisible(false);
  const Te = ps(i, { targetFormat: r, sampleCount: Xn, pipelineCache: o }), Xe = gs(i, { targetFormat: r, sampleCount: Xn, pipelineCache: o }), Ke = ps(i, {
    targetFormat: r,
    sampleCount: hi,
    pipelineCache: o
  }), We = gs(i, {
    targetFormat: r,
    sampleCount: hi,
    pipelineCache: o
  }), mt = uu({ device: i, targetFormat: r, pipelineCache: o }), ft = Rs(e, p), ke = Yn(e.canvas) ? Gu(e.canvas, ft) : null;
  let ct = {
    source: "mouse",
    x: 0,
    y: 0,
    gridX: 0,
    gridY: 0,
    isInGrid: false,
    hasPointer: false
  }, At = null, Vt;
  const gt = /* @__PURE__ */ new Set();
  let _t = null;
  const Wt = (k, O) => {
    const G = Array.from(gt);
    for (const H of G) H(k, O);
  }, kt = (k, O) => {
    const G = k !== null && Number.isFinite(k) ? k : null;
    At === G && Vt === O || (At = G, Vt = O, Wt(At, Vt));
  }, vt = () => {
    var k;
    (k = n == null ? void 0 : n.onRequestRender) == null || k.call(n);
  }, Jt = (k) => k ? Number.isFinite(k.start) && Number.isFinite(k.end) && k.start <= 0 && k.end >= 100 : true, Et = () => {
    re !== null && (cancelAnimationFrame(re), re = null), W !== null && (clearTimeout(W), W = null), J = false;
  }, It = () => {
    de !== null && (clearTimeout(de), de = null);
  }, bn = () => {
    var he;
    if ($.size === 0) return false;
    ce.clear();
    const k = (V == null ? void 0 : V.getRange()) ?? null, O = Jt(k), G = p.autoScroll === true && V != null && p.xAxis.min == null && p.xAxis.max == null, H = Tn(p, E), Q = k ? An(H, k) : null;
    let ie = false;
    for (const [ne, Re] of $) {
      if (Re.length === 0) continue;
      const Se = p.series[ne];
      if (!(!Se || Se.type === "pie")) {
        if (ie = true, Se.type === "candlestick") {
          let Me = B[ne];
          if (!Me) {
            const Ae = Se.rawData ?? Se.data;
            Me = Ae.length === 0 ? [] : Ae.slice(), B[ne] = Me, E[ne] = Se.rawBounds ?? null;
          }
          for (const Ae of Re) {
            const De = Ae;
            Me.push(...De), E[ne] = Af(
              E[ne],
              De
            );
          }
        } else {
          let Me = B[ne];
          if (!Me) {
            const De = Se.rawData ?? Se.data;
            Me = Ps(De), B[ne] = Me, E[ne] = Se.rawBounds ?? zt(De);
          }
          const Ae = Se.type === "line" && Se.sampling === "none" && O && ue[ne] === "fullRawLine";
          for (const De of Re) {
            const Ee = De;
            if (Ae)
              try {
                pe.appendSeries(ne, Ee), ce.add(ne);
              } catch {
              }
            else Se.type === "line" && Se.sampling !== "none" && !P.has(ne) && (P.add(ne), console.warn(
              `[ChartGPU] appendData() on series ${ne} with sampling='${Se.sampling}' causes full buffer re-upload every frame. For optimal streaming performance, use sampling='none'. See docs/internal/INCREMENTAL_APPEND_OPTIMIZATION.md for details.`
            ));
            const Nt = Ne(Ee), en = Me.x.length;
            for (let nt = 0; nt < Nt; nt++) {
              Me.x.push(Fe(Ee, nt)), Me.y.push(_e(Ee, nt));
              const Ut = at(Ee, nt);
              Ut !== void 0 ? (Me.size || (Me.size = new Array(en + nt)), Me.size.push(Ut)) : Me.size && Me.size.push(void 0);
            }
            E[ne] = Tf(
              E[ne],
              Ee
            );
          }
        }
        Z[ne] = null;
      }
    }
    if ($.clear(), !ie) return false;
    if (G && (Ie = "auto-scroll"), V) {
      const ne = Ue(), Re = V;
      (he = Re.setSpanConstraints) == null || he.call(Re, ne.minSpan, ne.maxSpan);
    }
    if (G && k && Q) {
      Ie = "auto-scroll";
      const ne = k;
      if (ne.end >= 99.5) {
        const Re = ne.end - ne.start, Se = V;
        Se.setRangeAnchored ? Se.setRangeAnchored(100 - Re, 100, "end") : V.setRange(100 - Re, 100);
      } else {
        const Re = Tn(p, E), Se = Re.max - Re.min;
        if (Number.isFinite(Se) && Se > 0) {
          const Me = (Q.min - Re.min) / Se * 100, Ae = (Q.max - Re.min) / Se * 100, De = Math.max(0, Math.min(100, Me)), Ee = Math.max(0, Math.min(100, Ae));
          V.setRange(De, Ee);
        }
      }
    }
    G && (Ie = void 0), Ct();
    const se = (V == null ? void 0 : V.getRange()) ?? null;
    return (se == null || Jt(se)) && (U = z, q()), true;
  }, vn = (k) => {
    if (y) return;
    const O = (k == null ? void 0 : k.requestRenderAfter) ?? true, G = bn(), H = (V == null ? void 0 : V.getRange()) ?? null, Q = Jt(H), ie = H != null && !Q;
    let se = false;
    L ? (L = false, It(), !H || Q ? (U = z, q()) : wt(), se = true) : G && ie && (L = false, It(), wt(), se = true), (G || se) && O && vt();
  }, Kn = (k) => {
    y || J || (re !== null && (cancelAnimationFrame(re), re = null), W !== null && (clearTimeout(W), W = null), J = true, re = requestAnimationFrame(() => {
      if (re = null, y) {
        Et();
        return;
      }
      W !== null && (clearTimeout(W), W = null), J = false, vn();
    }), W = (typeof self < "u" ? self : window).setTimeout(() => {
      if (y) {
        Et();
        return;
      }
      J && (re !== null && (cancelAnimationFrame(re), re = null), J = false, W = null, vn());
    }, 16));
  }, wi = () => {
    y || (It(), L = false, de = (typeof self < "u" ? self : window).setTimeout(() => {
      de = null, !y && (L = true, Kn());
    }, 100));
  }, Jn = (k, O) => {
    let G, H;
    const Q = k.getBoundingClientRect();
    if (!(Q.width > 0) || !(Q.height > 0)) return null;
    G = Q.width, H = Q.height;
    const ie = G - O.left - O.right, se = H - O.top - O.bottom;
    return !(ie > 0) || !(se > 0) ? null : { plotWidthCss: ie, plotHeightCss: se };
  }, Ci = (k, O) => {
    const G = e.canvas;
    if (!G) return null;
    const H = Jn(G, k);
    if (!H) return null;
    const Q = yn().domain(O.xDomain.min, O.xDomain.max).range(0, H.plotWidthCss), ie = yn().domain(O.yDomain.min, O.yDomain.max).range(H.plotHeightCss, 0);
    return { xScale: Q, yScale: ie, plotWidthCss: H.plotWidthCss, plotHeightCss: H.plotHeightCss };
  }, wn = (k, O, G) => {
    const H = p.series[k], { x: Q, y: ie } = Nf(G);
    return {
      seriesName: (H == null ? void 0 : H.name) ?? "",
      seriesIndex: k,
      dataIndex: O,
      value: [Q, ie],
      color: (H == null ? void 0 : H.color) ?? "#888"
    };
  }, Mi = (k, O, G) => {
    const H = p.series[k];
    return sn(G) ? {
      seriesName: (H == null ? void 0 : H.name) ?? "",
      seriesIndex: k,
      dataIndex: O,
      value: [G[0], G[1], G[2], G[3], G[4]],
      color: (H == null ? void 0 : H.color) ?? "#888"
    } : {
      seriesName: (H == null ? void 0 : H.name) ?? "",
      seriesIndex: k,
      dataIndex: O,
      value: [G.timestamp, G.open, G.close, G.low, G.high],
      color: (H == null ? void 0 : H.color) ?? "#888"
    };
  }, Qn = (k, O, G, H, Q) => {
    const ie = 0.5 * Math.min(H, Q);
    if (!(ie > 0)) return null;
    for (let se = k.length - 1; se >= 0; se--) {
      const he = k[se];
      if (he.type !== "pie" || he.visible === false) continue;
      const ne = he, Re = Df(ne.center, H, Q), Se = Bf(ne.radius, ie), Me = Qr(O, G, { seriesIndex: se, series: ne }, Re, Se);
      if (Me) return Me;
    }
    return null;
  }, ei = (k, O, G, H) => {
    for (let Q = k.length - 1; Q >= 0; Q--) {
      const ie = k[Q];
      if (ie.type !== "candlestick" || ie.visible === false) continue;
      const se = ie, he = Kr(
        se,
        se.data,
        H.xScale,
        H.plotWidthCss
      ), ne = Jr(
        [se],
        O,
        G,
        H.xScale,
        H.yScale,
        he
      );
      if (!ne) continue;
      return { params: Mi(Q, ne.dataIndex, ne.point), match: { point: ne.point }, seriesIndex: Q };
    }
    return null;
  }, Si = (k) => {
    if (ct = {
      source: "mouse",
      x: k.x,
      y: k.y,
      gridX: k.gridX,
      gridY: k.gridY,
      isInGrid: k.isInGrid,
      hasPointer: true
    }, k.isInGrid && _t) {
      const O = _t.xScale.invert(k.gridX);
      kt(Number.isFinite(O) ? O : null, "mouse");
    } else k.isInGrid || kt(null, "mouse");
    ot.setVisible(k.isInGrid), vt();
  }, _ = (k) => {
    ct.source === "mouse" && (ct = { ...ct, isInGrid: false, hasPointer: false }, ot.setVisible(false), le(), kt(null, "mouse"), vt());
  };
  ke && (ke.on("mousemove", Si), ke.on("mouseleave", _));
  let V = null, oe = null, ge = null, we = null, Ie;
  const me = /* @__PURE__ */ new Set(), xe = (k, O) => {
    const G = Array.from(me);
    for (const H of G) H(k, O);
  }, Pe = (k) => {
    var se, he;
    const O = (se = k.dataZoom) == null ? void 0 : se.find((ne) => (ne == null ? void 0 : ne.type) === "inside"), G = (he = k.dataZoom) == null ? void 0 : he.find((ne) => (ne == null ? void 0 : ne.type) === "slider"), H = O ?? G;
    if (!H) return null;
    const Q = Number.isFinite(H.start) ? H.start : 0, ie = Number.isFinite(H.end) ? H.end : 100;
    return { start: Q, end: ie, hasInside: !!O };
  }, Ce = (k) => Math.min(100, Math.max(0, k)), et = (k) => {
    let O = null, G = null;
    const H = k.dataZoom ?? [];
    for (const Q of H)
      if (Q && !(Q.type !== "inside" && Q.type !== "slider")) {
        if (Number.isFinite(Q.minSpan)) {
          const ie = Ce(Q.minSpan);
          O = O == null ? ie : Math.max(O, ie);
        }
        if (Number.isFinite(Q.maxSpan)) {
          const ie = Ce(Q.maxSpan);
          G = G == null ? ie : Math.min(G, ie);
        }
      }
    return { minSpan: O ?? void 0, maxSpan: G ?? void 0 };
  }, St = () => {
    if (p.xAxis.type === "category") return null;
    let k = 0;
    for (let G = 0; G < p.series.length; G++) {
      const H = p.series[G];
      if (H.type === "pie") continue;
      if (H.type === "candlestick") {
        const se = B[G] ?? H.rawData ?? H.data;
        k = Math.max(k, se.length);
        continue;
      }
      const Q = B[G] ?? null, ie = Q ? Q.x.length : Ne(H.rawData ?? H.data);
      k = Math.max(k, ie);
    }
    if (k < 2) return null;
    const O = 100 / (k - 1);
    return Number.isFinite(O) ? Ce(O) : null;
  }, Ue = () => {
    const k = et(p), O = St(), G = Number.isFinite(k.minSpan) ? Ce(k.minSpan) : O ?? 0.5, H = Number.isFinite(k.maxSpan) ? Ce(k.maxSpan) : 100;
    return { minSpan: G, maxSpan: H };
  }, ze = () => {
    var O;
    const k = Pe(p);
    if (!k) {
      oe == null || oe.dispose(), oe = null, ge == null || ge(), ge = null, V = null, we = null;
      return;
    }
    if (V) {
      const G = Ue(), H = V;
      (O = H.setSpanConstraints) == null || O.call(H, G.minSpan, G.maxSpan), (we == null || we.start !== k.start || we.end !== k.end) && (V.setRange(k.start, k.end), we = { start: k.start, end: k.end });
    } else {
      const G = Ue();
      V = Zu(k.start, k.end, G), we = { start: k.start, end: k.end }, ge = V.onChange((H) => {
        X = true, vt(), wi();
        const Q = Ie;
        xe({ start: H.start, end: H.end }, Q), Ie = void 0;
      });
    }
    k.hasInside && ke ? oe || (oe = $u(ke, V), oe.enable()) : (oe == null || oe.dispose(), oe = null);
  }, st = () => {
    const k = p.series.length;
    B = new Array(k).fill(null), E = new Array(k).fill(null), $.clear();
    for (let O = 0; O < k; O++) {
      const G = p.series[O];
      if (G.type === "pie") continue;
      if (G.type === "candlestick") {
        const ie = G.rawData ?? G.data, se = ie.length === 0 ? [] : ie.slice();
        B[O] = se, E[O] = G.rawBounds ?? null;
        continue;
      }
      const H = G.rawData ?? G.data, Q = Ps(H);
      B[O] = Q, E[O] = G.rawBounds ?? zt(H);
    }
  }, Ct = () => {
    const k = new Array(p.series.length);
    for (let O = 0; O < p.series.length; O++) {
      const G = p.series[O];
      if (G.type === "pie") {
        k[O] = G;
        continue;
      }
      if (G.type === "candlestick") {
        const se = B[O] ?? G.rawData ?? G.data, he = E[O] ?? G.rawBounds ?? void 0, ne = G.sampling === "ohlc" && se.length > G.samplingThreshold ? Zr(se, G.samplingThreshold) : se;
        k[O] = { ...G, rawData: se, rawBounds: he, data: ne };
        continue;
      }
      const H = B[O] ?? G.rawData ?? G.data, Q = E[O] ?? G.rawBounds ?? void 0, ie = Wn(H, G.sampling, G.samplingThreshold);
      k[O] = { ...G, rawData: H, rawBounds: Q, data: ie };
    }
    z = k;
  };
  function an() {
    const k = (V == null ? void 0 : V.getRange()) ?? null, O = Tn(p, E), G = An(O, k);
    if (k == null || Number.isFinite(k.start) && Number.isFinite(k.end) && k.start <= 0 && k.end >= 100) {
      U = z, q();
      return;
    }
    const Q = new Array(z.length);
    for (let ie = 0; ie < z.length; ie++) {
      const se = z[ie];
      if (se.type === "pie") {
        Q[ie] = se;
        continue;
      }
      const he = Z[ie];
      if (he && G.min >= he.cachedRange.min && G.max <= he.cachedRange.max) {
        se.type === "candlestick" ? Q[ie] = {
          ...se,
          data: Bi(he.data, G.min, G.max)
        } : Q[ie] = {
          ...se,
          data: Ei(he.data, G.min, G.max)
        };
        continue;
      }
      se.type === "candlestick" ? Q[ie] = {
        ...se,
        data: Bi(se.data, G.min, G.max)
      } : Q[ie] = {
        ...se,
        data: Ei(se.data, G.min, G.max)
      };
    }
    U = Q, q();
  }
  function wt() {
    const k = (V == null ? void 0 : V.getRange()) ?? null, O = Tn(p, E), G = An(O, k), ie = (G.max - G.min) * 0.1, se = G.min - ie, he = G.max + ie, ne = 2, Re = 2e5, Se = 32, Me = Math.max(1e-3, Math.min(1, G.spanFraction)), Ae = new Array(z.length);
    for (let De = 0; De < z.length; De++) {
      const Ee = z[De];
      if (Ee.type === "pie") {
        Ae[De] = Ee;
        continue;
      }
      if (k == null || Number.isFinite(k.start) && Number.isFinite(k.end) && k.start <= 0 && k.end >= 100) {
        Ae[De] = Ee;
        continue;
      }
      if (Ee.type === "candlestick") {
        const Ti = B[De] ?? Ee.rawData ?? Ee.data, En = Bi(Ti, se, he), yr = Ee.sampling, ti = Ee.samplingThreshold, Ai = Number.isFinite(ti) ? Math.max(1, ti | 0) : 1, gr = Math.min(Re, Math.max(ne, Ai * Se)), ni = Hn(Math.round(Ai / Me), ne, gr), Bn = yr === "ohlc" && En.length > ni ? Zr(En, ni) : En;
        Z[De] = {
          data: Bn,
          cachedRange: { min: se, max: he },
          timestamp: Date.now()
        };
        const ii = Bi(Bn, G.min, G.max);
        Ae[De] = { ...Ee, data: ii };
        continue;
      }
      const en = B[De] ?? Ee.rawData ?? Ee.data, nt = Ei(en, se, he), Ut = Ee.sampling, tn = Ee.samplingThreshold, Cn = Number.isFinite(tn) ? Math.max(1, tn | 0) : 1, Fi = Math.min(Re, Math.max(ne, Cn * Se)), hr = Hn(Math.round(Cn / Me), ne, Fi), Pt = Wn(nt, Ut, hr);
      Z[De] = {
        data: Pt,
        cachedRange: { min: se, max: he },
        timestamp: Date.now()
      };
      const Ni = Ei(Pt, G.min, G.max);
      Ae[De] = { ...Ee, data: Ni };
    }
    U = Ae, q();
  }
  st(), Ct(), ze(), wt(), Z = new Array(p.series.length).fill(null);
  const qe = lu({ device: i, targetFormat: r, pipelineCache: o, sampleCount: Xn });
  qe.ensureAreaRendererCount(p.series.length), qe.ensureLineRendererCount(p.series.length), qe.ensureScatterRendererCount(p.series.length), qe.ensureScatterDensityRendererCount(p.series.length), qe.ensurePieRendererCount(p.series.length), qe.ensureCandlestickRendererCount(p.series.length);
  const cn = () => {
    if (y) throw new Error("RenderCoordinator is disposed.");
  }, Bt = () => {
    if (x)
      try {
        m.cancel(x);
      } catch {
      }
    x = null, w = 1, v = null, N();
  }, Qt = (k, O) => k.min === O.min && k.max === O.max, ln = (k, O) => {
    if (k.length !== O.length) return true;
    for (let G = 0; G < k.length; G++) {
      const H = k[G], Q = O[G];
      if (H.type !== Q.type) return true;
      if (H.type === "pie") {
        const ie = H, se = Q;
        if (ie.data !== se.data || ie.data.length !== se.data.length) return true;
      } else {
        const ie = H, se = Q, he = ie.rawData ?? ie.data, ne = se.rawData ?? se.data;
        if (he !== ne || he.length !== ne.length) return true;
      }
    }
    return false;
  }, Ge = (k) => {
    var en;
    cn();
    const O = (V == null ? void 0 : V.getRange()) ?? null, G = (() => {
      if (v && x) {
        try {
          m.update(performance.now());
        } catch {
        }
        return F(v, w, O);
      }
      const nt = Tn(p, E), Ut = An(nt, O), tn = Wr(p, E, Y);
      return {
        xBaseDomain: nt,
        xVisibleDomain: { min: Ut.min, max: Ut.max },
        yBaseDomain: tn,
        series: U
      };
    })();
    Bt();
    const H = ln(p.series, k.series);
    if (p = k, H && (z = k.series, U = k.series, ue = new Array(k.series.length).fill("unknown"), Z = new Array(k.series.length).fill(null), It(), L = false, Et(), st()), Y = null, l == null || l.update(k.series, k.theme), Ct(), ze(), wt(), s) {
      const nt = ((en = p.tooltip) == null ? void 0 : en.show) !== false;
      nt && !fe && (fe = Ts(s), K = null, ae = null, ee = null), !nt && fe && le();
    } else
      le();
    const Q = k.series.length;
    if (qe.ensureAreaRendererCount(Q), qe.ensureLineRendererCount(Q), qe.ensureScatterRendererCount(Q), qe.ensureScatterDensityRendererCount(Q), qe.ensurePieRendererCount(Q), qe.ensureCandlestickRendererCount(Q), Q < M)
      for (let nt = Q; nt < M; nt++)
        pe.removeSeries(nt);
    if (M = Q, p.animation === false && R === "running" && (T.cancelAll(), A = null, R = "done", D = 1), p.animation === false) {
      Bt(), vt();
      return;
    }
    const ie = (V == null ? void 0 : V.getRange()) ?? null, se = Tn(p, E), he = An(se, ie), ne = Wr(p, E, Y), Re = U, Se = !Qt(G.xBaseDomain, se) || !Qt(G.yBaseDomain, ne);
    if (!(b && (Se || H))) {
      vt();
      return;
    }
    const Ae = zf(p.animation);
    if (!Ae) return;
    v = {
      from: {
        xBaseDomain: G.xBaseDomain,
        xVisibleDomain: G.xVisibleDomain,
        yBaseDomain: G.yBaseDomain,
        series: G.series
      },
      to: {
        xBaseDomain: se,
        xVisibleDomain: { min: he.min, max: he.max },
        yBaseDomain: ne,
        series: Re
      }
    }, N();
    const De = Ae.delayMs + Ae.durationMs, Ee = (nt) => {
      const Ut = rn(nt);
      if (!(De > 0)) return 1;
      const tn = Ut * De;
      if (tn <= Ae.delayMs) return 0;
      if (!(Ae.durationMs > 0)) return 1;
      const Cn = (tn - Ae.delayMs) / Ae.durationMs;
      return Ae.easing(Cn);
    };
    w = 0;
    const Nt = m.animate(
      0,
      1,
      De,
      Ee,
      (nt) => {
        y || x !== Nt || (w = rn(nt), w < 1 && vt());
      },
      () => {
        y || x !== Nt || (w = 1, v = null, x = null, N());
      }
    );
    x = Nt, vt();
  };
  return {
    setOptions: Ge,
    appendData: (k, O) => {
      if (cn(), !Number.isFinite(k) || k < 0 || k >= p.series.length || !O) return;
      const G = p.series[k];
      if (G.type === "pie") {
        S.has(k) || (S.add(k), console.warn(
          `RenderCoordinator.appendData(${k}, ...): pie series are not supported by streaming append.`
        ));
        return;
      }
      if ((G.type === "candlestick" ? O.length : Ne(O)) === 0) return;
      const Q = $.get(k);
      Q ? Q.push(O) : $.set(k, [O]), Kn();
    },
    getInteractionX: () => At,
    setInteractionX: (k, O) => {
      cn();
      const G = k !== null && Number.isFinite(k) ? k : null;
      ct = { ...ct, source: G === null ? "mouse" : "sync" }, kt(G, O), G === null && ct.hasPointer === false && (ot.setVisible(false), ve.setVisible(false), be()), vt();
    },
    onInteractionXChange: (k) => (cn(), gt.add(k), () => {
      gt.delete(k);
    }),
    getZoomRange: () => (V == null ? void 0 : V.getRange()) ?? null,
    setZoomRange: (k, O) => {
      cn(), V && V.setRange(k, O);
    },
    onZoomRangeChange: (k) => (cn(), me.add(k), () => {
      me.delete(k);
    }),
    render: () => {
      var bo, vo, wo;
      if (cn(), !e.canvasContext || !e.canvas) return;
      ($.size > 0 || L) && (Et(), vn({ requestRenderAfter: false })), X && (X = false, an());
      const k = p.series.some((Ve) => Ve.type !== "pie"), O = U;
      if (R !== "done") {
        const Ve = Gf(p.animation), Ze = (() => {
          for (let Gt = 0; Gt < O.length; Gt++) {
            const tt = O[Gt];
            switch (tt.type) {
              case "pie": {
                if (tt.data.some(($e) => typeof ($e == null ? void 0 : $e.value) == "number" && Number.isFinite($e.value) && $e.value > 0))
                  return true;
                break;
              }
              case "line":
              case "area":
              case "bar":
              case "scatter": {
                if (Ne(tt.data) > 0) return true;
                break;
              }
              case "candlestick": {
                if (tt.data.length > 0) return true;
                break;
              }
              default:
                Ff(tt);
            }
          }
          return false;
        })();
        if (R === "pending" && Ve && Ze) {
          const Gt = Ve.delayMs + Ve.durationMs, tt = ($e) => {
            const xt = rn($e);
            if (!(Gt > 0)) return 1;
            const He = xt * Gt;
            if (He <= Ve.delayMs) return 0;
            if (!(Ve.durationMs > 0)) return 1;
            const Ye = (He - Ve.delayMs) / Ve.durationMs;
            return Ve.easing(Ye);
          };
          D = 0, R = "running", A = T.animate(
            0,
            1,
            Gt,
            tt,
            ($e) => {
              y || R !== "running" || (D = rn($e), D < 1 && vt());
            },
            () => {
              y || (R = "done", D = 1, A = null);
            }
          );
        }
        T.update(performance.now());
      }
      v !== null && x && m.update(performance.now());
      const G = Rs(e, p);
      ke == null || ke.updateGridArea(G);
      const H = (V == null ? void 0 : V.getRange()) ?? null, Q = v ? rn(w) : 1, ie = v ? ji(v.from.xBaseDomain, v.to.xBaseDomain, Q) : Tn(p, E), se = v ? ji(v.from.yBaseDomain, v.to.yBaseDomain, Q) : Wr(p, E, Y), he = An(ie, H), ne = Pf(G), Re = Rf(G), Se = yn().domain(he.min, he.max).range(ne.left, ne.right), Me = yn().domain(se.min, se.max).range(ne.bottom, ne.top), Ae = e.canvas, De = xf(Ae), Ee = De.width, Nt = De.height, en = Ee > 0 ? to(ne.left, Ee) : 0, nt = Ee > 0 ? to(ne.right, Ee) : 0, Ut = Nt > 0 ? Es(ne.top, Nt) : 0, tn = Nt > 0 ? Es(ne.bottom, Nt) : 0, Cn = Math.max(0, nt - en), Fi = Math.max(0, tn - Ut), hr = k ? p.annotations ?? [] : [], Pt = Ec({
        annotations: hr,
        xScale: Se,
        yScale: Me,
        plotBounds: {
          leftCss: en,
          rightCss: nt,
          topCss: Ut,
          bottomCss: tn,
          widthCss: Cn,
          heightCss: Fi
        },
        canvasCssWidth: Ee,
        canvasCssHeight: Nt,
        theme: p.theme
      }), Ni = Pt.linesBelow.length + Pt.linesAbove.length > 0 ? [...Pt.linesBelow, ...Pt.linesAbove] : [], Ti = Pt.markersBelow.length + Pt.markersAbove.length > 0 ? [...Pt.markersBelow, ...Pt.markersAbove] : [], En = Pt.linesBelow.length, yr = Pt.linesAbove.length, ti = Pt.markersBelow.length, Ai = Pt.markersAbove.length, gr = gf(e.canvas), ni = Math.abs(he.max - he.min);
      let Bn = eo, ii = [];
      if (p.xAxis.type === "time") {
        const Ve = kf({
          axisMin: dr(p.xAxis.min),
          axisMax: dr(p.xAxis.max),
          xScale: Se,
          plotClipLeft: ne.left,
          plotClipRight: ne.right,
          canvasCssWidth: gr,
          visibleRangeMs: ni,
          measureCtx: g,
          measureCache: u ?? void 0,
          fontSize: p.theme.fontSize,
          fontFamily: p.theme.fontFamily || "sans-serif",
          tickFormatter: p.xAxis.tickFormatter
        });
        Bn = Ve.tickCount, ii = Ve.tickValues;
      } else {
        const Ve = gn(p.xAxis.min) ?? Se.invert(ne.left), Ze = gn(p.xAxis.max) ?? Se.invert(ne.right);
        ii = rr(Ve, Ze, Bn);
      }
      const Je = Ci(G, {
        xDomain: { min: he.min, max: he.max },
        yDomain: se
      });
      _t = Je;
      const nn = v && Q < 1 ? h(v.from.series, v.to.series, Q, I) : U;
      if (ct.source === "mouse" && ct.hasPointer && ct.isInGrid && Je) {
        const Ve = Je.xScale.invert(ct.gridX);
        kt(Number.isFinite(Ve) ? Ve : null, "mouse");
      }
      let ht = ct;
      if (ct.source === "sync")
        if (At === null || !Je)
          ht = { ...ct, hasPointer: false, isInGrid: false };
        else {
          const Ve = Je.xScale.scale(At), Ze = Je.plotHeightCss * 0.5, Gt = Number.isFinite(Ve) && Number.isFinite(Ze) && Ve >= 0 && Ve <= Je.plotWidthCss && Ze >= 0 && Ze <= Je.plotHeightCss;
          ht = {
            source: "sync",
            gridX: Number.isFinite(Ve) ? Ve : 0,
            gridY: Number.isFinite(Ze) ? Ze : 0,
            // Crosshair/tooltip expect CANVAS-LOCAL CSS px.
            x: G.left + (Number.isFinite(Ve) ? Ve : 0),
            y: G.top + (Number.isFinite(Ze) ? Ze : 0),
            isInGrid: Gt,
            hasPointer: Gt
          };
        }
      if (Ic(
        { gridRenderer: Be, xAxisRenderer: Le, yAxisRenderer: rt, crosshairRenderer: ot, highlightRenderer: ve },
        {
          currentOptions: p,
          xScale: Se,
          yScale: Me,
          gridArea: G,
          xTickCount: Bn,
          hasCartesianSeries: k,
          effectivePointer: ht,
          interactionScales: Je,
          seriesForRender: nn,
          withAlpha: Ds
        }
      ), ht.hasPointer && ht.isInGrid && ((bo = p.tooltip) == null ? void 0 : bo.show) !== false) {
        const Ve = e.canvas;
        if (Je && Ve && Yn(Ve)) {
          const Ze = (vo = p.tooltip) == null ? void 0 : vo.formatter, Gt = ((wo = p.tooltip) == null ? void 0 : wo.trigger) ?? "item", tt = Ve.offsetLeft + ht.x, $e = Ve.offsetTop + ht.y;
          if (ht.source === "sync") {
            const xt = ws(nn, ht.gridX, Je.xScale);
            if (xt.length === 0)
              le();
            else if (Gt === "axis") {
              const He = xt.map((it) => wn(it.seriesIndex, it.dataIndex, it.point)), Ye = Ze ? Ze(He) : zr(He);
              Ye && (Ye !== K || tt !== ae || $e !== ee) ? (K = Ye, ae = tt, ee = $e, te(tt, $e, Ye)) : Ye || le();
            } else {
              const He = xt[0], Ye = wn(He.seriesIndex, He.dataIndex, He.point), it = Ze ? Ze(Ye) : di(Ye);
              it && (it !== K || tt !== ae || $e !== ee) ? (K = it, ae = tt, ee = $e, te(tt, $e, it)) : it || le();
            }
          } else if (Gt === "axis") {
            const xt = Qn(
              nn,
              ht.gridX,
              ht.gridY,
              Je.plotWidthCss,
              Je.plotHeightCss
            );
            if (xt) {
              const He = {
                seriesName: xt.slice.name,
                seriesIndex: xt.seriesIndex,
                dataIndex: xt.dataIndex,
                value: [0, xt.slice.value],
                color: xt.slice.color
              }, Ye = Ze ? Ze([He]) : di(He);
              Ye && (Ye !== K || tt !== ae || $e !== ee) ? (K = Ye, ae = tt, ee = $e, te(tt, $e, Ye)) : Ye || le();
            } else {
              const He = ei(
                nn,
                ht.gridX,
                ht.gridY,
                Je
              ), Ye = ws(nn, ht.gridX, Je.xScale);
              if (Ye.length === 0)
                if (He) {
                  const it = [He.params], lt = Ze ? Ze(it) : zr(it);
                  if (lt) {
                    const bt = Or(
                      He.match,
                      Je.xScale,
                      Je.yScale,
                      G,
                      Ve
                    ), Xt = (bt == null ? void 0 : bt.x) ?? tt, Mn = (bt == null ? void 0 : bt.y) ?? $e;
                    (lt !== K || Xt !== ae || Mn !== ee) && (K = lt, ae = Xt, ee = Mn, te(Xt, Mn, lt));
                  } else
                    le();
                } else
                  le();
              else {
                const it = Ye.map((bt) => wn(bt.seriesIndex, bt.dataIndex, bt.point));
                He && it.push(He.params);
                const lt = Ze ? Ze(it) : zr(it);
                if (lt) {
                  let bt = tt, Xt = $e;
                  if (He) {
                    const Mn = Or(
                      He.match,
                      Je.xScale,
                      Je.yScale,
                      G,
                      Ve
                    );
                    Mn && (bt = Mn.x, Xt = Mn.y);
                  }
                  (lt !== K || bt !== ae || Xt !== ee) && (K = lt, ae = bt, ee = Xt, te(bt, Xt, lt));
                } else
                  le();
              }
            }
          } else {
            const xt = Qn(
              nn,
              ht.gridX,
              ht.gridY,
              Je.plotWidthCss,
              Je.plotHeightCss
            );
            if (xt) {
              const He = {
                seriesName: xt.slice.name,
                seriesIndex: xt.seriesIndex,
                dataIndex: xt.dataIndex,
                value: [0, xt.slice.value],
                color: xt.slice.color
              }, Ye = Ze ? Ze(He) : di(He);
              Ye && (Ye !== K || tt !== ae || $e !== ee) ? (K = Ye, ae = tt, ee = $e, te(tt, $e, Ye)) : Ye || le();
            } else {
              const He = ei(
                nn,
                ht.gridX,
                ht.gridY,
                Je
              );
              if (He) {
                const it = Ze ? Ze(He.params) : di(He.params);
                if (it) {
                  const lt = Or(
                    He.match,
                    Je.xScale,
                    Je.yScale,
                    G,
                    Ve
                  ), bt = (lt == null ? void 0 : lt.x) ?? tt, Xt = (lt == null ? void 0 : lt.y) ?? $e;
                  (it !== K || bt !== ae || Xt !== ee) && (K = it, ae = bt, ee = Xt, te(bt, Xt, it, He.params));
                } else
                  le();
                return;
              }
              const Ye = lr(
                nn,
                ht.gridX,
                ht.gridY,
                Je.xScale,
                Je.yScale
              );
              if (!Ye)
                le();
              else {
                const it = wn(Ye.seriesIndex, Ye.dataIndex, Ye.point), lt = Ze ? Ze(it) : di(it);
                lt && (lt !== K || tt !== ae || $e !== ee) ? (K = lt, ae = tt, ee = $e, te(tt, $e, lt)) : lt || le();
              }
            }
          }
        } else
          le();
      } else
        le();
      const ri = Je ?? (Ae && Yn(Ae) ? Jn(Ae, G) : null), va = ri && typeof ri.plotWidthCss == "number" && typeof ri.plotHeightCss == "number" ? 0.5 * Math.min(ri.plotWidthCss, ri.plotHeightCss) : 0, Ii = qe.getState(), po = Lc(
        Ii,
        {
          currentOptions: p,
          seriesForRender: nn,
          xScale: Se,
          yScale: Me,
          gridArea: G,
          dataStore: pe,
          appendedGpuThisFrame: ce,
          gpuSeriesKindByIndex: ue,
          zoomState: V,
          visibleXDomain: he,
          introPhase: R,
          introProgress01: D,
          withAlpha: Ds,
          maxRadiusCss: va
        }
      ), { visibleBarSeriesConfigs: ho } = po, yo = R === "running" ? rn(D) : 1, wa = yo < 1 ? Wf(Me, ne, ho, yo) : Me;
      Ii.barRenderer.prepare(ho, pe, Se, wa, G), k ? (Te.prepare(G, Ni), Ke.prepare(G, Ni), Xe.prepare({
        canvasWidth: G.canvasWidth,
        canvasHeight: G.canvasHeight,
        devicePixelRatio: G.devicePixelRatio,
        instances: Ti
      }), We.prepare({
        canvasWidth: G.canvasWidth,
        canvasHeight: G.canvasHeight,
        devicePixelRatio: G.devicePixelRatio,
        instances: Ti
      })) : (Te.prepare(G, []), Ke.prepare(G, []), Xe.prepare({
        canvasWidth: G.canvasWidth,
        canvasHeight: G.canvasHeight,
        devicePixelRatio: G.devicePixelRatio,
        instances: []
      }), We.prepare({
        canvasWidth: G.canvasWidth,
        canvasHeight: G.canvasHeight,
        devicePixelRatio: G.devicePixelRatio,
        instances: []
      })), mt.ensureTextures(G.canvasWidth, G.canvasHeight);
      const oi = mt.getState(), go = e.canvasContext.getCurrentTexture().createView(), si = i.createCommandEncoder({ label: "renderCoordinator/commandEncoder" }), xo = $a(p.theme.backgroundColor, { r: 0, g: 0, b: 0, a: 1 });
      _c(
        Ii,
        nn,
        si
      );
      const xr = si.beginRenderPass({
        label: "renderCoordinator/mainPass",
        colorAttachments: [
          {
            view: oi.mainColorView,
            // MSAA texture (4x)
            resolveTarget: oi.mainResolveView,
            // single-sample resolve target
            clearValue: xo,
            loadOp: "clear",
            storeOp: "discard"
            // MSAA content discarded after resolve
          }
        ]
      });
      Be && Be.render(xr), kc(
        Ii,
        { referenceLineRenderer: Te, annotationMarkerRenderer: Xe },
        {
          hasCartesianSeries: k,
          gridArea: G,
          mainPass: xr,
          plotScissor: Re,
          introPhase: R,
          introProgress01: D,
          referenceLineBelowCount: En,
          markerBelowCount: ti
        },
        po
      ), xr.end();
      const ai = si.beginRenderPass({
        label: "renderCoordinator/annotationOverlayMsaaPass",
        colorAttachments: [
          {
            view: oi.overlayMsaaView,
            resolveTarget: go,
            clearValue: xo,
            loadOp: "clear",
            storeOp: "discard"
          }
        ]
      });
      ai.setPipeline(oi.overlayBlitPipeline), ai.setBindGroup(0, oi.overlayBlitBindGroup), ai.draw(3), Uc(
        { referenceLineRendererMsaa: Ke, annotationMarkerRendererMsaa: We },
        {
          hasCartesianSeries: k,
          gridArea: G,
          overlayPass: ai,
          plotScissor: Re,
          referenceLineBelowCount: En,
          referenceLineAboveCount: yr,
          markerBelowCount: ti,
          markerAboveCount: Ai
        }
      ), ai.end();
      const ci = si.beginRenderPass({
        label: "renderCoordinator/topOverlayPass",
        colorAttachments: [
          {
            view: go,
            loadOp: "load",
            storeOp: "store"
          }
        ]
      });
      ve.render(ci), k && (Le.render(ci), rt.render(ci)), ot.render(ci), ci.end(), i.queue.submit([si.finish()]), b = true, oc(a, s, {
        gpuContext: e,
        currentOptions: p,
        xScale: Se,
        yScale: Me,
        xTickValues: ii,
        plotClipRect: ne,
        visibleXRangeMs: ni
      }), lc(c, s, {
        currentOptions: p,
        xScale: Se,
        yScale: Me,
        canvasCssWidthForAnnotations: Ee,
        canvasCssHeightForAnnotations: Nt,
        plotLeftCss: en,
        plotTopCss: Ut,
        plotWidthCss: Cn,
        plotHeightCss: Fi,
        canvas: Ae
      });
    },
    dispose: () => {
      if (!y) {
        y = true;
        try {
          A && T.cancel(A), T.cancelAll();
        } catch {
        }
        A = null, R = "done", D = 1;
        try {
          x && m.cancel(x), m.cancelAll();
        } catch {
        }
        x = null, w = 1, v = null, Et(), It(), L = false, $.clear(), oe == null || oe.dispose(), oe = null, ge == null || ge(), ge = null, V = null, we = null, me.clear(), ke == null || ke.dispose(), ot.dispose(), ve.dispose(), qe.dispose(), Be.dispose(), Le.dispose(), rt.dispose(), Te.dispose(), Xe.dispose(), Ke.dispose(), We.dispose(), mt.dispose(), pe.dispose(), fe == null || fe.dispose(), fe = null, l == null || l.dispose(), a == null || a.dispose(), c == null || c.dispose();
      }
    }
  };
}
const $t = {
  left: 60,
  right: 20,
  top: 40,
  bottom: 40
}, or = [
  "#5470C6",
  "#91CC75",
  "#FAC858",
  "#EE6666",
  "#73C0DE",
  "#3BA272",
  "#FC8452",
  "#9A60B4",
  "#EA7CCC"
], Ls = {
  width: 2,
  opacity: 1
}, _s = {
  opacity: 0.25
}, qt = {
  style: "classic",
  itemStyle: {
    upColor: "#22c55e",
    downColor: "#ef4444",
    upBorderColor: "#22c55e",
    downBorderColor: "#ef4444",
    borderWidth: 1
  },
  barWidth: "80%",
  barMinWidth: 1,
  barMaxWidth: 50,
  sampling: "ohlc",
  samplingThreshold: 5e3
}, Ki = {
  mode: "points",
  // Bin size in CSS pixels for density mode. Must be > 0.
  binSize: 2,
  densityColormap: "viridis",
  densityNormalization: "log"
}, ks = {
  horizontal: {
    count: 5
  },
  vertical: {
    count: 6
  }
}, Rt = {
  grid: $t,
  xAxis: { type: "value" },
  yAxis: { type: "value", autoBounds: "visible" },
  autoScroll: false,
  palette: or}, Xf = [
  "#00E5FF",
  "#FF2D95",
  "#B026FF",
  "#00F5A0",
  "#FFD300",
  "#FF6B00",
  "#4D5BFF",
  "#FF3D3D"
], $f = {
  backgroundColor: "#1a1a2e",
  textColor: "#e0e0e0",
  axisLineColor: "rgba(224,224,224,0.35)",
  axisTickColor: "rgba(224,224,224,0.55)",
  gridLineColor: "rgba(255,255,255,0.1)",
  colorPalette: [...Xf],
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  fontSize: 12
}, Yf = [
  "#1F77B4",
  "#FF7F0E",
  "#2CA02C",
  "#D62728",
  "#9467BD",
  "#8C564B",
  "#E377C2",
  "#17BECF"
], Hf = {
  backgroundColor: "#ffffff",
  textColor: "#333333",
  axisLineColor: "rgba(0,0,0,0.35)",
  axisTickColor: "rgba(0,0,0,0.55)",
  gridLineColor: "rgba(0,0,0,0.1)",
  colorPalette: [...Yf],
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  fontSize: 12
};
function Xr(e) {
  return e === "dark" ? $f : Hf;
}
const qf = (e) => {
  if (!Array.isArray(e)) return;
  const t = [];
  for (const n of e) {
    if (n === null || typeof n != "object" || Array.isArray(n)) continue;
    const i = n, r = i.type;
    if (r !== "inside" && r !== "slider") continue;
    const o = i.xAxisIndex, s = i.start, a = i.end, c = i.minSpan, f = i.maxSpan, l = typeof o == "number" && Number.isFinite(o) ? o : void 0, g = typeof s == "number" && Number.isFinite(s) ? s : void 0, u = typeof a == "number" && Number.isFinite(a) ? a : void 0, y = typeof c == "number" && Number.isFinite(c) ? c : void 0, p = typeof f == "number" && Number.isFinite(f) ? f : void 0;
    t.push({ type: r, xAxisIndex: l, start: g, end: u, minSpan: y, maxSpan: p });
  }
  return t;
}, Zf = (e) => {
  if (!Array.isArray(e)) return;
  const t = [], n = (f) => f === "start" || f === "center" || f === "end", i = (f) => f === "circle" || f === "rect" || f === "triangle", r = (f) => {
    if (typeof f != "string") return;
    const l = f.trim();
    return l.length > 0 ? l : void 0;
  }, o = (f) => typeof f == "number" && Number.isFinite(f) ? f : void 0, s = (f) => {
    const l = o(f);
    if (l != null)
      return Math.min(1, Math.max(0, l));
  }, a = (f) => {
    if (!Array.isArray(f)) return;
    const l = f.filter((g) => typeof g == "number" && Number.isFinite(g)).map((g) => g);
    if (l.length !== 0)
      return Object.freeze(l), l;
  }, c = (f) => {
    if (typeof f == "number" && Number.isFinite(f)) return f;
    if (!Array.isArray(f) || f.length !== 4) return;
    const l = o(f[0]), g = o(f[1]), u = o(f[2]), y = o(f[3]);
    if (!(l == null || g == null || u == null || y == null))
      return [l, g, u, y];
  };
  for (const f of e) {
    if (f === null || typeof f != "object" || Array.isArray(f)) continue;
    const l = f, g = l.type;
    if (g !== "lineX" && g !== "lineY" && g !== "point" && g !== "text") continue;
    const u = r(l.id), y = l.layer, p = y === "belowSeries" || y === "aboveSeries" ? y : void 0, M = l.style, R = M && typeof M == "object" && !Array.isArray(M) ? (() => {
      const A = M, b = r(A.color), m = o(A.lineWidth), x = a(A.lineDash), w = s(A.opacity), v = {
        ...b ? { color: b } : {},
        ...m != null ? { lineWidth: m } : {},
        ...x ? { lineDash: x } : {},
        ...w != null ? { opacity: w } : {}
      };
      return Object.keys(v).length > 0 ? v : void 0;
    })() : void 0, D = l.label, T = D && typeof D == "object" && !Array.isArray(D) ? (() => {
      const A = D, b = r(A.text), m = r(A.template), x = A.decimals, w = typeof x == "number" && Number.isFinite(x) && x >= 0 ? Math.min(20, Math.floor(x)) : void 0, v = A.offset, I = Array.isArray(v) && v.length === 2 && typeof v[0] == "number" && Number.isFinite(v[0]) && typeof v[1] == "number" && Number.isFinite(v[1]) ? [v[0], v[1]] : void 0, N = A.anchor, C = n(N) ? N : void 0, d = A.background, h = d && typeof d == "object" && !Array.isArray(d) ? (() => {
        const S = d, P = r(S.color), B = s(S.opacity), E = c(S.padding), z = o(S.borderRadius), U = {
          ...P ? { color: P } : {},
          ...B != null ? { opacity: B } : {},
          ...E != null ? { padding: E } : {},
          ...z != null ? { borderRadius: z } : {}
        };
        return Object.keys(U).length > 0 ? U : void 0;
      })() : void 0, F = {
        ...b ? { text: b } : {},
        ...m ? { template: m } : {},
        ...w != null ? { decimals: w } : {},
        ...I ? { offset: I } : {},
        ...C ? { anchor: C } : {},
        ...h ? { background: h } : {}
      };
      return Object.keys(F).length > 0 ? F : void 0;
    })() : void 0;
    if (g === "lineX") {
      const A = o(l.x);
      if (A == null) continue;
      const b = { type: "lineX", x: A, ...u ? { id: u } : {}, ...p ? { layer: p } : {}, ...R ? { style: R } : {}, ...T ? { label: T } : {} };
      t.push(b);
      continue;
    }
    if (g === "lineY") {
      const A = o(l.y);
      if (A == null) continue;
      const b = { type: "lineY", y: A, ...u ? { id: u } : {}, ...p ? { layer: p } : {}, ...R ? { style: R } : {}, ...T ? { label: T } : {} };
      t.push(b);
      continue;
    }
    if (g === "point") {
      const A = o(l.x), b = o(l.y);
      if (A == null || b == null) continue;
      const m = l.marker, x = m && typeof m == "object" && !Array.isArray(m) ? (() => {
        const v = m, I = v.symbol, N = i(I) ? I : void 0, C = o(v.size), d = v.style, h = d && typeof d == "object" && !Array.isArray(d) ? (() => {
          const S = d, P = r(S.color), B = s(S.opacity), E = o(S.lineWidth), z = a(S.lineDash), U = {
            ...P ? { color: P } : {},
            ...B != null ? { opacity: B } : {},
            ...E != null ? { lineWidth: E } : {},
            ...z ? { lineDash: z } : {}
          };
          return Object.keys(U).length > 0 ? U : void 0;
        })() : void 0, F = {
          ...N ? { symbol: N } : {},
          ...C != null ? { size: C } : {},
          ...h ? { style: h } : {}
        };
        return Object.keys(F).length > 0 ? F : void 0;
      })() : void 0, w = {
        type: "point",
        x: A,
        y: b,
        ...x ? { marker: x } : {},
        ...u ? { id: u } : {},
        ...p ? { layer: p } : {},
        ...R ? { style: R } : {},
        ...T ? { label: T } : {}
      };
      t.push(w);
      continue;
    }
    {
      const A = l.position, b = r(l.text);
      if (!b || !A || typeof A != "object" || Array.isArray(A)) continue;
      const m = A, x = m.space;
      if (x !== "data" && x !== "plot") continue;
      const w = o(m.x), v = o(m.y);
      if (w == null || v == null) continue;
      const N = {
        type: "text",
        position: { space: x, x: w, y: v },
        text: b,
        ...u ? { id: u } : {},
        ...p ? { layer: p } : {},
        ...R ? { style: R } : {},
        ...T ? { label: T } : {}
      };
      t.push(N);
      continue;
    }
  }
  if (t.length !== 0)
    return Object.freeze(t), t;
}, mi = (e) => Array.isArray(e) ? e.filter((t) => typeof t == "string").map((t) => t.trim()).filter((t) => t.length > 0) : [], jf = (e) => {
  const t = Xr("dark");
  if (typeof e == "string") {
    const a = e.trim().toLowerCase();
    return Xr(a === "light" ? "light" : "dark");
  }
  if (e === null || typeof e != "object" || Array.isArray(e))
    return t;
  const n = e, i = (a) => {
    const c = n[a];
    if (typeof c != "string") return;
    const f = c.trim();
    return f.length > 0 ? f : void 0;
  }, r = n.fontSize, o = typeof r == "number" && Number.isFinite(r) ? r : void 0, s = mi(n.colorPalette);
  return {
    backgroundColor: i("backgroundColor") ?? t.backgroundColor,
    textColor: i("textColor") ?? t.textColor,
    axisLineColor: i("axisLineColor") ?? t.axisLineColor,
    axisTickColor: i("axisTickColor") ?? t.axisTickColor,
    gridLineColor: i("gridLineColor") ?? t.gridLineColor,
    colorPalette: s.length > 0 ? s : Array.from(t.colorPalette),
    fontFamily: i("fontFamily") ?? t.fontFamily,
    fontSize: o ?? t.fontSize
  };
}, Zt = (e) => {
  if (typeof e != "string") return;
  const t = e.trim();
  return t.length > 0 ? t : void 0;
}, Kf = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().toLowerCase();
  return t === "none" || t === "lttb" || t === "average" || t === "max" || t === "min" || t === "ohlc" ? t : void 0;
}, Jf = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().toLowerCase();
  return t === "points" || t === "density" ? t : void 0;
}, Qf = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().toLowerCase();
  return t === "linear" || t === "sqrt" || t === "log" ? t : void 0;
}, ed = (e) => {
  if (typeof e != "number" || !Number.isFinite(e)) return;
  const t = Math.floor(e);
  return t > 0 ? Math.max(1, t) : void 0;
}, td = (e) => {
  if (typeof e == "string") {
    const i = e.trim().toLowerCase();
    return i === "viridis" || i === "plasma" || i === "inferno" ? i : void 0;
  }
  if (!Array.isArray(e)) return;
  if (e.length > 0 && e.every((i) => typeof i == "string" && i.length > 0 && i === i.trim())) {
    const i = e;
    return Object.isFrozen(i) || Object.freeze(i), i;
  }
  const n = e.filter((i) => typeof i == "string").map((i) => i.trim()).filter((i) => i.length > 0);
  if (n.length !== 0)
    return Object.freeze(n), n;
}, nd = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().toLowerCase();
  return t === "none" || t === "ohlc" ? t : void 0;
}, Us = (e) => {
  if (typeof e != "number" || !Number.isFinite(e)) return;
  const t = Math.floor(e);
  return t > 0 ? t : void 0;
}, Gs = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().toLowerCase();
  return t === "global" || t === "visible" ? t : void 0;
}, id = (e) => Array.isArray(e), rd = (e) => {
  if (e.length === 0) return;
  let t = Number.POSITIVE_INFINITY, n = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  if (id(e[0])) {
    const s = e;
    for (let a = 0; a < s.length; a++) {
      const c = s[a], f = c[0], l = c[3], g = c[4];
      if (!Number.isFinite(f) || !Number.isFinite(l) || !Number.isFinite(g)) continue;
      const u = Math.min(l, g), y = Math.max(l, g);
      f < t && (t = f), f > n && (n = f), u < i && (i = u), y > r && (r = y);
    }
  } else {
    const s = e;
    for (let a = 0; a < s.length; a++) {
      const c = s[a], f = c.timestamp, l = c.low, g = c.high;
      if (!Number.isFinite(f) || !Number.isFinite(l) || !Number.isFinite(g)) continue;
      const u = Math.min(l, g), y = Math.max(l, g);
      f < t && (t = f), f > n && (n = f), u < i && (i = u), y > r && (r = y);
    }
  }
  if (!(!Number.isFinite(t) || !Number.isFinite(n) || !Number.isFinite(i) || !Number.isFinite(r)))
    return t === n && (n = t + 1), i === r && (r = i + 1), { xMin: t, xMax: n, yMin: i, yMax: r };
}, od = (e) => {
  throw new Error(
    `Unhandled series type: ${(e == null ? void 0 : e.type) ?? "unknown"}`
  );
};
let zs = false;
const sd = () => {
  zs || (console.warn(
    "ChartGPU: Candlestick series rendering is not yet implemented. Series will be skipped."
  ), zs = true);
};
function ya(e = {}) {
  var A, b, m, x;
  const t = jf(e.theme), n = e.autoScroll, i = typeof n == "boolean" ? n : Rt.autoScroll, r = e.animation, s = (typeof r == "boolean" || r !== null && typeof r == "object" && !Array.isArray(r) ? r : void 0) ?? true, a = mi(e.palette), c = a.length > 0 ? { ...t, colorPalette: a } : t, f = mi(c.colorPalette), l = f.length > 0 ? f : mi(Rt.palette ?? or).length > 0 ? mi(Rt.palette ?? or) : Array.from(or), g = l.length > 0 ? l : ["#000000"], u = { ...c, colorPalette: g.slice() }, y = {
    left: ((A = e.grid) == null ? void 0 : A.left) ?? Rt.grid.left,
    right: ((b = e.grid) == null ? void 0 : b.right) ?? Rt.grid.right,
    top: ((m = e.grid) == null ? void 0 : m.top) ?? Rt.grid.top,
    bottom: ((x = e.grid) == null ? void 0 : x.bottom) ?? Rt.grid.bottom
  }, M = ((w, v) => {
    const I = (w == null ? void 0 : w.show) !== false, N = Zt(w == null ? void 0 : w.color) ?? v.gridLineColor, C = typeof (w == null ? void 0 : w.opacity) == "number" && Number.isFinite(w.opacity) ? Math.min(1, Math.max(0, w.opacity)) : 1, d = (S, P) => {
      if (P === 1) return S;
      const B = yt(S);
      return B ? `rgba(${Math.round(B[0] * 255)}, ${Math.round(B[1] * 255)}, ${Math.round(B[2] * 255)}, ${B[3] * P})` : S;
    }, h = d(N, C), F = (S, P) => {
      if (S === false)
        return { show: false, count: 0, color: h };
      if (S === true || S === void 0)
        return { show: I, count: P, color: h };
      const B = S.show !== false && I, E = typeof S.count == "number" && Number.isFinite(S.count) && S.count >= 0 ? Math.floor(S.count) : P, z = Zt(S.color), U = z != null ? d(z, C) : h;
      return { show: B, count: E, color: U };
    };
    return {
      show: I,
      color: h,
      opacity: C,
      horizontal: F(w == null ? void 0 : w.horizontal, ks.horizontal.count),
      vertical: F(w == null ? void 0 : w.vertical, ks.vertical.count)
    };
  })(e.gridLines, u), R = e.xAxis ? {
    ...Rt.xAxis,
    ...e.xAxis,
    // runtime safety for JS callers
    type: e.xAxis.type ?? Rt.xAxis.type,
    autoBounds: Gs(e.xAxis.autoBounds) ?? Rt.xAxis.autoBounds
  } : { ...Rt.xAxis }, D = e.yAxis ? {
    ...Rt.yAxis,
    ...e.yAxis,
    // runtime safety for JS callers
    type: e.yAxis.type ?? Rt.yAxis.type,
    autoBounds: Gs(e.yAxis.autoBounds) ?? Rt.yAxis.autoBounds
  } : { ...Rt.yAxis }, T = (e.series ?? []).map((w, v) => {
    var S, P, B, E, z, U, Y, j, q, Z;
    const I = Zt(w.color), N = u.colorPalette[v % u.colorPalette.length], C = I ?? N, d = w.visible !== false, h = Kf(w.sampling) ?? "lttb", F = Us(w.samplingThreshold) ?? 5e3;
    switch (w.type) {
      case "area": {
        const re = Zt((S = w.areaStyle) == null ? void 0 : S.color) ?? I ?? N, W = {
          opacity: ((P = w.areaStyle) == null ? void 0 : P.opacity) ?? _s.opacity,
          color: re
        }, de = zt(w.data) ?? void 0, L = Co(w.data) ? w.data : Wn(w.data, h, F);
        return {
          ...w,
          visible: d,
          rawData: w.data,
          data: L,
          color: re,
          areaStyle: W,
          sampling: h,
          samplingThreshold: F,
          rawBounds: de,
          connectNulls: w.connectNulls ?? false
        };
      }
      case "line": {
        const re = Zt((B = w.lineStyle) == null ? void 0 : B.color) ?? I ?? N, W = {
          width: ((E = w.lineStyle) == null ? void 0 : E.width) ?? Ls.width,
          opacity: ((z = w.lineStyle) == null ? void 0 : z.opacity) ?? Ls.opacity,
          color: re
        }, { areaStyle: de, ...L } = w, X = zt(w.data) ?? void 0, $ = Co(w.data) ? w.data : Wn(w.data, h, F);
        return {
          ...L,
          visible: d,
          rawData: w.data,
          data: $,
          color: re,
          lineStyle: W,
          ...w.areaStyle ? {
            areaStyle: {
              opacity: w.areaStyle.opacity ?? _s.opacity,
              // Fill color precedence: areaStyle.color → resolved stroke color
              color: Zt(w.areaStyle.color) ?? re
            }
          } : {},
          sampling: h,
          samplingThreshold: F,
          rawBounds: X,
          connectNulls: w.connectNulls ?? false
        };
      }
      case "bar": {
        const J = zt(w.data) ?? void 0;
        return {
          ...w,
          visible: d,
          rawData: w.data,
          data: Wn(w.data, h, F),
          color: C,
          sampling: h,
          samplingThreshold: F,
          rawBounds: J
        };
      }
      case "scatter": {
        const J = zt(w.data) ?? void 0, re = Jf(w.mode) ?? Ki.mode, W = ed(w.binSize) ?? Ki.binSize, de = td(w.densityColormap) ?? Ki.densityColormap, L = Qf(
          w.densityNormalization
        ) ?? Ki.densityNormalization;
        return {
          ...w,
          visible: d,
          rawData: w.data,
          data: Wn(w.data, h, F),
          color: C,
          mode: re,
          binSize: W,
          densityColormap: de,
          densityNormalization: L,
          sampling: h,
          samplingThreshold: F,
          rawBounds: J
        };
      }
      case "pie": {
        const { sampling: J, samplingThreshold: re, ...W } = w, de = (w.data ?? []).map((L, X) => {
          const $ = Zt(L == null ? void 0 : L.color), ue = u.colorPalette[(v + X) % u.colorPalette.length], ce = (L == null ? void 0 : L.visible) !== false;
          return {
            ...L,
            color: $ ?? ue,
            visible: ce
          };
        });
        return { ...W, visible: d, color: C, data: de };
      }
      case "candlestick": {
        sd();
        const J = nd(w.sampling) ?? qt.sampling, re = Us(w.samplingThreshold) ?? qt.samplingThreshold, W = {
          upColor: Zt((U = w.itemStyle) == null ? void 0 : U.upColor) ?? qt.itemStyle.upColor,
          downColor: Zt((Y = w.itemStyle) == null ? void 0 : Y.downColor) ?? qt.itemStyle.downColor,
          upBorderColor: Zt((j = w.itemStyle) == null ? void 0 : j.upBorderColor) ?? qt.itemStyle.upBorderColor,
          downBorderColor: Zt((q = w.itemStyle) == null ? void 0 : q.downBorderColor) ?? qt.itemStyle.downBorderColor,
          borderWidth: typeof ((Z = w.itemStyle) == null ? void 0 : Z.borderWidth) == "number" && Number.isFinite(w.itemStyle.borderWidth) ? w.itemStyle.borderWidth : qt.itemStyle.borderWidth
        }, de = rd(w.data), L = J === "ohlc" && w.data.length > re ? Zr(w.data, re) : w.data;
        return {
          ...w,
          visible: d,
          rawData: w.data,
          data: L,
          color: C,
          style: w.style ?? qt.style,
          itemStyle: W,
          barWidth: w.barWidth ?? qt.barWidth,
          barMinWidth: w.barMinWidth ?? qt.barMinWidth,
          barMaxWidth: w.barMaxWidth ?? qt.barMaxWidth,
          sampling: J,
          samplingThreshold: re,
          rawBounds: de
        };
      }
      default:
        return od(w);
    }
  });
  return {
    grid: y,
    gridLines: M,
    xAxis: R,
    yAxis: D,
    autoScroll: i,
    dataZoom: qf(e.dataZoom),
    annotations: Zf(e.annotations),
    animation: s,
    theme: u,
    palette: u.colorPalette,
    series: T,
    legend: e.legend
  };
}
const ad = 32, cd = 8, ld = ad + cd, ud = (e) => {
  var t;
  return ((t = e.dataZoom) == null ? void 0 : t.some((n) => (n == null ? void 0 : n.type) === "slider")) ?? false;
};
function Vs(e = {}) {
  const t = { ...ya(e), tooltip: e.tooltip };
  return ud(e) ? {
    ...t,
    grid: {
      ...t.grid,
      bottom: t.grid.bottom + ld
    }
  } : t;
}
const no = (e, t, n) => Math.min(n, Math.max(t, e)), fd = (e) => {
  let { start: t, end: n } = e;
  if (t > n) {
    const i = t;
    t = n, n = i;
  }
  return { start: no(t, 0, 100), end: no(n, 0, 100) };
};
function dd(e, t, n) {
  const i = n == null ? void 0 : n.height, r = n == null ? void 0 : n.marginTop, o = (n == null ? void 0 : n.zIndex) ?? 4, s = (n == null ? void 0 : n.showPreview) ?? false, a = document.createElement("div");
  a.style.display = "block", a.style.width = "100%", a.style.height = `${i}px`, a.style.marginTop = `${r}px`, a.style.boxSizing = "border-box", a.style.position = "relative", a.style.zIndex = `${o}`, a.style.userSelect = "none", a.style.touchAction = "none";
  const c = document.createElement("div");
  c.style.position = "relative", c.style.height = "100%", c.style.width = "100%", c.style.boxSizing = "border-box", c.style.borderRadius = "8px", c.style.borderStyle = "solid", c.style.borderWidth = "1px", c.style.overflow = "hidden", a.appendChild(c);
  const f = document.createElement("div");
  f.style.position = "absolute", f.style.inset = "0", f.style.pointerEvents = "none", f.style.opacity = "0.4", f.style.display = s ? "block" : "none", c.appendChild(f);
  const l = document.createElement("div");
  l.style.position = "absolute", l.style.top = "0", l.style.bottom = "0", l.style.left = "0%", l.style.width = "100%", l.style.boxSizing = "border-box", l.style.cursor = "grab", c.appendChild(l);
  const g = document.createElement("div");
  g.style.position = "absolute", g.style.left = "0", g.style.top = "0", g.style.bottom = "0", g.style.width = "10px", g.style.cursor = "ew-resize", l.appendChild(g);
  const u = document.createElement("div");
  u.style.position = "absolute", u.style.right = "0", u.style.top = "0", u.style.bottom = "0", u.style.width = "10px", u.style.cursor = "ew-resize", l.appendChild(u);
  const y = document.createElement("div");
  y.style.position = "absolute", y.style.left = "10px", y.style.right = "10px", y.style.top = "0", y.style.bottom = "0", y.style.cursor = "grab", l.appendChild(y), e.appendChild(a);
  let p = false, M = null;
  const R = (d) => {
    const h = fd(d), F = no(h.end - h.start, 0, 100);
    l.style.left = `${h.start}%`, l.style.width = `${F}%`;
  }, D = () => {
    const d = c.getBoundingClientRect().width;
    return Number.isFinite(d) && d > 0 ? d : null;
  }, T = (d) => {
    const h = D();
    if (h === null) return null;
    const F = d / h * 100;
    return Number.isFinite(F) ? F : null;
  }, A = (d, h) => {
    try {
      d.setPointerCapture(h);
    } catch {
    }
  }, b = (d, h) => {
    try {
      d.releasePointerCapture(h);
    } catch {
    }
  }, m = (d, h) => {
    if (p || d.button !== 0) return;
    d.preventDefault(), M == null || M(), M = null;
    const F = d.clientX, S = t.getRange(), P = d.currentTarget instanceof Element ? d.currentTarget : l;
    A(P, d.pointerId), h === "pan-window" && (l.style.cursor = "grabbing", y.style.cursor = "grabbing");
    const B = (Y) => {
      if (p || Y.pointerId !== d.pointerId) return;
      Y.preventDefault();
      const j = T(Y.clientX - F);
      if (j !== null)
        switch (h) {
          case "left-handle": {
            const q = Math.min(S.end, S.start + j), Z = t;
            Z.setRangeAnchored ? Z.setRangeAnchored(q, S.end, "end") : t.setRange(q, S.end);
            return;
          }
          case "right-handle": {
            const q = Math.max(S.start, S.end + j), Z = t;
            Z.setRangeAnchored ? Z.setRangeAnchored(S.start, q, "start") : t.setRange(S.start, q);
            return;
          }
          case "pan-window": {
            t.setRange(S.start + j, S.end + j);
            return;
          }
        }
    };
    let E = false;
    const z = () => {
      E || (E = true, window.removeEventListener("pointermove", B), window.removeEventListener("pointerup", U), window.removeEventListener("pointercancel", U), h === "pan-window" && (l.style.cursor = "grab", y.style.cursor = "grab"), b(P, d.pointerId), M === z && (M = null));
    }, U = (Y) => {
      Y.pointerId === d.pointerId && z();
    };
    M = z, window.addEventListener("pointermove", B, { passive: false }), window.addEventListener("pointerup", U, { passive: true }), window.addEventListener("pointercancel", U, { passive: true });
  }, x = (d) => m(d, "left-handle"), w = (d) => m(d, "right-handle"), v = (d) => m(d, "pan-window");
  g.addEventListener("pointerdown", x, { passive: false }), u.addEventListener("pointerdown", w, { passive: false }), y.addEventListener("pointerdown", v, { passive: false });
  const I = t.onChange((d) => {
    p || R(d);
  });
  return R(t.getRange()), {
    update: (d) => {
      if (p) return;
      c.style.background = d.backgroundColor, c.style.borderColor = d.axisLineColor, f.style.background = d.gridLineColor, l.style.background = d.gridLineColor, l.style.border = `1px solid ${d.axisTickColor}`, l.style.borderRadius = "8px", l.style.boxSizing = "border-box";
      const h = `1px solid ${d.axisLineColor}`;
      g.style.background = d.axisTickColor, g.style.borderRight = h, u.style.background = d.axisTickColor, u.style.borderLeft = h, y.style.background = "transparent", y.style.backgroundImage = "linear-gradient(90deg, rgba(255,255,255,0.0) 0, rgba(255,255,255,0.0) 42%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.18) 46%, rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.0) 54%, rgba(255,255,255,0.18) 54%, rgba(255,255,255,0.18) 58%, rgba(255,255,255,0.0) 58%, rgba(255,255,255,0.0) 100%)", y.style.mixBlendMode = "normal";
    }, dispose: () => {
      if (!p) {
        p = true, M == null || M(), M = null;
        try {
          I();
        } catch {
        }
        g.removeEventListener("pointerdown", x), u.removeEventListener("pointerdown", w), y.removeEventListener("pointerdown", v), a.remove();
      }
    }
  };
}
const Ws = 0.01, md = (e, t) => e <= Ws && t >= 100 - Ws, pd = () => typeof navigator < "u" && navigator.maxTouchPoints > 0;
function hd(e, t, n) {
  let i = false;
  const r = pd(), o = document.createElement("button");
  o.setAttribute("data-chartgpu-zoom-reset", ""), o.setAttribute("aria-label", "Reset zoom"), o.type = "button", o.style.position = "absolute", o.style.top = "8px", o.style.right = "8px", o.style.zIndex = "10", o.style.width = "32px", o.style.height = "32px", o.style.border = "none", o.style.borderRadius = "6px", o.style.cursor = "pointer", o.style.display = "none", o.style.alignItems = "center", o.style.justifyContent = "center", o.style.fontSize = "16px", o.style.lineHeight = "1", o.style.padding = "0", o.style.touchAction = "manipulation", o.textContent = "↺";
  const s = (l) => {
    o.style.backgroundColor = l.backgroundColor, o.style.opacity = "0.8", o.style.color = l.textColor;
  };
  s(n);
  const a = () => {
    if (!r) {
      o.style.display = "none";
      return;
    }
    const { start: l, end: g } = t.getRange();
    o.style.display = md(l, g) ? "none" : "flex";
  };
  a();
  const c = () => {
    i || t.setRange(0, 100);
  };
  o.addEventListener("click", c);
  const f = t.onChange(() => {
    i || a();
  });
  return e.appendChild(o), {
    update(l) {
      i || s(l);
    },
    dispose() {
      if (!i) {
        i = true, o.removeEventListener("click", c);
        try {
          f();
        } catch {
        }
        o.remove();
      }
    }
  };
}
let Ji = null;
async function yd() {
  return Ji || (Ji = (async () => {
    if (typeof window > "u")
      return {
        supported: false,
        reason: "Not running in a browser environment (window is undefined)."
      };
    if (typeof navigator > "u")
      return {
        supported: false,
        reason: "Navigator is not available in this environment."
      };
    if (!navigator.gpu)
      return {
        supported: false,
        reason: "WebGPU API (navigator.gpu) is not available. Your browser does not support WebGPU."
      };
    try {
      let e = null;
      if (windowUserAgentIsWindows())
        e = await navigator.gpu.requestAdapter();
      else
        e = await navigator.gpu.requestAdapter({
          powerPreference: "high-performance"
        }), e || (e = await navigator.gpu.requestAdapter());
      return e ? { supported: !0 } : {
        supported: !1,
        reason: "No compatible WebGPU adapter found. This may occur if: (1) no GPU is available, (2) GPU drivers are outdated or incompatible, (3) running in a VM or headless environment, or (4) WebGPU is disabled in browser settings."
      };
    } catch (e) {
      let t = "Failed to request WebGPU adapter.";
      return e instanceof DOMException ? (t = `Failed to request WebGPU adapter: ${e.name}`, e.message && (t += ` - ${e.message}`)) : e instanceof Error ? t = `Failed to request WebGPU adapter: ${e.message}` : t = `Failed to request WebGPU adapter: ${String(e)}`, { supported: false, reason: t };
    }
  })(), Ji);
}
const jt = 120, gd = 1e3 / 60, xd = 1.5, bd = 6, vd = 500, wd = (e) => Array.isArray(e), qn = (e) => Array.isArray(e), Os = (e) => wd(e) ? { x: e[0], y: e[1] } : { x: e.x, y: e.y }, Cd = (e) => {
  const t = Ne(e);
  if (t === 0) return { x: [], y: [] };
  const n = new Array(t), i = new Array(t), r = [];
  let o = false;
  for (let s = 0; s < t; s++) {
    n[s] = Fe(e, s), i[s] = _e(e, s);
    const a = at(e, s);
    r[s] = a, a !== void 0 && (o = true);
  }
  return o ? { x: n, y: i, size: r } : { x: n, y: i };
}, xi = (e) => qn(e) ? e[0] : e.timestamp, Xs = (e) => qn(e) ? e[2] : e.close, Md = (e) => {
  var t;
  return ((t = e.dataZoom) == null ? void 0 : t.some((n) => (n == null ? void 0 : n.type) === "slider")) ?? false;
}, Sd = (e) => {
  var t;
  return ((t = e.dataZoom) == null ? void 0 : t.some((n) => (n == null ? void 0 : n.type) === "inside")) ?? false;
}, $r = (e, t, n) => Math.min(n, Math.max(t, e)), Fd = (e, t) => {
  const n = Ne(t);
  if (n === 0) return e;
  let i = e;
  if (!i)
    return zt(t);
  let r = i.xMin, o = i.xMax, s = i.yMin, a = i.yMax;
  const c = typeof t == "object" && t !== null && !Array.isArray(t) && "x" in t && "y" in t, f = typeof t == "object" && t !== null && !Array.isArray(t) && ArrayBuffer.isView(t);
  if (c) {
    const l = t;
    for (let g = 0; g < n; g++) {
      const u = l.x[g], y = l.y[g];
      !Number.isFinite(u) || !Number.isFinite(y) || (u < r && (r = u), u > o && (o = u), y < s && (s = y), y > a && (a = y));
    }
  } else if (f) {
    const l = t;
    for (let g = 0; g < n; g++) {
      const u = l[g * 2], y = l[g * 2 + 1];
      !Number.isFinite(u) || !Number.isFinite(y) || (u < r && (r = u), u > o && (o = u), y < s && (s = y), y > a && (a = y));
    }
  } else
    for (let l = 0; l < n; l++) {
      const g = Fe(t, l), u = _e(t, l);
      !Number.isFinite(g) || !Number.isFinite(u) || (g < r && (r = g), g > o && (o = g), u < s && (s = u), u > a && (a = u));
    }
  return r === o && (o = r + 1), s === a && (a = s + 1), { xMin: r, xMax: o, yMin: s, yMax: a };
}, Nd = (e, t) => {
  if (t.length === 0) return e;
  let n = (e == null ? void 0 : e.xMin) ?? Number.POSITIVE_INFINITY, i = (e == null ? void 0 : e.xMax) ?? Number.NEGATIVE_INFINITY, r = (e == null ? void 0 : e.yMin) ?? Number.POSITIVE_INFINITY, o = (e == null ? void 0 : e.yMax) ?? Number.NEGATIVE_INFINITY;
  for (let s = 0; s < t.length; s++) {
    const a = t[s], c = xi(a), f = qn(a) ? a[3] : a.low, l = qn(a) ? a[4] : a.high;
    !Number.isFinite(c) || !Number.isFinite(f) || !Number.isFinite(l) || (c < n && (n = c), c > i && (i = c), f < r && (r = f), l > o && (o = l));
  }
  return !Number.isFinite(n) || !Number.isFinite(i) || !Number.isFinite(r) || !Number.isFinite(o) ? e : (n === i && (i = n + 1), r === o && (o = r + 1), { xMin: n, xMax: i, yMin: r, yMax: o });
}, Yr = (e, t) => {
  let n = Number.POSITIVE_INFINITY, i = Number.NEGATIVE_INFINITY, r = Number.POSITIVE_INFINITY, o = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < e.length; s++) {
    const a = e[s];
    if (a.type === "pie") continue;
    const c = (t == null ? void 0 : t[s]) ?? null;
    if (c) {
      const g = c;
      if (Number.isFinite(g.xMin) && Number.isFinite(g.xMax) && Number.isFinite(g.yMin) && Number.isFinite(g.yMax)) {
        g.xMin < n && (n = g.xMin), g.xMax > i && (i = g.xMax), g.yMin < r && (r = g.yMin), g.yMax > o && (o = g.yMax);
        continue;
      }
    }
    const f = a.rawBounds ?? null;
    if (f) {
      const g = f;
      if (Number.isFinite(g.xMin) && Number.isFinite(g.xMax) && Number.isFinite(g.yMin) && Number.isFinite(g.yMax)) {
        g.xMin < n && (n = g.xMin), g.xMax > i && (i = g.xMax), g.yMin < r && (r = g.yMin), g.yMax > o && (o = g.yMax);
        continue;
      }
    }
    if (a.type === "candlestick") {
      const g = a.data;
      for (let u = 0; u < g.length; u++) {
        const y = g[u], p = xi(y), M = qn(y) ? y[3] : y.low, R = qn(y) ? y[4] : y.high;
        !Number.isFinite(p) || !Number.isFinite(M) || !Number.isFinite(R) || (p < n && (n = p), p > i && (i = p), M < r && (r = M), R > o && (o = R));
      }
      continue;
    }
    const l = zt(a.data);
    l && (l.xMin < n && (n = l.xMin), l.xMax > i && (i = l.xMax), l.yMin < r && (r = l.yMin), l.yMax > o && (o = l.yMax));
  }
  return !Number.isFinite(n) || !Number.isFinite(i) || !Number.isFinite(r) || !Number.isFinite(o) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (n === i && (i = n + 1), r === o && (o = r + 1), { xMin: n, xMax: i, yMin: r, yMax: o });
}, Gn = (e, t) => {
  let n = e, i = t;
  if ((!Number.isFinite(n) || !Number.isFinite(i)) && (n = 0, i = 1), n === i)
    i = n + 1;
  else if (n > i) {
    const r = n;
    n = i, i = r;
  }
  return { min: n, max: i };
}, bi = (e, t) => {
  if (typeof e == "number") return Number.isFinite(e) ? e : null;
  if (typeof e != "string") return null;
  const n = e.trim();
  if (n.length === 0) return null;
  if (n.endsWith("%")) {
    const r = Number.parseFloat(n.slice(0, -1));
    return Number.isFinite(r) ? r / 100 * t : null;
  }
  const i = Number.parseFloat(n);
  return Number.isFinite(i) ? i : null;
}, $s = (e, t, n) => {
  const i = (e == null ? void 0 : e[0]) ?? "50%", r = (e == null ? void 0 : e[1]) ?? "50%", o = bi(i, t), s = bi(r, n);
  return {
    x: Number.isFinite(o) ? o : t * 0.5,
    y: Number.isFinite(s) ? s : n * 0.5
  };
}, Td = (e) => Array.isArray(e), Ys = (e, t) => {
  if (e == null) return { inner: 0, outer: t * 0.7 };
  if (Td(e)) {
    const r = bi(e[0], t), o = bi(e[1], t), s = Math.max(0, Number.isFinite(r) ? r : 0), a = Math.max(s, Number.isFinite(o) ? o : t * 0.7);
    return { inner: s, outer: Math.min(t, a) };
  }
  const n = bi(e, t), i = Math.max(0, Number.isFinite(n) ? n : t * 0.7);
  return { inner: 0, outer: Math.min(t, i) };
};
async function Ad(e, t, n) {
  var Si;
  if (n) {
    if (typeof navigator > "u" || !navigator.gpu)
      throw new Error("ChartGPU: Shared device mode requires WebGPU globals (navigator.gpu) to be available.");
  } else {
    const _ = await yd();
    if (!_.supported) {
      const V = _.reason || "Unknown reason";
      throw new Error(
        `ChartGPU: WebGPU is not available.
Reason: ${V}
Browser support: Chrome/Edge 113+, Safari 18+, Firefox not yet supported.
Resources:
  - MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
  - Browser compatibility: https://caniuse.com/webgpu
  - WebGPU specification: https://www.w3.org/TR/webgpu/
  - Check your system: https://webgpureport.org/`
      );
    }
  }
  if (n != null && n.pipelineCache && n.pipelineCache.device !== n.device)
    throw new Error(
      "ChartGPU: pipelineCache.device must match the GPUDevice in the creation context. Create the pipeline cache with the same device: createPipelineCache(device)."
    );
  const i = document.createElement("canvas");
  i.style.display = "block", i.style.width = "100%", i.style.height = "100%", e.appendChild(i);
  const r = !!n;
  let o = false, s = t.renderMode ?? "auto", a = false, c = false, f = null, l = null, g = null, u = null, y = null, p, M = false, R = null, D = null, T = null, A = t, b = Vs(A), m = new Array(b.series.length).fill(null).map(() => ({ x: [], y: [] })), x = new Array(b.series.length).fill(null), w = null;
  const v = () => {
    m = new Array(b.series.length).fill(null).map(() => ({ x: [], y: [] })), x = new Array(b.series.length).fill(null), w = null;
    for (let _ = 0; _ < b.series.length; _++) {
      const V = b.series[_];
      if (V.type === "pie") {
        m[_] = { x: [], y: [] };
        continue;
      }
      if (V.type === "candlestick") {
        const oe = V.rawData ?? V.data;
        m[_] = oe.length === 0 ? [] : oe.slice(), x[_] = V.rawBounds ?? null;
      } else {
        const oe = V.rawData ?? V.data;
        m[_] = Cd(oe), x[_] = V.rawBounds ?? null ?? zt(oe);
      }
    }
  }, I = () => w || (w = b.series.map((_, V) => {
    if (_.type === "pie") return _;
    if (_.type === "candlestick")
      return { ..._, data: m[V] ?? _.data };
    const oe = m[V];
    return { ..._, data: oe };
  }), w);
  v();
  let N = Yr(b.series, x), C = null;
  const d = {
    click: /* @__PURE__ */ new Set(),
    mouseover: /* @__PURE__ */ new Set(),
    mouseout: /* @__PURE__ */ new Set(),
    crosshairMove: /* @__PURE__ */ new Set(),
    zoomRangeChange: /* @__PURE__ */ new Set(),
    deviceLost: /* @__PURE__ */ new Set(),
    dataAppend: /* @__PURE__ */ new Set()
  };
  let h = false, F = null, S = null, P = null;
  const B = /* @__PURE__ */ new Set();
  let E = null, z = null, U = true;
  const Y = new Float64Array(jt);
  let j = 0, q = 0, Z = 0, J = 0, re = 0, W = 0;
  const de = performance.now();
  let L = 0, X = 0;
  const $ = /* @__PURE__ */ new Set(), ue = () => d.mouseover.size > 0 || d.mouseout.size > 0, ce = () => d.click.size > 0, fe = () => {
    E !== null && (cancelAnimationFrame(E), E = null);
  }, K = () => {
    L = 0, J = 0, re = 0, W = 0, j = 0, q = 0;
  }, ae = (_) => {
    if (o || c || a) return;
    a = true;
    const V = performance.now();
    try {
      if (Y[j] = V, j = (j + 1) % jt, q < jt && q++, Z++, _ && (L > 0 && (V - L > gd * xd ? (J++, re++, W = V) : re = 0), L = V), gt(!1), !l || !(f != null && f.device)) return;
      if (U) {
        U = !1;
        try {
          l.render();
        } catch {
          U = !0;
        }
      }
      X = performance.now() - V;
      const oe = Jt();
      for (const ge of $)
        try {
          ge(oe);
        } catch (we) {
          console.error("Error in performance update callback:", we);
        }
    } finally {
      a = false;
    }
  }, ee = () => {
    o || (U = true, s !== "external" && E === null && (E = requestAnimationFrame(() => {
      E = null, !o && ae(true);
    })));
  }, te = () => {
    if (u)
      try {
        u();
      } finally {
        u = null;
      }
  }, be = () => {
    if (y)
      try {
        y();
      } finally {
        y = null;
      }
  }, le = () => {
    D == null || D.dispose(), D = null;
  }, ye = () => {
    R == null || R.remove(), R = null;
  }, pe = () => {
    le(), ye();
  }, Be = 32, Le = 8, rt = Be + Le, ot = () => {
    if (R) return R;
    try {
      window.getComputedStyle(e).position === "static" && (e.style.position = "relative");
    } catch {
    }
    const _ = document.createElement("div");
    return _.style.position = "absolute", _.style.left = "0", _.style.right = "0", _.style.bottom = "0", _.style.height = `${rt}px`, _.style.paddingTop = `${Le}px`, _.style.boxSizing = "border-box", _.style.pointerEvents = "auto", _.style.zIndex = "5", e.appendChild(_), R = _, _;
  }, ve = (_, V) => {
    const oe = _.end - _.start;
    return !Number.isFinite(oe) || oe === 0 ? 0.5 : $r((V - _.start) / oe, 0, 1);
  }, Te = () => ({
    getRange: () => (l == null ? void 0 : l.getZoomRange()) ?? { start: 0, end: 100 }, setRange: (me, xe) => {
      l == null || l.setZoomRange(me, xe);
    }, zoomIn: (me, xe) => {
      if (!Number.isFinite(me) || !Number.isFinite(xe) || xe <= 1) return;
      const Pe = l == null ? void 0 : l.getZoomRange();
      if (!Pe) return;
      const Ce = $r(me, 0, 100), et = ve(Pe, Ce), Ue = (Pe.end - Pe.start) / xe, ze = Ce - et * Ue;
      l == null || l.setZoomRange(ze, ze + Ue);
    }, zoomOut: (me, xe) => {
      if (!Number.isFinite(me) || !Number.isFinite(xe) || xe <= 1) return;
      const Pe = l == null ? void 0 : l.getZoomRange();
      if (!Pe) return;
      const Ce = $r(me, 0, 100), et = ve(Pe, Ce), Ue = (Pe.end - Pe.start) * xe, ze = Ce - et * Ue;
      l == null || l.setZoomRange(ze, ze + Ue);
    }, pan: (me) => {
      if (!Number.isFinite(me)) return;
      const xe = l == null ? void 0 : l.getZoomRange();
      xe && (l == null || l.setZoomRange(xe.start + me, xe.end + me));
    }, onChange: (me) => (l == null ? void 0 : l.onZoomRangeChange(me)) ?? (() => {
    })
  }), Xe = () => {
    if (!Md(A)) {
      pe();
      return;
    }
    if (!l || !l.getZoomRange()) return;
    const V = ot();
    D || (D = dd(V, Te(), {
      height: Be,
      marginTop: 0
      // host provides vertical spacing
    })), D.update(b.theme);
  }, Ke = () => {
    T == null || T.dispose(), T = null;
  }, We = () => {
    if (!Sd(A)) {
      Ke();
      return;
    }
    l && l.getZoomRange() && (T ? T.update(b.theme) : T = hd(e, Te(), b.theme));
  }, mt = { x: null, source: void 0 }, ft = { start: 0, end: 100, source: void 0, sourceKind: void 0 }, ke = { seriesIndex: 0, count: 0, xExtent: { min: 0, max: 0 } }, ct = () => {
    te(), !o && l && (u = l.onInteractionXChange((_, V) => {
      mt.x = _, mt.source = V, It("crosshairMove", mt);
    }));
  }, At = () => {
    be(), !o && l && (y = l.onZoomRangeChange((_, V) => {
      const oe = M, ge = p;
      M = false, p = void 0;
      const we = ge !== void 0 ? ge : void 0, Ie = V ?? (oe ? "api" : void 0);
      ft.start = _.start, ft.end = _.end, ft.source = we, ft.sourceKind = Ie, It("zoomRangeChange", ft);
    }));
  }, Vt = () => {
    if (o || !f || !f.initialized) return;
    const _ = (l == null ? void 0 : l.getZoomRange()) ?? null;
    te(), be(), le(), Ke(), l == null || l.dispose(), M = false, p = void 0;
    const V = {
      onRequestRender: ee,
      pipelineCache: n == null ? void 0 : n.pipelineCache
    };
    l = Of(f, b, V), g = f.preferredFormat, ct(), At(), _ && l.setZoomRange(_.start, _.end), Xe(), We();
  }, gt = (_) => {
    var St;
    if (o) return;
    const V = i.getBoundingClientRect(), oe = window.devicePixelRatio || 1, ge = ((St = f == null ? void 0 : f.device) == null ? void 0 : St.limits.maxTextureDimension2D) ?? 8192, we = Math.min(ge, Math.max(1, Math.round(V.width * oe))), Ie = Math.min(ge, Math.max(1, Math.round(V.height * oe))), me = i.width !== we || i.height !== Ie;
    me && (i.width = we, i.height = Ie);
    const xe = f == null ? void 0 : f.device, Pe = f == null ? void 0 : f.canvasContext, Ce = f == null ? void 0 : f.preferredFormat;
    let et = false;
    xe && Pe && Ce && (me || !z || z.width !== i.width || z.height !== i.height || z.format !== Ce) && (Pe.configure({
      device: xe,
      format: Ce,
      alphaMode: "opaque"
    }), z = { width: i.width, height: i.height, format: Ce }, et = true, l && g !== Ce && Vt()), _ && (me || et) && ee();
  }, _t = () => gt(true), Wt = (_) => {
    const V = i.getBoundingClientRect();
    if (!(V.width > 0) || !(V.height > 0)) return { match: null, isInGrid: false };
    const oe = _.clientX - V.left, ge = _.clientY - V.top, we = b.grid.left, Ie = b.grid.top, me = V.width - b.grid.left - b.grid.right, xe = V.height - b.grid.top - b.grid.bottom;
    if (!(me > 0) || !(xe > 0)) return { match: null, isInGrid: false };
    const Pe = oe - we, Ce = ge - Ie;
    if (!(Pe >= 0 && Pe <= me && Ce >= 0 && Ce <= xe)) return { match: null, isInGrid: false };
    const St = b.xAxis.min ?? N.xMin, Ue = b.xAxis.max ?? N.xMax, ze = b.yAxis.min ?? N.yMin, st = b.yAxis.max ?? N.yMax, Ct = Gn(St, Ue), an = (l == null ? void 0 : l.getZoomRange()) ?? null, wt = (() => {
      if (!an) return Ct;
      const Ge = Ct.max - Ct.min;
      if (!Number.isFinite(Ge) || Ge === 0) return Ct;
      const Oe = an.start, pt = an.end, Ft = Ct.min + Oe / 100 * Ge, Mt = Ct.min + pt / 100 * Ge;
      return Gn(Ft, Mt);
    })(), qe = Gn(ze, st);
    if (!(C !== null && C.rectWidthCss === V.width && C.rectHeightCss === V.height && C.plotWidthCss === me && C.plotHeightCss === xe && C.xDomainMin === wt.min && C.xDomainMax === wt.max && C.yDomainMin === qe.min && C.yDomainMax === qe.max)) {
      const Ge = yn().domain(wt.min, wt.max).range(0, me), Oe = yn().domain(qe.min, qe.max).range(xe, 0);
      C = {
        rectWidthCss: V.width,
        rectHeightCss: V.height,
        plotWidthCss: me,
        plotHeightCss: xe,
        xDomainMin: wt.min,
        xDomainMax: wt.max,
        yDomainMin: qe.min,
        yDomainMax: qe.max,
        xScale: Ge,
        yScale: Oe
      };
    }
    const Bt = C, Qt = (() => {
      const Ge = 0.5 * Math.min(me, xe);
      if (!(Ge > 0)) return null;
      for (let Oe = b.series.length - 1; Oe >= 0; Oe--) {
        const pt = b.series[Oe];
        if (pt.type !== "pie" || pt.visible === false) continue;
        const Ft = pt, Mt = $s(Ft.center, me, xe), Dn = Ys(Ft.radius, Ge), Ot = Qr(Pe, Ce, { seriesIndex: Oe, series: Ft }, Mt, Dn);
        if (!Ot) continue;
        const un = Ot.slice.value;
        return {
          kind: "pie",
          seriesIndex: Ot.seriesIndex,
          dataIndex: Ot.dataIndex,
          sliceValue: typeof un == "number" && Number.isFinite(un) ? un : 0
        };
      }
      return null;
    })();
    if (Qt) return { match: Qt, isInGrid: true };
    for (let Ge = b.series.length - 1; Ge >= 0; Ge--) {
      const Oe = b.series[Ge];
      if ((Oe == null ? void 0 : Oe.type) !== "candlestick" || Oe.visible === false) continue;
      const pt = Oe, Ft = Kr(pt, pt.data, Bt.xScale, me), Mt = Jr([pt], Pe, Ce, Bt.xScale, Bt.yScale, Ft);
      if (Mt)
        return {
          match: { kind: "candlestick", seriesIndex: Ge, dataIndex: Mt.dataIndex, point: Mt.point },
          isInGrid: true
        };
    }
    const ln = lr(
      I(),
      Pe,
      Ce,
      Bt.xScale,
      Bt.yScale
    );
    return {
      match: ln ? { kind: "cartesian", match: ln } : null,
      isInGrid: true
    };
  }, kt = () => {
    if (q < 2)
      return 0;
    const _ = (j - q + jt) % jt;
    let V = 0;
    for (let we = 1; we < q; we++) {
      const Ie = (_ + we - 1) % jt, me = (_ + we) % jt, xe = Y[me] - Y[Ie];
      V += xe;
    }
    const oe = V / (q - 1);
    return oe > 0 ? 1e3 / oe : 0;
  }, vt = () => {
    if (q < 2)
      return {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    const _ = (j - q + jt) % jt, V = new Array(q - 1);
    let oe = Number.POSITIVE_INFINITY, ge = Number.NEGATIVE_INFINITY, we = 0;
    for (let Ce = 1; Ce < q; Ce++) {
      const et = (_ + Ce - 1) % jt, St = (_ + Ce) % jt, Ue = Y[St] - Y[et];
      V[Ce - 1] = Ue, Ue < oe && (oe = Ue), Ue > ge && (ge = Ue), we += Ue;
    }
    const Ie = we / V.length;
    V.sort((Ce, et) => Ce - et);
    const me = Math.floor(V.length * 0.5), xe = Math.floor(V.length * 0.95), Pe = Math.floor(V.length * 0.99);
    return {
      min: oe,
      max: ge,
      avg: Ie,
      p50: V[me],
      p95: V[xe],
      p99: V[Pe]
    };
  }, Jt = () => {
    const _ = kt(), V = vt(), oe = {
      enabled: false,
      // GPU timing not yet implemented for main thread
      cpuTime: X,
      gpuTime: 0
    }, ge = {
      used: 0,
      peak: 0,
      allocated: 0
    }, we = s === "external" ? { totalDrops: 0, consecutiveDrops: 0, lastDropTimestamp: 0 } : {
      totalDrops: J,
      consecutiveDrops: re,
      lastDropTimestamp: W
    }, Ie = performance.now() - de;
    return {
      fps: _,
      frameTimeStats: V,
      gpuTiming: oe,
      memory: ge,
      frameDrops: we,
      totalFrames: Z,
      elapsedTime: Ie
    };
  }, Et = (_, V) => {
    if (!_)
      return { seriesIndex: null, dataIndex: null, value: null, seriesName: null, event: V };
    const oe = _.kind === "cartesian" ? _.match.seriesIndex : _.seriesIndex, ge = _.kind === "cartesian" ? _.match.dataIndex : _.dataIndex, we = b.series[oe], Ie = (we == null ? void 0 : we.name) ?? null, me = Ie && Ie.trim().length > 0 ? Ie : null;
    if (_.kind === "pie")
      return {
        seriesIndex: oe,
        dataIndex: ge,
        value: [0, _.sliceValue],
        seriesName: me,
        event: V
      };
    if (_.kind === "candlestick") {
      const Ce = xi(_.point), et = Xs(_.point);
      return {
        seriesIndex: oe,
        dataIndex: ge,
        value: [Ce, et],
        seriesName: me,
        event: V
      };
    }
    const { x: xe, y: Pe } = Os(_.match.point);
    return {
      seriesIndex: oe,
      dataIndex: ge,
      value: [xe, Pe],
      seriesName: me,
      event: V
    };
  }, It = (_, V) => {
    if (!o)
      for (const oe of d[_]) oe(V);
  }, bn = (_, V) => {
    const oe = P;
    if (P = _, oe === null && _ === null) return;
    if (oe === null && _ !== null) {
      It("mouseover", Et(_, V));
      return;
    }
    if (oe !== null && _ === null) {
      It("mouseout", Et(oe, V));
      return;
    }
    if (oe === null || _ === null) return;
    const ge = oe.kind === "cartesian" ? oe.match.seriesIndex : oe.seriesIndex, we = oe.kind === "cartesian" ? oe.match.dataIndex : oe.dataIndex, Ie = _.kind === "cartesian" ? _.match.seriesIndex : _.seriesIndex, me = _.kind === "cartesian" ? _.match.dataIndex : _.dataIndex;
    ge === Ie && we === me || (It("mouseout", Et(oe, V)), It("mouseover", Et(_, V)));
  }, vn = (_) => {
    F && _.isPrimary && _.pointerId === F.pointerId && (F = null);
  }, Kn = (_) => {
    if (o || !ue()) return;
    const { match: V, isInGrid: oe } = Wt(_);
    if (!oe) {
      bn(null, _);
      return;
    }
    bn(V, _);
  }, wi = (_) => {
    o || !ue() && !F || (vn(_), bn(null, _));
  }, Jn = (_) => {
    o || !ue() && !F || (vn(_), bn(null, _));
  }, Ci = (_) => {
    if (!o && !(!ue() && !F && S !== _.pointerId)) {
      if (S === _.pointerId) {
        S = null;
        return;
      }
      vn(_), bn(null, _);
    }
  }, wn = (_) => {
    if (!o && ce() && _.isPrimary && !(_.pointerType === "mouse" && _.button !== 0)) {
      F = {
        pointerId: _.pointerId,
        startClientX: _.clientX,
        startClientY: _.clientY,
        startTimeMs: _.timeStamp
      };
      try {
        i.setPointerCapture(_.pointerId);
      } catch {
      }
    }
  }, Mi = (_) => {
    if (o || !ce() || !_.isPrimary || !F || _.pointerId !== F.pointerId) return;
    const V = _.timeStamp - F.startTimeMs, oe = _.clientX - F.startClientX, ge = _.clientY - F.startClientY, we = oe * oe + ge * ge;
    F = null;
    try {
      i.hasPointerCapture(_.pointerId) && (S = _.pointerId, i.releasePointerCapture(_.pointerId));
    } catch {
    }
    const Ie = bd;
    if (!(V <= vd && we <= Ie * Ie)) return;
    const { match: xe } = Wt(_);
    It("click", Et(xe, _));
  };
  i.addEventListener("pointermove", Kn, { passive: true }), i.addEventListener("pointerleave", wi, { passive: true }), i.addEventListener("pointercancel", Jn, { passive: true }), i.addEventListener("lostpointercapture", Ci, { passive: true }), i.addEventListener("pointerdown", wn, { passive: true }), i.addEventListener("pointerup", Mi, { passive: true });
  const Qn = () => {
    if (!o) {
      o = true;
      try {
        fe(), pe(), Ke(), te(), be(), l == null || l.dispose(), l = null, g = null, f == null || f.destroy();
      } finally {
        F = null, S = null, P = null, C = null, M = false, p = void 0, i.removeEventListener("pointermove", Kn), i.removeEventListener("pointerleave", wi), i.removeEventListener("pointercancel", Jn), i.removeEventListener("lostpointercapture", Ci), i.removeEventListener("pointerdown", wn), i.removeEventListener("pointerup", Mi), d.click.clear(), d.mouseover.clear(), d.mouseout.clear(), d.crosshairMove.clear(), d.zoomRangeChange.clear(), d.deviceLost.clear(), d.dataAppend.clear(), h = false, f = null, i.remove();
      }
    }
  }, ei = {
    get options() {
      return A;
    },
    get disposed() {
      return o;
    },
    setOption(_) {
      o || (A = _, b = Vs(_), l == null || l.setOptions(b), v(), N = Yr(b.series, x), C = null, Xe(), We(), ee());
    },
    appendData(_, V) {
      if (o || !Number.isFinite(_) || _ < 0 || _ >= b.series.length) return;
      const oe = b.series[_];
      if (oe.type === "pie") {
        B.has(_) || (B.add(_), console.warn(
          `ChartGPU.appendData(${_}, ...): pie series are not supported by streaming append. Use setOption(...) to replace pie data.`
        ));
        return;
      }
      let ge = 0;
      if (oe.type === "candlestick") {
        if (!Array.isArray(V)) return;
        ge = V.length;
      } else
        ge = Ne(V);
      if (ge === 0) return;
      l == null || l.appendData(_, V);
      let we = Number.POSITIVE_INFINITY, Ie = Number.NEGATIVE_INFINITY;
      if (oe.type === "candlestick") {
        const me = m[_], xe = Array.isArray(me) ? me : [], Pe = V;
        if (h)
          for (let Ce = 0; Ce < ge; Ce++) {
            const et = xi(Pe[Ce]);
            Number.isFinite(et) && (et < we && (we = et), et > Ie && (Ie = et));
          }
        xe.push(...Pe), m[_] = xe, x[_] = Nd(
          x[_],
          Pe
        );
      } else {
        const me = m[_], xe = V, Pe = typeof xe == "object" && xe !== null && !Array.isArray(xe) && "x" in xe && "y" in xe, Ce = typeof xe == "object" && xe !== null && !Array.isArray(xe) && ArrayBuffer.isView(xe);
        let et = false;
        const St = new Array(ge);
        if (Pe) {
          const Ue = xe;
          for (let ze = 0; ze < ge; ze++) {
            const st = Ue.x[ze];
            me.x.push(st), me.y.push(Ue.y[ze]), h && Number.isFinite(st) && (st < we && (we = st), st > Ie && (Ie = st));
          }
          if (Ue.size) {
            et = true;
            for (let ze = 0; ze < ge; ze++)
              St[ze] = Ue.size[ze];
          }
        } else if (Ce) {
          const Ue = xe;
          for (let ze = 0; ze < ge; ze++) {
            const st = Ue[ze * 2];
            me.x.push(st), me.y.push(Ue[ze * 2 + 1]), h && Number.isFinite(st) && (st < we && (we = st), st > Ie && (Ie = st));
          }
        } else
          for (let Ue = 0; Ue < ge; Ue++) {
            const ze = Fe(xe, Ue);
            me.x.push(ze), me.y.push(_e(xe, Ue));
            const st = at(xe, Ue);
            St[Ue] = st, st !== void 0 && (et = true), h && Number.isFinite(ze) && (ze < we && (we = ze), ze > Ie && (Ie = ze));
          }
        (me.size || et) && (me.size || (me.size = new Array(me.x.length - ge)), me.size.push(...St)), x[_] = Fd(
          x[_],
          xe
        );
      }
      N = Yr(b.series, x), w = null, C = null, ee(), h && ((!Number.isFinite(we) || !Number.isFinite(Ie)) && (we = 0, Ie = 0), ke.seriesIndex = _, ke.count = ge, ke.xExtent.min = we, ke.xExtent.max = Ie, It("dataAppend", ke));
    },
    renderFrame() {
      if (o || c) return false;
      if (s === "auto")
        return console.warn('renderFrame() called in auto mode - this is a no-op. Set renderMode to "external" to use manual rendering.'), false;
      if (a || !l || !(f != null && f.device) || !U) return false;
      try {
        return ae(!1), !0;
      } catch {
        return false;
      }
    },
    needsRender: () => o ? false : U,
    getRenderMode: () => s,
    setRenderMode(_) {
      if (!o) {
        if (_ !== "auto" && _ !== "external") {
          console.warn(`setRenderMode(): invalid mode '${String(_)}', ignoring.`);
          return;
        }
        s !== _ && (K(), s = _, _ === "external" ? fe() : U && ee());
      }
    },
    resize: _t,
    dispose: Qn,
    on(_, V) {
      o || (d[_].add(V), _ === "dataAppend" && (h = true));
    },
    off(_, V) {
      d[_].delete(V), _ === "dataAppend" && (h = d.dataAppend.size > 0);
    },
    getInteractionX() {
      return o ? null : (l == null ? void 0 : l.getInteractionX()) ?? null;
    },
    setInteractionX(_, V) {
      o || l == null || l.setInteractionX(_, V);
    },
    setCrosshairX(_, V) {
      o || l == null || l.setInteractionX(_, V);
    },
    onInteractionXChange(_) {
      return o ? () => {
      } : (l == null ? void 0 : l.onInteractionXChange(_)) ?? (() => {
      });
    },
    getZoomRange() {
      return o ? null : (l == null ? void 0 : l.getZoomRange()) ?? null;
    },
    setZoomRange(_, V, oe) {
      if (o || !l) return;
      const ge = l.getZoomRange();
      if (!ge) return;
      M = true, p = oe, l.setZoomRange(_, V);
      const we = l.getZoomRange();
      (!we || we.start === ge.start && we.end === ge.end) && (M = false, p = void 0);
    },
    getPerformanceMetrics() {
      return o ? null : Jt();
    },
    getPerformanceCapabilities() {
      return o ? null : {
        gpuTimingSupported: false,
        // Not yet implemented for main thread
        highResTimerSupported: typeof performance < "u" && typeof performance.now == "function",
        performanceMetricsSupported: true
      };
    },
    onPerformanceUpdate(_) {
      return o ? () => {
      } : ($.add(_), () => {
        $.delete(_);
      });
    },
    hitTest(_) {
      const V = i.getBoundingClientRect(), oe = _.clientX - V.left, ge = _.clientY - V.top;
      if (o || !(V.width > 0) || !(V.height > 0))
        return {
          isInGrid: false,
          canvasX: oe,
          canvasY: ge,
          gridX: 0,
          gridY: 0,
          match: null
        };
      const we = b.grid.left, Ie = b.grid.top, me = V.width - b.grid.left - b.grid.right, xe = V.height - b.grid.top - b.grid.bottom, Pe = oe - we, Ce = ge - Ie;
      if (!(me > 0) || !(xe > 0))
        return {
          isInGrid: false,
          canvasX: oe,
          canvasY: ge,
          gridX: Pe,
          gridY: Ce,
          match: null
        };
      if (!(Pe >= 0 && Pe <= me && Ce >= 0 && Ce <= xe))
        return {
          isInGrid: false,
          canvasX: oe,
          canvasY: ge,
          gridX: Pe,
          gridY: Ce,
          match: null
        };
      const St = b.xAxis.min ?? N.xMin, Ue = b.xAxis.max ?? N.xMax, ze = b.yAxis.min ?? N.yMin, st = b.yAxis.max ?? N.yMax, Ct = Gn(St, Ue), an = (l == null ? void 0 : l.getZoomRange()) ?? null, wt = (() => {
        if (!an) return Ct;
        const Ge = Ct.max - Ct.min;
        if (!Number.isFinite(Ge) || Ge === 0) return Ct;
        const Oe = an.start, pt = an.end, Ft = Ct.min + Oe / 100 * Ge, Mt = Ct.min + pt / 100 * Ge;
        return Gn(Ft, Mt);
      })(), qe = Gn(ze, st);
      if (!(C !== null && C.rectWidthCss === V.width && C.rectHeightCss === V.height && C.plotWidthCss === me && C.plotHeightCss === xe && C.xDomainMin === wt.min && C.xDomainMax === wt.max && C.yDomainMin === qe.min && C.yDomainMax === qe.max)) {
        const Ge = yn().domain(wt.min, wt.max).range(0, me), Oe = yn().domain(qe.min, qe.max).range(xe, 0);
        C = {
          rectWidthCss: V.width,
          rectHeightCss: V.height,
          plotWidthCss: me,
          plotHeightCss: xe,
          xDomainMin: wt.min,
          xDomainMax: wt.max,
          yDomainMin: qe.min,
          yDomainMax: qe.max,
          xScale: Ge,
          yScale: Oe
        };
      }
      const Bt = C, Qt = (() => {
        const Ge = 0.5 * Math.min(me, xe);
        if (!(Ge > 0)) return null;
        for (let Oe = b.series.length - 1; Oe >= 0; Oe--) {
          const pt = b.series[Oe];
          if (pt.type !== "pie" || pt.visible === false) continue;
          const Ft = pt, Mt = $s(Ft.center, me, xe), Dn = Ys(Ft.radius, Ge), Ot = Qr(Pe, Ce, { seriesIndex: Oe, series: Ft }, Mt, Dn);
          if (!Ot) continue;
          const un = Ot.slice.value;
          return {
            kind: "pie",
            seriesIndex: Ot.seriesIndex,
            dataIndex: Ot.dataIndex,
            sliceValue: typeof un == "number" && Number.isFinite(un) ? un : 0
          };
        }
        return null;
      })();
      if (Qt)
        return {
          isInGrid: true,
          canvasX: oe,
          canvasY: ge,
          gridX: Pe,
          gridY: Ce,
          match: {
            kind: "pie",
            seriesIndex: Qt.seriesIndex,
            dataIndex: Qt.dataIndex,
            value: [0, Qt.sliceValue]
          }
        };
      for (let Ge = b.series.length - 1; Ge >= 0; Ge--) {
        const Oe = b.series[Ge];
        if ((Oe == null ? void 0 : Oe.type) !== "candlestick" || Oe.visible === false) continue;
        const pt = Oe, Ft = Kr(pt, pt.data, Bt.xScale, me), Mt = Jr([pt], Pe, Ce, Bt.xScale, Bt.yScale, Ft);
        if (!Mt) continue;
        const Dn = xi(Mt.point), Ot = Xs(Mt.point);
        return {
          isInGrid: true,
          canvasX: oe,
          canvasY: ge,
          gridX: Pe,
          gridY: Ce,
          match: {
            kind: "candlestick",
            seriesIndex: Ge,
            dataIndex: Mt.dataIndex,
            value: [Dn, Ot]
          }
        };
      }
      const ln = lr(
        I(),
        Pe,
        Ce,
        Bt.xScale,
        Bt.yScale
      );
      if (ln) {
        const { x: Ge, y: Oe } = Os(ln.point);
        return {
          isInGrid: true,
          canvasX: oe,
          canvasY: ge,
          gridX: Pe,
          gridY: Ce,
          match: {
            kind: "cartesian",
            seriesIndex: ln.seriesIndex,
            dataIndex: ln.dataIndex,
            value: [Ge, Oe]
          }
        };
      }
      return {
        isInGrid: true,
        canvasX: oe,
        canvasY: ge,
        gridX: Pe,
        gridY: Ce,
        match: null
      };
    }
  };
  try {
    gt(!1);
    try {
      const _ = n ? { device: n.device, adapter: n.adapter } : void 0;
      f = await oo.create(i, _);
    } catch (_) {
      const V = _ instanceof Error ? _.message : String(_);
      throw new Error(
        `ChartGPU: WebGPU is not available.
Reason: ${V}
Browser support: Chrome/Edge 113+, Safari 18+, Firefox not yet supported.
Resources:
  - MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
  - Browser compatibility: https://caniuse.com/webgpu
  - WebGPU specification: https://www.w3.org/TR/webgpu/
  - Check your system: https://webgpureport.org/`
      );
    }
    return (Si = f.device) == null || Si.lost.then((_) => {
      c = !0, !o && (_.reason !== "destroyed" && console.warn("WebGPU device lost:", _), r && _.reason !== "destroyed" && It("deviceLost", { reason: _.reason, message: _.message }), Qn());
    }), gt(!1), Vt(), Xe(), We(), s === "auto" && ee(), ei;
  } catch (_) {
    throw ei.dispose(), _;
  }
}

var _tmpl$$3 = /* @__PURE__ */ template(`<div class=chart-container style=width:100%;height:100%;position:relative><div style="position:absolute;border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);pointer-events:none;display:none;z-index:5">`), _tmpl$2$2 = /* @__PURE__ */ template(`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted, #888)">Loading chart engine...`), _tmpl$3$2 = /* @__PURE__ */ template(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-text-muted, #888);font-size:14px;gap:8px"><span>Chart engine unavailable</span><small style=font-size:12px;max-width:300px;text-align:center>`);
const CHART_GRID = {
  left: 120,
  right: 30};
const MIN_DRAG_PX = 8;
const ChartView = (props) => {
  let containerRef;
  let selectionBoxRef;
  const [chartStatus, setChartStatus] = createSignal("loading");
  const [engineName, setEngineName] = createSignal("");
  const [webgpuReason, setWebgpuReason] = createSignal("");
  const [drag, setDrag] = createSignal(null);
  const [viewportBounds, setViewportBounds] = createSignal({
    xMin: 0,
    xMax: 100,
    yMin: 0,
    yMax: 1
  });
  const [themeVersion, setThemeVersion] = createSignal(0);
  let chartInstance = null;
  let resizeObserver = null;
  const activeTemplate = createMemo(() => getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme));
  const echartsThemeName = createMemo(() => `edatime-${activeTemplate().id}`);
  const registerTheme$1 = () => {
    const tmpl = activeTemplate();
    registerTheme(echartsThemeName(), toEChartsTheme(tmpl));
  };
  const initChart = async () => {
    if (!containerRef) return;
    console.debug("[ChartView] initChart: START, current status:", chartStatus());
    setChartStatus("loading");
    console.debug("[ChartView] initChart: set loading, containerRef:", !!containerRef);
    const template = activeTemplate();
    console.debug("[ChartView] initChart: theme =", template.id, "colorScale =", uiStore.state.colorScale);
    if (chartInstance) {
      try {
        chartInstance.dispose?.();
      } catch (_) {
      }
      chartInstance = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    registerTheme$1();
    try {
      let webgpuSupported = true;
      try {
        if (typeof navigator !== "undefined" && !navigator.gpu) {
          webgpuSupported = false;
        }
      } catch (_) {
        webgpuSupported = false;
      }
      if (!webgpuSupported) {
        throw new Error("WebGPU not available");
      }
      const chartOpts = {
        grid: {
          left: 120,
          right: 30,
          top: 16,
          bottom: 36
        },
        xAxis: {
          type: "time",
          name: props.xAxisLabel
        },
        yAxis: {
          type: "value",
          name: props.yAxisLabel
        },
        legend: {
          show: true,
          position: "right"
        },
        series: [],
        theme: activeTemplate().id
      };
      console.debug("[ChartView] createChart options:", {
        theme: chartOpts.theme
      });
      chartInstance = await Ad(containerRef, chartOpts);
      chartInstance.on("zoomRangeChange", (payload) => {
        const start = Number(payload?.start);
        const end = Number(payload?.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          props.onZoom?.(start, end);
        }
      });
      setEngineName("ChartGPU");
      props.onEngineReady?.("ChartGPU");
      setChartStatus("ready");
    } catch (e) {
      console.warn("ChartGPU not available, falling back to ECharts:", e);
      try {
        const cleanup = () => {
          if (!containerRef) return;
          while (containerRef.firstChild) {
            containerRef.removeChild(containerRef.firstChild);
          }
        };
        cleanup();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!containerRef || !containerRef.parentNode) {
          throw new Error("Chart container is no longer in the DOM");
        }
        cleanup();
        const echartsInstance = init(containerRef, echartsThemeName(), {
          renderer: "canvas"
        });
        chartInstance = echartsInstance;
        echartsInstance.setOption({
          grid: {
            left: 120,
            right: 30,
            top: 16,
            bottom: 36
          },
          xAxis: {
            type: "time",
            name: props.xAxisLabel
          },
          yAxis: {
            type: "value",
            name: props.yAxisLabel
          },
          legend: {
            show: true,
            position: "right"
          },
          series: [],
          color: getColorPalette(uiStore.state.colorScale, 8),
          ...props.chartTitle ? {
            title: {
              text: props.chartTitle,
              left: "center"
            }
          } : {}
        });
        echartsInstance.on("dataZoom", () => {
          const option = echartsInstance.getOption();
          const xAxis = option?.xAxis;
          if (xAxis?.[0]?.min !== void 0 && xAxis?.[0]?.max !== void 0) {
            const start = typeof xAxis[0].min === "number" ? xAxis[0].min : Number(xAxis[0].min);
            const end = typeof xAxis[0].max === "number" ? xAxis[0].max : Number(xAxis[0].max);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
              props.onZoom?.(start, end);
            }
          }
        });
        setEngineName("ECharts");
        setChartStatus("ready");
        resizeObserver = new ResizeObserver(() => echartsInstance.resize());
        resizeObserver.observe(containerRef);
      } catch (echartsErr) {
        console.error("ECharts fallback also failed:", echartsErr);
        const msg = e instanceof Error ? e.message : String(e);
        setWebgpuReason(msg);
        setChartStatus("error");
      }
    }
  };
  const handleUpdateChart = (series, xMin, xMax, yMin, yMax) => {
    if (!chartInstance) {
      console.debug("[ChartView] handleUpdateChart: no chartInstance");
      return;
    }
    console.debug("[ChartView] handleUpdateChart: engine =", engineName(), "seriesLen =", series?.length, "chartInstance id =", chartInstance._chartId ?? "unknown");
    const prevVisibility = chartStore.getAllSeriesVisibility();
    const seriesWithVisibility = series.map((s) => ({
      ...s,
      visible: prevVisibility[s.name] !== false
    }));
    let dataYMin = Number.POSITIVE_INFINITY;
    let dataYMax = Number.NEGATIVE_INFINITY;
    for (const s of series) {
      if (Array.isArray(s.data)) {
        for (const pt of s.data) {
          const y = Number(pt?.[1]);
          if (Number.isFinite(y)) {
            if (y < dataYMin) dataYMin = y;
            if (y > dataYMax) dataYMax = y;
          }
        }
      }
    }
    if (Number.isFinite(dataYMin) && Number.isFinite(dataYMax)) {
      chartStore.setLastDataYRange(dataYMin, dataYMax);
    }
    const opts = {
      grid: {
        left: 120,
        right: 30,
        top: 16,
        bottom: 36
      },
      xAxis: {
        type: "time"
      },
      yAxis: {
        type: "value"
      },
      legend: {
        show: true,
        position: "right"
      },
      series: seriesWithVisibility
    };
    if (xMin !== void 0 && xMax !== void 0) {
      opts.xAxis = {
        type: "time",
        min: xMin,
        max: xMax
      };
      setViewportBounds({
        xMin,
        xMax,
        yMin: yMin ?? 0,
        yMax: yMax ?? 1
      });
    }
    if (yMin !== void 0 && yMax !== void 0 && !chartStore.state.yAuto) {
      opts.yAxis = {
        type: "value",
        min: yMin,
        max: yMax
      };
    }
    const tooltipFormatter = (params) => {
      const rawList = Array.isArray(params) ? params : [params];
      const seen = /* @__PURE__ */ new Set();
      const list = rawList.filter((p) => {
        const pp = p;
        const base = String(pp?.seriesName ?? "").replace(/__color_seg__.*/, "");
        if (!base || seen.has(base)) return false;
        seen.add(base);
        return true;
      });
      if (list.length === 0) return "";
      const first = list[0];
      const x = Number(first?.value?.[0]);
      const date = Number.isFinite(x) ? new Date(x).toISOString().replace("T", " ").slice(0, 19) : "";
      const rows = list.map((p) => {
        const pp = p;
        const name = String(pp?.seriesName ?? "series").replace(/__color_seg__.*/, "");
        const y = Number.isFinite(pp?.value?.[1]) ? pp.value[1].toFixed(2) : "NaN";
        return `<div style="display:flex;justify-content:space-between;gap:12px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${y}</span></div>`;
      }).join("");
      return date ? `<div style="opacity:0.8;margin-bottom:6px;">${date}</div>${rows}` : rows;
    };
    opts.tooltip = {
      show: true,
      trigger: "axis",
      formatter: tooltipFormatter
    };
    console.debug("[ChartView] updateChart called", {
      engine: engineName(),
      seriesLen: seriesWithVisibility.length,
      firstSeriesPoints: seriesWithVisibility[0]?.data?.length,
      yAuto: chartStore.state.yAuto
    });
    chartInstance.setOption(opts);
    chartInstance.resize();
    const newVisibility = {};
    for (const s of series) {
      newVisibility[s.name] = s.visible !== false;
    }
    for (const [name, visible] of Object.entries(newVisibility)) {
      chartStore.setSeriesVisibility(name, visible);
    }
  };
  onMount(async () => {
    await initChart();
    if (chartStatus() === "ready") {
      props.onReady?.(handleUpdateChart);
    }
  });
  createEffect(() => {
    void uiStore.state.plotTheme;
    void uiStore.state.colorScale;
    setThemeVersion((v) => v + 1);
  });
  createEffect(() => {
    void themeVersion();
    if (!chartInstance) return;
    const currentEngine = engineName();
    console.debug("[ChartView] themeVersion effect: engine =", currentEngine, "plotTheme =", uiStore.state.plotTheme, "uiTheme =", uiStore.state.theme);
    if (currentEngine === "ECharts") {
      registerTheme$1();
      chartInstance.setOption({
        backgroundColor: activeTemplate().background,
        color: getColorPalette(uiStore.state.colorScale, 8)
      });
    } else if (currentEngine === "ChartGPU") {
      console.debug("[ChartView] recreating ChartGPU for theme change");
      const oldInstance = chartInstance;
      chartInstance = null;
      oldInstance?.dispose?.();
      initChart().then(() => {
        console.debug("[ChartView] ChartGPU recreated, chartStatus =", chartStatus());
        if (chartStatus() === "ready") {
          props.onReady?.(handleUpdateChart);
          props.onEngineChanged?.(engineName());
        }
      });
    }
  });
  createEffect(() => {
    if (!chartInstance) return;
    const labelOpts = {
      xAxis: {
        type: "time",
        name: props.xAxisLabel
      },
      yAxis: {
        type: "value",
        name: props.yAxisLabel
      }
    };
    if (engineName() === "ECharts" && props.chartTitle) {
      labelOpts.title = {
        text: props.chartTitle,
        left: "center"
      };
    }
    chartInstance.setOption(labelOpts, false);
  });
  const handlePointerDown = (e) => {
    if (props.drawMode !== "zoom") return;
    if (e.button !== 0) return;
    const rect = containerRef?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    containerRef?.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      startX: x,
      endX: x,
      startY: y,
      endY: y
    });
  };
  const handlePointerMove = (e) => {
    const d = drag();
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = containerRef?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({
      ...d,
      endX: x,
      endY: y
    });
    if (selectionBoxRef) {
      const left = Math.min(d.startX, x);
      const top = Math.min(d.startY, y);
      const width = Math.abs(x - d.startX);
      const height = Math.abs(y - d.startY);
      selectionBoxRef.style.left = `${left}px`;
      selectionBoxRef.style.top = `${top}px`;
      selectionBoxRef.style.width = `${width}px`;
      selectionBoxRef.style.height = `${height}px`;
      selectionBoxRef.style.display = "block";
    }
  };
  const handlePointerUp = (e) => {
    const d = drag();
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = containerRef?.getBoundingClientRect();
    if (!rect) return;
    containerRef?.releasePointerCapture(e.pointerId);
    const dx = Math.abs(d.endX - d.startX);
    const xMin = Math.min(d.startX, d.endX);
    const xMax = Math.max(d.startX, d.endX);
    if (dx >= MIN_DRAG_PX && props.onZoom) {
      const plotLeft = CHART_GRID.left;
      const plotRight = rect.width - CHART_GRID.right;
      const plotWidth = Math.max(1, plotRight - plotLeft);
      const vb = viewportBounds();
      const dataXMin = vb.xMin + (xMin - plotLeft) / plotWidth * (vb.xMax - vb.xMin);
      const dataXMax = vb.xMin + (xMax - plotLeft) / plotWidth * (vb.xMax - vb.xMin);
      if (dataXMax > dataXMin) {
        props.onZoom(dataXMin, dataXMax);
      }
    }
    setDrag(null);
    if (selectionBoxRef) {
      selectionBoxRef.style.display = "none";
    }
  };
  const handleDoubleClick = () => {
    props.onZoomOut?.();
  };
  onCleanup(() => {
    resizeObserver?.disconnect();
    if (chartInstance) {
      try {
        chartInstance.dispose?.();
      } catch (_) {
      }
      chartInstance = null;
    }
  });
  return (() => {
    var _el$ = _tmpl$$3(), _el$2 = _el$.firstChild;
    _el$.$$dblclick = handleDoubleClick;
    _el$.$$pointerup = handlePointerUp;
    _el$.$$pointermove = handlePointerMove;
    _el$.$$pointerdown = handlePointerDown;
    var _ref$ = containerRef;
    typeof _ref$ === "function" ? use(_ref$, _el$) : containerRef = _el$;
    insert(_el$, (() => {
      var _c$ = memo(() => chartStatus() === "loading");
      return () => _c$() && _tmpl$2$2();
    })(), _el$2);
    insert(_el$, (() => {
      var _c$2 = memo(() => chartStatus() === "error");
      return () => _c$2() && (() => {
        var _el$4 = _tmpl$3$2(), _el$5 = _el$4.firstChild, _el$6 = _el$5.nextSibling;
        insert(_el$6, webgpuReason);
        return _el$4;
      })();
    })(), _el$2);
    var _ref$2 = selectionBoxRef;
    typeof _ref$2 === "function" ? use(_ref$2, _el$2) : selectionBoxRef = _el$2;
    insert(_el$, (() => {
      var _c$3 = memo(() => chartStatus() === "ready");
      return () => _c$3() && createComponent(CanvasOverlay, {
        get rollingBands() {
          return props.rollingBands ?? [];
        },
        get anomalyRegions() {
          return props.anomalyRegions ?? [];
        },
        get xMin() {
          return viewportBounds().xMin;
        },
        get xMax() {
          return viewportBounds().xMax;
        },
        get yMin() {
          return viewportBounds().yMin;
        },
        get yMax() {
          return viewportBounds().yMax;
        },
        get drawMode() {
          return props.drawMode ?? "pan";
        },
        get drag() {
          return drag();
        },
        get containerWidth() {
          return containerRef?.clientWidth ?? 1200;
        },
        get containerHeight() {
          return containerRef?.clientHeight ?? 600;
        }
      });
    })(), null);
    createRenderEffect((_p$) => {
      var _v$ = props.containerId ?? "main-chart", _v$2 = chartStatus(), _v$3 = activeTemplate().background;
      _v$ !== _p$.e && setAttribute(_el$, "id", _p$.e = _v$);
      _v$2 !== _p$.t && setAttribute(_el$, "data-status", _p$.t = _v$2);
      _v$3 !== _p$.a && setStyleProperty(_el$, "background-color", _p$.a = _v$3);
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0
    });
    return _el$;
  })();
};
delegateEvents(["pointerdown", "pointermove", "pointerup", "dblclick"]);

const body$1 = "_body_csldj_1";
const field$1 = "_field_csldj_7";
const label = "_label_csldj_13";
const select = "_select_csldj_19";
const grid = "_grid_csldj_35";
const input = "_input_csldj_41";
const rangeStack = "_rangeStack_csldj_56";
const rangeValues = "_rangeValues_csldj_62";
const rangeTrack = "_rangeTrack_csldj_70";
const rangeFill = "_rangeFill_csldj_77";
const rangeInput = "_rangeInput_csldj_86";
const rangeMin = "_rangeMin_csldj_133";
const rangeMax = "_rangeMax_csldj_137";
const rangeCaptions = "_rangeCaptions_csldj_141";
const hint = "_hint_csldj_148";
const footer = "_footer_csldj_154";
const footerRight = "_footerRight_csldj_161";
const ghostBtn$1 = "_ghostBtn_csldj_166";
const primaryBtn$1 = "_primaryBtn_csldj_182";
const styles$2 = {
	body: body$1,
	field: field$1,
	label: label,
	select: select,
	grid: grid,
	input: input,
	rangeStack: rangeStack,
	rangeValues: rangeValues,
	rangeTrack: rangeTrack,
	rangeFill: rangeFill,
	rangeInput: rangeInput,
	rangeMin: rangeMin,
	rangeMax: rangeMax,
	rangeCaptions: rangeCaptions,
	hint: hint,
	footer: footer,
	footerRight: footerRight,
	ghostBtn: ghostBtn$1,
	primaryBtn: primaryBtn$1
};

var _tmpl$$2 = /* @__PURE__ */ template(`<div><button type=button>Clear</button><div><button type=button>Cancel</button><button type=button>Apply`), _tmpl$2$1 = /* @__PURE__ */ template(`<div>`), _tmpl$3$1 = /* @__PURE__ */ template(`<div><label><span>Column</span><select aria-label="Select column"></select></label><div><label><span>Min</span><input type=number step=0.01 aria-label="Minimum value"></label><label><span>Max</span><input type=number step=0.01 aria-label="Maximum value"></label></div><div><span>Range slider</span><div aria-hidden=true><span></span><span></span></div><div><div></div><input type=range step=0.01 aria-label="Minimum range slider"><input type=range step=0.01 aria-label="Maximum range slider"></div><div><span>Min</span><span>Max`), _tmpl$4$1 = /* @__PURE__ */ template(`<option>`);
const ColumnFilterModal = (props) => {
  const [selectedCol, setSelectedCol] = createSignal("");
  const [minVal, setMinVal] = createSignal("");
  const [maxVal, setMaxVal] = createSignal("");
  const [minRange, setMinRange] = createSignal("0");
  const [maxRange, setMaxRange] = createSignal("1");
  const [hint, setHint] = createSignal("");
  createEffect(() => {
    if (props.open) {
      const col = props.column || props.columns[0] || "";
      setSelectedCol(col);
      refreshForColumn(col);
    }
  });
  const refreshForColumn = (col) => {
    if (!col) {
      setMinVal("");
      setMaxVal("");
      setHint("Select a column to filter.");
      return;
    }
    const bound = props.bounds[col];
    const current = props.currentFilters[col];
    if (!bound) {
      setHint("No numeric range is available for this column.");
      return;
    }
    bound.max - bound.min;
    setMinRange(String(bound.min));
    setMaxRange(String(bound.max));
    if (current) {
      setMinVal(String(current.min));
      setMaxVal(String(current.max));
      setMinRange(String(current.min));
      setMaxRange(String(current.max));
      setHint(`Available range: ${bound.min.toFixed(2)} → ${bound.max.toFixed(2)}`);
    } else {
      setMinVal(String(bound.min));
      setMaxVal(String(bound.max));
      setHint(`Available range: ${bound.min.toFixed(2)} → ${bound.max.toFixed(2)}`);
    }
  };
  const handleColChange = (e) => {
    const col = e.target.value;
    setSelectedCol(col);
    refreshForColumn(col);
  };
  const handleMinInput = (e) => {
    const v = e.target.value;
    setMinVal(v);
    if (v && !isNaN(parseFloat(v))) {
      setMinRange(v);
    }
  };
  const handleMaxInput = (e) => {
    const v = e.target.value;
    setMaxVal(v);
    if (v && !isNaN(parseFloat(v))) {
      setMaxRange(v);
    }
  };
  const handleMinRange = (e) => {
    const v = e.target.value;
    setMinRange(v);
    setMinVal(v);
  };
  const handleMaxRange = (e) => {
    const v = e.target.value;
    setMaxRange(v);
    setMaxVal(v);
  };
  const getActiveBounds = () => {
    const col = selectedCol();
    return col ? props.bounds[col] : null;
  };
  const getRangeFillStyle = () => {
    const bounds2 = getActiveBounds();
    if (!bounds2) return {
      left: "0%",
      width: "0%"
    };
    const span = bounds2.max - bounds2.min;
    if (span <= 0) return {
      left: "0%",
      width: "100%"
    };
    const from = parseFloat(minRange()) || bounds2.min;
    const to = parseFloat(maxRange()) || bounds2.max;
    const leftPct = (from - bounds2.min) / span * 100;
    const rightPct = (to - bounds2.min) / span * 100;
    return {
      left: `${Math.max(0, Math.min(100, leftPct))}%`,
      width: `${Math.max(0, Math.min(100, rightPct - leftPct))}%`
    };
  };
  const handleApply = () => {
    const col = selectedCol();
    if (!col) return;
    let from = parseFloat(minVal());
    let to = parseFloat(maxVal());
    const bounds2 = getActiveBounds();
    if (bounds2) {
      if (!isFinite(from)) from = bounds2.min;
      if (!isFinite(to)) to = bounds2.max;
    }
    if (!isFinite(from) || !isFinite(to)) {
      setHint("Enter a valid min and max.");
      return;
    }
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    props.onApply(col, {
      min: from,
      max: to
    });
    props.onClose();
  };
  const handleClear = () => {
    const col = selectedCol();
    if (!col) return;
    props.onClear(col);
    refreshForColumn(col);
  };
  const footer = (() => {
    var _el$ = _tmpl$$2(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling;
    _el$2.$$click = handleClear;
    addEventListener(_el$4, "click", props.onClose, true);
    _el$5.$$click = handleApply;
    createRenderEffect((_p$) => {
      var _v$ = styles$2.footer, _v$2 = styles$2.ghostBtn, _v$3 = styles$2.footerRight, _v$4 = styles$2.ghostBtn, _v$5 = styles$2.primaryBtn;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$4, _p$.o = _v$4);
      _v$5 !== _p$.i && className(_el$5, _p$.i = _v$5);
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0,
      i: void 0
    });
    return _el$;
  })();
  const bounds = () => getActiveBounds();
  return createComponent(Modal, {
    get open() {
      return props.open;
    },
    get onClose() {
      return props.onClose;
    },
    title: "Filter column",
    footer,
    get children() {
      var _el$6 = _tmpl$3$1(), _el$7 = _el$6.firstChild, _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling, _el$0 = _el$7.nextSibling, _el$1 = _el$0.firstChild, _el$10 = _el$1.firstChild, _el$11 = _el$10.nextSibling, _el$12 = _el$1.nextSibling, _el$13 = _el$12.firstChild, _el$14 = _el$13.nextSibling, _el$15 = _el$0.nextSibling, _el$16 = _el$15.firstChild, _el$17 = _el$16.nextSibling, _el$18 = _el$17.firstChild, _el$19 = _el$18.nextSibling, _el$20 = _el$17.nextSibling, _el$21 = _el$20.firstChild, _el$22 = _el$21.nextSibling, _el$23 = _el$22.nextSibling, _el$24 = _el$20.nextSibling;
      _el$9.addEventListener("change", handleColChange);
      insert(_el$9, createComponent(For, {
        get each() {
          return props.columns;
        },
        children: (col) => (() => {
          var _el$26 = _tmpl$4$1();
          _el$26.value = col;
          insert(_el$26, col);
          return _el$26;
        })()
      }));
      _el$11.$$input = handleMinInput;
      _el$14.$$input = handleMaxInput;
      insert(_el$18, () => minVal() || "—");
      insert(_el$19, () => maxVal() || "—");
      _el$22.$$input = handleMinRange;
      _el$23.$$input = handleMaxRange;
      insert(_el$6, createComponent(Show, {
        get when() {
          return hint();
        },
        get children() {
          var _el$25 = _tmpl$2$1();
          insert(_el$25, hint);
          createRenderEffect(() => className(_el$25, styles$2.hint));
          return _el$25;
        }
      }), null);
      createRenderEffect((_p$) => {
        var _v$6 = styles$2.body, _v$7 = styles$2.field, _v$8 = styles$2.label, _v$9 = styles$2.select, _v$0 = styles$2.grid, _v$1 = styles$2.field, _v$10 = styles$2.label, _v$11 = styles$2.input, _v$12 = styles$2.field, _v$13 = styles$2.label, _v$14 = styles$2.input, _v$15 = styles$2.rangeStack, _v$16 = styles$2.label, _v$17 = styles$2.rangeValues, _v$18 = styles$2.rangeTrack, _v$19 = styles$2.rangeFill, _v$20 = getRangeFillStyle(), _v$21 = `${styles$2.rangeInput} ${styles$2.rangeMin}`, _v$22 = bounds()?.min ?? 0, _v$23 = bounds()?.max ?? 1, _v$24 = `${styles$2.rangeInput} ${styles$2.rangeMax}`, _v$25 = bounds()?.min ?? 0, _v$26 = bounds()?.max ?? 1, _v$27 = styles$2.rangeCaptions;
        _v$6 !== _p$.e && className(_el$6, _p$.e = _v$6);
        _v$7 !== _p$.t && className(_el$7, _p$.t = _v$7);
        _v$8 !== _p$.a && className(_el$8, _p$.a = _v$8);
        _v$9 !== _p$.o && className(_el$9, _p$.o = _v$9);
        _v$0 !== _p$.i && className(_el$0, _p$.i = _v$0);
        _v$1 !== _p$.n && className(_el$1, _p$.n = _v$1);
        _v$10 !== _p$.s && className(_el$10, _p$.s = _v$10);
        _v$11 !== _p$.h && className(_el$11, _p$.h = _v$11);
        _v$12 !== _p$.r && className(_el$12, _p$.r = _v$12);
        _v$13 !== _p$.d && className(_el$13, _p$.d = _v$13);
        _v$14 !== _p$.l && className(_el$14, _p$.l = _v$14);
        _v$15 !== _p$.u && className(_el$15, _p$.u = _v$15);
        _v$16 !== _p$.c && className(_el$16, _p$.c = _v$16);
        _v$17 !== _p$.w && className(_el$17, _p$.w = _v$17);
        _v$18 !== _p$.m && className(_el$20, _p$.m = _v$18);
        _v$19 !== _p$.f && className(_el$21, _p$.f = _v$19);
        _p$.y = style(_el$21, _v$20, _p$.y);
        _v$21 !== _p$.g && className(_el$22, _p$.g = _v$21);
        _v$22 !== _p$.p && setAttribute(_el$22, "min", _p$.p = _v$22);
        _v$23 !== _p$.b && setAttribute(_el$22, "max", _p$.b = _v$23);
        _v$24 !== _p$.T && className(_el$23, _p$.T = _v$24);
        _v$25 !== _p$.A && setAttribute(_el$23, "min", _p$.A = _v$25);
        _v$26 !== _p$.O && setAttribute(_el$23, "max", _p$.O = _v$26);
        _v$27 !== _p$.I && className(_el$24, _p$.I = _v$27);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0,
        i: void 0,
        n: void 0,
        s: void 0,
        h: void 0,
        r: void 0,
        d: void 0,
        l: void 0,
        u: void 0,
        c: void 0,
        w: void 0,
        m: void 0,
        f: void 0,
        y: void 0,
        g: void 0,
        p: void 0,
        b: void 0,
        T: void 0,
        A: void 0,
        O: void 0,
        I: void 0
      });
      createRenderEffect(() => _el$9.value = selectedCol());
      createRenderEffect(() => _el$11.value = minVal());
      createRenderEffect(() => _el$14.value = maxVal());
      createRenderEffect(() => _el$22.value = minRange());
      createRenderEffect(() => _el$23.value = maxRange());
      return _el$6;
    }
  });
};
delegateEvents(["click", "input"]);

const drawer = "_drawer_f1cca_1";
const header = "_header_f1cca_15";
const title = "_title_f1cca_23";
const closeBtn = "_closeBtn_f1cca_29";
const body = "_body_f1cca_46";
const section = "_section_f1cca_55";
const sectionTitle = "_sectionTitle_f1cca_61";
const toggleLabel = "_toggleLabel_f1cca_69";
const field = "_field_f1cca_78";
const toolBtn = "_toolBtn_f1cca_99";
const styles$1 = {
	drawer: drawer,
	header: header,
	title: title,
	closeBtn: closeBtn,
	body: body,
	section: section,
	sectionTitle: sectionTitle,
	toggleLabel: toggleLabel,
	field: field,
	toolBtn: toolBtn
};

var _tmpl$$1 = /* @__PURE__ */ template(`<div><div><span>Analytics</span><button aria-label=Close>×</button></div><div><div><div>Rolling bands</div><label><span>Show rolling mean ± σ bands</span></label><div><label for=rolling-window-input>Window size</label><input type=number id=rolling-window-input min=2 step=1></div></div><div><div>Anomalies</div><label><span>Enable anomaly detection regions</span></label><div><label for=anomaly-method-select>Method</label><select id=anomaly-method-select><option value=zscore>Z-score</option><option value=iqr>IQR</option></select></div><div><label for=anomaly-threshold-input>Threshold</label><input type=number id=anomaly-threshold-input min=0.5 step=0.5></div></div><div><div>Dataset tools</div><button id=transform-btn type=button>Transform…</button><button id=outliers-btn type=button>Outliers…`);
const AnalyticsDrawer = (props) => {
  const [rollingEnabled, setRollingEnabled] = createSignal(false);
  const [rollingWindow, setRollingWindow] = createSignal(50);
  const [anomalyEnabled, setAnomalyEnabled] = createSignal(false);
  const [anomalyMethod, setAnomalyMethod] = createSignal("zscore");
  const [anomalyThreshold, setAnomalyThreshold] = createSignal(3);
  createEffect(() => {
    if (props.open) {
      setRollingEnabled(analyticsStore.state.rollingEnabled);
      setRollingWindow(analyticsStore.state.rollingWindow);
      setAnomalyEnabled(analyticsStore.state.anomalyEnabled);
      setAnomalyMethod(analyticsStore.state.anomalyMethod);
      setAnomalyThreshold(analyticsStore.state.anomalyThreshold);
    }
  });
  const handleRollingToggle = (checked) => {
    setRollingEnabled(checked);
    props.onRollingChange(checked, rollingWindow());
  };
  const handleRollingWindowChange = (value) => {
    setRollingWindow(value);
    props.onRollingChange(rollingEnabled(), value);
  };
  const handleAnomalyToggle = (checked) => {
    setAnomalyEnabled(checked);
    props.onAnomalyChange(checked, anomalyMethod(), anomalyThreshold());
  };
  const handleAnomalyMethodChange = (value) => {
    setAnomalyMethod(value);
    props.onAnomalyChange(anomalyEnabled(), value, anomalyThreshold());
  };
  const handleAnomalyThresholdChange = (value) => {
    setAnomalyThreshold(value);
    props.onAnomalyChange(anomalyEnabled(), anomalyMethod(), value);
  };
  return createComponent(Show, {
    get when() {
      return props.open;
    },
    get children() {
      var _el$ = _tmpl$$1(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$2.nextSibling, _el$6 = _el$5.firstChild, _el$7 = _el$6.firstChild, _el$8 = _el$7.nextSibling, _el$9 = _el$8.firstChild, _el$0 = _el$8.nextSibling, _el$1 = _el$0.firstChild, _el$10 = _el$1.nextSibling, _el$11 = _el$6.nextSibling, _el$12 = _el$11.firstChild, _el$13 = _el$12.nextSibling, _el$14 = _el$13.firstChild, _el$15 = _el$13.nextSibling, _el$16 = _el$15.firstChild, _el$17 = _el$16.nextSibling, _el$18 = _el$15.nextSibling, _el$19 = _el$18.firstChild, _el$20 = _el$19.nextSibling, _el$21 = _el$11.nextSibling, _el$22 = _el$21.firstChild, _el$23 = _el$22.nextSibling, _el$24 = _el$23.nextSibling;
      addEventListener(_el$4, "click", props.onClose, true);
      insert(_el$8, createComponent(SwitchToggle, {
        get checked() {
          return rollingEnabled();
        },
        onChange: (e) => handleRollingToggle(e.currentTarget.checked)
      }), _el$9);
      _el$10.addEventListener("change", (e) => handleRollingWindowChange(parseInt(e.currentTarget.value) || 50));
      insert(_el$13, createComponent(SwitchToggle, {
        get checked() {
          return anomalyEnabled();
        },
        onChange: (e) => handleAnomalyToggle(e.currentTarget.checked)
      }), _el$14);
      _el$17.addEventListener("change", (e) => handleAnomalyMethodChange(e.currentTarget.value));
      _el$20.addEventListener("change", (e) => handleAnomalyThresholdChange(parseFloat(e.currentTarget.value) || 3));
      createRenderEffect((_p$) => {
        var _v$ = styles$1.drawer, _v$2 = styles$1.header, _v$3 = styles$1.title, _v$4 = styles$1.closeBtn, _v$5 = styles$1.body, _v$6 = styles$1.section, _v$7 = styles$1.sectionTitle, _v$8 = styles$1.toggleLabel, _v$9 = styles$1.field, _v$0 = styles$1.section, _v$1 = styles$1.sectionTitle, _v$10 = styles$1.toggleLabel, _v$11 = styles$1.field, _v$12 = styles$1.field, _v$13 = styles$1.section, _v$14 = styles$1.sectionTitle, _v$15 = styles$1.toolBtn, _v$16 = styles$1.toolBtn;
        _v$ !== _p$.e && className(_el$, _p$.e = _v$);
        _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
        _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
        _v$4 !== _p$.o && className(_el$4, _p$.o = _v$4);
        _v$5 !== _p$.i && className(_el$5, _p$.i = _v$5);
        _v$6 !== _p$.n && className(_el$6, _p$.n = _v$6);
        _v$7 !== _p$.s && className(_el$7, _p$.s = _v$7);
        _v$8 !== _p$.h && className(_el$8, _p$.h = _v$8);
        _v$9 !== _p$.r && className(_el$0, _p$.r = _v$9);
        _v$0 !== _p$.d && className(_el$11, _p$.d = _v$0);
        _v$1 !== _p$.l && className(_el$12, _p$.l = _v$1);
        _v$10 !== _p$.u && className(_el$13, _p$.u = _v$10);
        _v$11 !== _p$.c && className(_el$15, _p$.c = _v$11);
        _v$12 !== _p$.w && className(_el$18, _p$.w = _v$12);
        _v$13 !== _p$.m && className(_el$21, _p$.m = _v$13);
        _v$14 !== _p$.f && className(_el$22, _p$.f = _v$14);
        _v$15 !== _p$.y && className(_el$23, _p$.y = _v$15);
        _v$16 !== _p$.g && className(_el$24, _p$.g = _v$16);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0,
        i: void 0,
        n: void 0,
        s: void 0,
        h: void 0,
        r: void 0,
        d: void 0,
        l: void 0,
        u: void 0,
        c: void 0,
        w: void 0,
        m: void 0,
        f: void 0,
        y: void 0,
        g: void 0
      });
      createRenderEffect(() => _el$10.value = rollingWindow());
      createRenderEffect(() => _el$17.value = anomalyMethod());
      createRenderEffect(() => _el$20.value = anomalyThreshold());
      return _el$;
    }
  });
};
delegateEvents(["click"]);

function debugLog(...args) {
}
function debugLogOnce(key, ...args) {
}

let _cachedXValues = null;
let _cachedSeries = null;
function toEpochMs(value) {
  if (value instanceof Date) return value.getTime();
  const numericValue = typeof value === "bigint" ? Number(value) : Number(value);
  const abs = Math.abs(numericValue);
  if (abs >= 1e17) return numericValue / 1e6;
  if (abs >= 1e14) return numericValue / 1e3;
  if (abs >= 1e11) return numericValue;
  return numericValue * 1e3;
}
async function fetchTimeseriesData(start, end, width, xAxisColumn, traceColumns, signal, colorColumn) {
  const params = new URLSearchParams({
    start,
    end,
    width: String(width),
    columns: traceColumns.join(",")
  });
  const res = await fetch(`/api/data?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`fetchTimeseriesData failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const table = tableFromIPC(buffer);
  debugLogOnce("fetchTimeseriesData-columns", "table columns", { actualColumns: table.schema.fields.map((f) => f.name), xAxisColumn, traceColumns });
  const xCol = table.getChild(xAxisColumn);
  debugLogOnce("fetchTimeseriesData-xCol", "xCol from table", {
    xAxisColumn,
    xColFound: xCol !== null,
    xColType: xCol ? xCol.type : "null",
    xColNullCount: xCol ? xCol.nullCount : "N/A"
  });
  if (!xCol) {
    debugLog("fetchTimeseriesData xCol is null - checking available columns:", table.schema.fields.map((f) => f.name));
  }
  const rawXValues = xCol ? Array.from(xCol) : [];
  debugLogOnce("fetchTimeseriesData-rawX", "raw x values before toEpochMs", {
    xAxisColumn,
    rawLen: rawXValues.length,
    rawSample: rawXValues.slice(0, 3),
    rawTypes: rawXValues.slice(0, 3).map((v) => typeof v)
  });
  const xValues = Float64Array.from(
    rawXValues,
    (v) => toEpochMs(v)
  );
  debugLogOnce("fetchTimeseriesData-xValues", "xValues after toEpochMs", {
    xValuesLen: xValues.length,
    xValuesSample: Array.from(xValues.slice(0, 3)),
    xValuesHasNaN: Array.from(xValues.slice(0, 100)).some((v) => !Number.isFinite(v)),
    xValuesAllNaN: Array.from(xValues).every((v) => !Number.isFinite(v))
  });
  const series = {};
  for (const col of traceColumns) {
    const c = table.getChild(col);
    if (c) {
      series[col] = Float64Array.from(Array.from(c), (v) => Number(v));
    }
  }
  let colorByColumn;
  _cachedXValues = xValues;
  _cachedSeries = series;
  return {
    xValues,
    series,
    returnedRows: table.numRows,
    downsampled: res.headers.get("x-edatime-downsampled") === "1",
    colorByColumn
  };
}
function updateCachedColors(colors) {
  console.debug("[updateCachedColors] cache:", { hasX: !!_cachedXValues, hasSeries: !!_cachedSeries });
  if (!_cachedXValues || !_cachedSeries) {
    console.debug("[updateCachedColors] cache MISS - returning null");
    return null;
  }
  const seriesConfig = buildSeriesConfig(_cachedXValues, _cachedSeries, colors);
  console.debug("[updateCachedColors] result:", seriesConfig ? `${seriesConfig.length} series` : "null");
  return seriesConfig;
}
function buildSeriesConfig(xValues, series, colors, filters, colorByColumn, colorColumn, showMarkers = false, scaleName = "viridis") {
  debugLogOnce("buildSeriesConfig-input", "buildSeriesConfig called", {
    xValuesLen: xValues.length,
    seriesKeys: Object.keys(series),
    filters: "none",
    colorColumn: "none"
  });
  let filteredX = xValues;
  let filteredSeries = series;
  const resultSeries = [];
  for (const [colName, yValues] of Object.entries(filteredSeries)) {
    const points = [];
    for (let i = 0; i < Math.min(filteredX.length, yValues.length); i++) {
      const x = filteredX[i];
      const y = yValues[i];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push([x, y]);
      }
    }
    if (points.length === 0) continue;
    {
      resultSeries.push({
        name: colName,
        type: "line",
        color: colors[colName] ?? "#5470C6",
        data: points
      });
    }
  }
  return resultSeries;
}

const page = "_page_1hk0b_1";
const toolbarSeries = "_toolbarSeries_1hk0b_8";
const toolbarGroup = "_toolbarGroup_1hk0b_18";
const toolbarGroupSep = "_toolbarGroupSep_1hk0b_24";
const toolbarGroupPush = "_toolbarGroupPush_1hk0b_29";
const toolbarLabel = "_toolbarLabel_1hk0b_33";
const toolbarTools = "_toolbarTools_1hk0b_40";
const columnFilterInput = "_columnFilterInput_1hk0b_50";
const collapseBtn = "_collapseBtn_1hk0b_60";
const drawSelect = "_drawSelect_1hk0b_76";
const ghostBtn = "_ghostBtn_1hk0b_105";
const panelOpenBtn = "_panelOpenBtn_1hk0b_122";
const disclosureValue = "_disclosureValue_1hk0b_139";
const toolbarKbd = "_toolbarKbd_1hk0b_148";
const zoomRangeBadge = "_zoomRangeBadge_1hk0b_157";
const zoomHistoryBadge = "_zoomHistoryBadge_1hk0b_163";
const main = "_main_1hk0b_171";
const emptyState = "_emptyState_1hk0b_193";
const emptyIllustration = "_emptyIllustration_1hk0b_206";
const emptyTitle = "_emptyTitle_1hk0b_211";
const emptyMessage = "_emptyMessage_1hk0b_217";
const emptyActions = "_emptyActions_1hk0b_224";
const primaryBtn = "_primaryBtn_1hk0b_230";
const loadingOverlay = "_loadingOverlay_1hk0b_262";
const loadingSpinner = "_loadingSpinner_1hk0b_275";
const loadingLabel = "_loadingLabel_1hk0b_288";
const overlayStack = "_overlayStack_1hk0b_293";
const colorbarWrap = "_colorbarWrap_1hk0b_303";
const colorbarName = "_colorbarName_1hk0b_311";
const colorbarScale = "_colorbarScale_1hk0b_319";
const colorbarBound = "_colorbarBound_1hk0b_325";
const colorbar = "_colorbar_1hk0b_303";
const distributionLegend = "_distributionLegend_1hk0b_338";
const styles = {
	page: page,
	toolbarSeries: toolbarSeries,
	toolbarGroup: toolbarGroup,
	toolbarGroupSep: toolbarGroupSep,
	toolbarGroupPush: toolbarGroupPush,
	toolbarLabel: toolbarLabel,
	toolbarTools: toolbarTools,
	columnFilterInput: columnFilterInput,
	collapseBtn: collapseBtn,
	drawSelect: drawSelect,
	ghostBtn: ghostBtn,
	panelOpenBtn: panelOpenBtn,
	disclosureValue: disclosureValue,
	toolbarKbd: toolbarKbd,
	zoomRangeBadge: zoomRangeBadge,
	zoomHistoryBadge: zoomHistoryBadge,
	main: main,
	emptyState: emptyState,
	emptyIllustration: emptyIllustration,
	emptyTitle: emptyTitle,
	emptyMessage: emptyMessage,
	emptyActions: emptyActions,
	primaryBtn: primaryBtn,
	loadingOverlay: loadingOverlay,
	loadingSpinner: loadingSpinner,
	loadingLabel: loadingLabel,
	overlayStack: overlayStack,
	colorbarWrap: colorbarWrap,
	colorbarName: colorbarName,
	colorbarScale: colorbarScale,
	colorbarBound: colorbarBound,
	colorbar: colorbar,
	distributionLegend: distributionLegend
};

var _tmpl$ = /* @__PURE__ */ template(`<option value disabled>Time columns`), _tmpl$2 = /* @__PURE__ */ template(`<option value disabled>Numeric columns`), _tmpl$3 = /* @__PURE__ */ template(`<div data-empty-reason=no-data><div aria-hidden=true><svg viewBox="0 0 80 48"width=120 height=72 fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><rect x=1 y=1 width=78 height=46 rx=8 opacity=0.12></rect><path d="M12 34 L26 22 L36 28 L50 16 L68 32"></path><circle cx=12 cy=34 r=2 fill=currentColor></circle><circle cx=26 cy=22 r=2 fill=currentColor></circle><circle cx=36 cy=28 r=2 fill=currentColor></circle><circle cx=50 cy=16 r=2 fill=currentColor></circle><circle cx=68 cy=32 r=2 fill=currentColor></circle></svg></div><strong>No data loaded</strong><span>Upload a dataset to visualize timeseries data.</span><div><button id=timeseries-empty-upload-btn type=button aria-label="Open upload page">Upload data`), _tmpl$4 = /* @__PURE__ */ template(`<div role=status aria-live=polite aria-label="Chart loading indicator"><div></div><span>Loading data…`), _tmpl$5 = /* @__PURE__ */ template(`<div><div><div role=group aria-label="Series selection tools"><span>X-axis</span><select id=x-axis-select aria-label="Select x-axis column"></select><span>Traces</span><input type=text id=column-filter-input placeholder="Filter columns…"aria-label="Filter columns"><button id=collapse-series-btn type=button title="Collapse series list"><svg viewBox="0 0 16 16"width=12 height=12 fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="4,6 8,10 12,6"></polyline></svg></button></div></div><div><div role=group aria-label="Drawing tools"><span>Draw</span><select id=draw-tool aria-label="Draw tool"><option value=none>None (Pan)</option><option value=zoom>Zoom (drag)</option><option value=arrow>Arrow</option><option value=box>Box</option></select><input type=color id=draw-color title=Color aria-label="Draw color"><input type=number id=draw-width min=1 max=10 title=Thickness aria-label="Draw thickness"><button id=draw-clear-btn type=button title="Clear drawings">Clear Drawings</button></div><div role=group aria-label="Chart label controls"><button type=button title="Edit chart title and axis labels"><span>Labels</span><span>Title + axes</span></button></div><div role=group aria-label="Note and annotation tools"><button type=button title="Open annotation tools"><span>Notes</span><span>Annotations</span></button></div><div role=group aria-label="Export chart and data options"><button id=export-png-btn type=button title="Export chart as PNG (P)">PNG <kbd>P</kbd></button><button id=export-csv-btn type=button title="Export filtered data as CSV (E)">CSV <kbd>E</kbd></button><button type=button title="More export options"><span>More</span><span>SVG, JSON, Parquet</span></button></div><div role=group aria-label="Analytics controls"><button type=button title="Open analytics controls"><span>Analytics</span><span>Bands, anomalies, cleanup</span></button></div><div role=group aria-label="Zoom controls"><button id=zoom-back-btn type=button title="Zoom back">←</button><button id=zoom-out-btn type=button title="Zoom out (restore previous)">−</button><span id=zoom-range-badge title="Current time range"></span><button id=zoom-reset-btn type=button title="Reset to initial view">↺</button><span title="Zoom history depth">/</span></div></div><main id=main><div id=timeseries-overlays><div id=timeseries-colorbar-wrap hidden role=group aria-label="Numeric color column scale"><span id=timeseries-colorbar-name>Color</span><div><span id=timeseries-colorbar-min>0</span><div id=timeseries-colorbar></div><span id=timeseries-colorbar-max>1</span></div></div><div id=timeseries-categorical-wrap hidden role=group aria-label="Categorical color legend"><span id=timeseries-categorical-name>Category</span><div id=timeseries-categorical-legend style=margin-top:8px>`), _tmpl$6 = /* @__PURE__ */ template(`<option>`);
const TimeseriesPage = () => {
  const navigate = useNavigate();
  const [drawTool, setDrawTool] = createSignal("none");
  const [drawColor, setDrawColor] = createSignal("#ff0055");
  const [drawWidth, setDrawWidth] = createSignal(2);
  const [showAnalytics, setShowAnalytics] = createSignal(false);
  const [showLabelsDrawer, setShowLabelsDrawer] = createSignal(false);
  const [chartTitle, setChartTitle] = createSignal("");
  const [xAxisLabel, setXAxisLabel] = createSignal("");
  const [yAxisLabel, setYAxisLabel] = createSignal("");
  const [chartEngine, setChartEngine] = createSignal("");
  const [seriesFilter, setSeriesFilter] = createSignal("");
  const [collapsed, setCollapsed] = createSignal(false);
  const [filterModalOpen, setFilterModalOpen] = createSignal(false);
  const [filterModalColumn, setFilterModalColumn] = createSignal(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [colorColumn, setColorColumn] = createSignal(null);
  let updateChartFn = null;
  let chartReady = false;
  let currentRequestController = null;
  let colorDebounceTimer = null;
  const numericCols = createMemo(() => datasetStore.state.numericCols);
  const datetimeCols = createMemo(() => datasetStore.state.datetimeCols);
  const xAxisColumn = createMemo(() => datasetStore.state.xAxisColumn ?? datasetStore.state.metadata?.timestampColumn ?? numericCols()[0] ?? null);
  const selectedColumns = createMemo(() => {
    const s = uiStore.state.selectedColumns;
    const xCol = xAxisColumn();
    if (s.length === 0) {
      return numericCols().filter((c) => c !== xCol);
    }
    return s;
  });
  const initViewportFromMetadata = () => {
    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.timeRange;
    if (timeRange && chartStore.state.viewport.xMax < timeRange[1] * 0.01) {
      const newViewport = {
        xMin: timeRange[0],
        xMax: timeRange[1],
        yMin: chartStore.state.viewport.yMin,
        yMax: chartStore.state.viewport.yMax
      };
      if (!chartStore.state.initialView) {
        chartStore.setInitialView(newViewport);
      }
      chartStore.setViewport(newViewport);
    }
  };
  const traceColumns = createMemo(() => selectedColumns().filter((c) => c !== xAxisColumn()));
  const columnBounds = createMemo(() => {
    const bounds = {};
    for (const col of numericCols()) {
      const profile = datasetStore.state.columns.find((c) => c.name === col);
      if (profile?.min !== void 0 && profile?.max !== void 0) {
        bounds[col] = {
          min: profile.min,
          max: profile.max
        };
      }
    }
    return bounds;
  });
  const handleChartReady = (updateFn) => {
    updateChartFn = updateFn;
    chartReady = true;
    initViewportFromMetadata();
    void fetchAndRender();
  };
  const handleEngineReady = (engineName) => {
    setChartEngine(engineName);
  };
  const handleLabelsChange = (title, xLabel, yLabel) => {
    setChartTitle(title);
    setXAxisLabel(xLabel);
    setYAxisLabel(yLabel);
  };
  const fetchAndRender = async () => {
    const xCol = xAxisColumn();
    const traces = traceColumns();
    if (!updateChartFn || !xCol || traces.length === 0) {
      debugLog("fetchAndRender skipped", {
        hasUpdateFn: !!updateChartFn,
        xCol,
        tracesLen: traces.length
      });
      return;
    }
    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.timeRange;
    if (!timeRange) {
      return;
    }
    const viewport = chartStore.state.viewport;
    const start = new Date(viewport.xMin || timeRange[0]).toISOString();
    const end = new Date(viewport.xMax || timeRange[1]).toISOString();
    setIsLoading(true);
    if (currentRequestController) {
      currentRequestController.abort();
    }
    currentRequestController = new AbortController();
    try {
      const result = await fetchTimeseriesData(start, end, 1200, xCol, traces, currentRequestController.signal);
      debugLogOnce("fetchAndRender-result", "fetchAndRender result", {
        returnedRows: result.returnedRows,
        downsampled: result.downsampled
      });
      const colorScale = getColorPalette(uiStore.state.colorScale, 8);
      const enhancedColors = {};
      traces.forEach((col, idx) => {
        enhancedColors[col] = uiStore.state.colors[col] ?? colorScale[idx % colorScale.length];
      });
      const seriesConfig = buildSeriesConfig(result.xValues, result.series, enhancedColors);
      updateChartFn(seriesConfig, viewport.xMin || timeRange[0], viewport.xMax || timeRange[1]);
      if (analyticsStore.state.rollingEnabled) {
        void fetchAndCacheRollingBands(start, end, traces.join(","));
      }
      if (analyticsStore.state.anomalyEnabled) {
        void fetchAndCacheAnomalyRegions(start, end, traces.join(","));
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch/render timeseries:", e);
    } finally {
      setIsLoading(false);
      currentRequestController = null;
    }
  };
  const fetchAndCacheRollingBands = async (start, end, columns) => {
    try {
      const response = await fetchRollingBands(start, end, columns, analyticsStore.state.rollingWindow);
      analyticsStore.setRollingBands(response.bands);
    } catch (e) {
      console.warn("Failed to fetch rolling bands:", e);
    }
  };
  const fetchAndCacheAnomalyRegions = async (start, end, columns) => {
    try {
      const response = await fetchAnomalies(start, end, columns, analyticsStore.state.anomalyMethod, analyticsStore.state.anomalyThreshold);
      analyticsStore.setAnomalyRegions(response.regions);
    } catch (e) {
      console.warn("Failed to fetch anomaly regions:", e);
    }
  };
  const handleRollingChange = (enabled, window) => {
    analyticsStore.setRollingEnabled(enabled);
    analyticsStore.setRollingWindow(window);
    if (enabled && chartReady) {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.timeRange;
      if (timeRange) {
        const vp = chartStore.state.viewport;
        const start = new Date(vp.xMin || timeRange[0]).toISOString();
        const end = new Date(vp.xMax || timeRange[1]).toISOString();
        void fetchAndCacheRollingBands(start, end, traceColumns().join(","));
      }
    }
  };
  const handleAnomalyChange = (enabled, method, threshold) => {
    analyticsStore.setAnomalyEnabled(enabled);
    analyticsStore.setAnomalyMethod(method);
    analyticsStore.setAnomalyThreshold(threshold);
    if (enabled && chartReady) {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.timeRange;
      if (timeRange) {
        const vp = chartStore.state.viewport;
        const start = new Date(vp.xMin || timeRange[0]).toISOString();
        const end = new Date(vp.xMax || timeRange[1]).toISOString();
        void fetchAndCacheAnomalyRegions(start, end, traceColumns().join(","));
      }
    }
  };
  const handleZoom = (start, end) => {
    chartStore.setViewport({
      xMin: start,
      xMax: end,
      yMin: chartStore.state.viewport.yMin,
      yMax: chartStore.state.viewport.yMax
    });
  };
  const handleZoomOut = () => {
    chartStore.resetZoom();
  };
  const handleFilterApply = (column, range) => {
    uiStore.setFilter(column, range);
  };
  const handleFilterClear = (column) => {
    uiStore.removeFilter(column);
  };
  const handleXAxisChange = (col) => {
    datasetStore.setXAxisColumn(col);
  };
  const handleDrawToolChange = (tool) => {
    setDrawTool(tool);
    chartStore.setDrawMode(tool === "none" ? "pan" : tool);
  };
  createEffect(() => {
    const xCol = xAxisColumn();
    const traces = traceColumns();
    const metadata = datasetStore.state.metadata;
    if (chartReady && xCol && traces.length > 0 && metadata) {
      void fetchAndRender();
    }
  });
  createEffect(() => {
    const _colors = uiStore.state.colors;
    console.debug("[color-effect] triggered, chartReady:", chartReady, "colors:", JSON.stringify(_colors));
    if (chartReady) {
      if (colorDebounceTimer) clearTimeout(colorDebounceTimer);
      colorDebounceTimer = setTimeout(() => {
        console.debug("[color-effect] fired, colors:", JSON.stringify(_colors));
        const colorScale = getColorPalette(uiStore.state.colorScale, 8);
        const traces = traceColumns();
        console.debug("[color-effect] traces:", traces, "updateChartFn:", !!updateChartFn);
        const enhancedColors = {};
        traces.forEach((col, idx) => {
          enhancedColors[col] = _colors[col] ?? colorScale[idx % colorScale.length];
        });
        const seriesConfig = updateCachedColors(enhancedColors);
        console.debug("[color-effect] seriesConfig:", seriesConfig ? `${seriesConfig.length} series` : "null");
        if (seriesConfig && updateChartFn) {
          const metadata = datasetStore.state.metadata;
          const timeRange = metadata?.timeRange;
          const viewport = chartStore.state.viewport;
          updateChartFn(seriesConfig, viewport.xMin || timeRange?.[0], viewport.xMax || timeRange?.[1]);
          console.debug("[color-effect] updateChartFn called");
        }
      }, 50);
    }
  });
  createEffect(() => {
    const viewport = chartStore.state.viewport;
    const metadata = datasetStore.state.metadata;
    if (chartReady && metadata && viewport) {
      if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
      viewportDebounceTimer = setTimeout(() => {
        void fetchAndRender();
      }, 150);
    }
  });
  const zoomBadgeText = createMemo(() => {
    const vp = chartStore.state.viewport;
    if (!Number.isFinite(vp.xMin) || !Number.isFinite(vp.xMax)) return "—";
    const fmt = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
    return `${fmt(vp.xMin)} – ${fmt(vp.xMax)}`;
  });
  onMount(() => {
    if (numericCols().length > 0 && uiStore.state.selectedColumns.length === 0) {
      uiStore.setSelectedColumns(numericCols());
    }
  });
  const hasData = createMemo(() => datasetStore.state.metadata !== null);
  const canShowChart = createMemo(() => hasData() && numericCols().length > 0);
  return (() => {
    var _el$ = _tmpl$5(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$8 = _el$5.nextSibling, _el$9 = _el$8.nextSibling, _el$0 = _el$9.nextSibling, _el$1 = _el$2.nextSibling, _el$10 = _el$1.firstChild, _el$11 = _el$10.firstChild, _el$12 = _el$11.nextSibling, _el$13 = _el$12.nextSibling, _el$14 = _el$13.nextSibling, _el$15 = _el$14.nextSibling, _el$16 = _el$10.nextSibling, _el$17 = _el$16.firstChild, _el$18 = _el$17.firstChild, _el$19 = _el$18.nextSibling, _el$20 = _el$16.nextSibling, _el$21 = _el$20.firstChild, _el$22 = _el$21.firstChild, _el$23 = _el$22.nextSibling, _el$24 = _el$20.nextSibling, _el$25 = _el$24.firstChild, _el$26 = _el$25.firstChild, _el$27 = _el$26.nextSibling, _el$28 = _el$25.nextSibling, _el$29 = _el$28.firstChild, _el$30 = _el$29.nextSibling, _el$31 = _el$28.nextSibling, _el$32 = _el$31.firstChild, _el$33 = _el$32.nextSibling, _el$34 = _el$24.nextSibling, _el$35 = _el$34.firstChild, _el$36 = _el$35.firstChild, _el$37 = _el$36.nextSibling, _el$38 = _el$34.nextSibling, _el$39 = _el$38.firstChild, _el$40 = _el$39.nextSibling, _el$41 = _el$40.nextSibling, _el$42 = _el$41.nextSibling, _el$43 = _el$42.nextSibling, _el$44 = _el$43.firstChild, _el$45 = _el$1.nextSibling, _el$55 = _el$45.firstChild, _el$56 = _el$55.firstChild, _el$57 = _el$56.firstChild, _el$58 = _el$57.nextSibling, _el$59 = _el$58.firstChild, _el$60 = _el$59.nextSibling, _el$61 = _el$60.nextSibling, _el$62 = _el$56.nextSibling, _el$63 = _el$62.firstChild, _el$64 = _el$63.nextSibling;
    _el$5.addEventListener("change", (e) => handleXAxisChange(e.currentTarget.value));
    insert(_el$5, createComponent(Show, {
      get when() {
        return datetimeCols().length > 0;
      },
      get children() {
        return [_tmpl$(), createComponent(For, {
          get each() {
            return datetimeCols();
          },
          children: (col) => (() => {
            var _el$65 = _tmpl$6();
            _el$65.value = col;
            insert(_el$65, col);
            return _el$65;
          })()
        }), _tmpl$2()];
      }
    }), null);
    insert(_el$5, createComponent(For, {
      get each() {
        return numericCols();
      },
      children: (col) => (() => {
        var _el$66 = _tmpl$6();
        _el$66.value = col;
        insert(_el$66, col);
        return _el$66;
      })()
    }), null);
    _el$9.$$input = (e) => setSeriesFilter(e.currentTarget.value);
    _el$0.$$click = () => setCollapsed(!collapsed());
    insert(_el$3, createComponent(Show, {
      get when() {
        return !collapsed();
      },
      get children() {
        return createComponent(ColumnChips, {
          get columns() {
            return traceColumns();
          },
          get selected() {
            return selectedColumns();
          },
          get filter() {
            return seriesFilter();
          },
          get colors() {
            return uiStore.state.colors;
          },
          get colorScalePalette() {
            return getColorPalette(uiStore.state.colorScale, traceColumns().length);
          },
          onChange: (cols) => {
            console.debug("[TimeseriesPage] onChange selected:", JSON.stringify(cols));
            uiStore.setSelectedColumns(cols);
          },
          onColorChange: (col, color) => {
            console.debug("[TimeseriesPage] onColorChange:", col, color);
            uiStore.setColumnColor(col, color);
          }
        });
      }
    }), null);
    _el$12.addEventListener("change", (e) => handleDrawToolChange(e.currentTarget.value));
    _el$13.addEventListener("change", (e) => setDrawColor(e.currentTarget.value));
    _el$14.addEventListener("change", (e) => setDrawWidth(parseInt(e.currentTarget.value) || 2));
    _el$17.$$click = () => setShowLabelsDrawer(true);
    _el$25.$$click = () => {
    };
    _el$28.$$click = () => {
    };
    _el$35.$$click = () => setShowAnalytics(true);
    _el$39.$$click = () => chartStore.zoomOut();
    _el$40.$$click = () => chartStore.zoomOut();
    insert(_el$41, zoomBadgeText);
    _el$42.$$click = () => chartStore.resetZoom();
    insert(_el$43, () => chartStore.state.zoomHistory.currentIndex + 1, _el$44);
    insert(_el$43, () => chartStore.state.zoomHistory.zoomStack.length, null);
    insert(_el$45, createComponent(ChartView, {
      containerId: "main-chart",
      onReady: handleChartReady,
      onEngineReady: handleEngineReady,
      onZoom: handleZoom,
      onZoomOut: handleZoomOut,
      get rollingBands() {
        return analyticsStore.state.rollingBands;
      },
      get anomalyRegions() {
        return analyticsStore.state.anomalyRegions;
      },
      get drawMode() {
        return memo(() => drawTool() === "zoom")() ? "zoom" : memo(() => drawTool() === "none")() ? "pan" : drawTool();
      },
      get chartTitle() {
        return chartTitle();
      },
      get xAxisLabel() {
        return xAxisLabel();
      },
      get yAxisLabel() {
        return yAxisLabel();
      }
    }), _el$55);
    insert(_el$45, createComponent(Show, {
      get when() {
        return !canShowChart();
      },
      get children() {
        var _el$46 = _tmpl$3(), _el$47 = _el$46.firstChild, _el$48 = _el$47.nextSibling, _el$49 = _el$48.nextSibling, _el$50 = _el$49.nextSibling, _el$51 = _el$50.firstChild;
        _el$51.$$click = () => navigate("/upload");
        createRenderEffect((_p$) => {
          var _v$ = styles.emptyState, _v$2 = styles.emptyIllustration, _v$3 = styles.emptyTitle, _v$4 = styles.emptyMessage, _v$5 = styles.emptyActions, _v$6 = styles.primaryBtn;
          _v$ !== _p$.e && className(_el$46, _p$.e = _v$);
          _v$2 !== _p$.t && className(_el$47, _p$.t = _v$2);
          _v$3 !== _p$.a && className(_el$48, _p$.a = _v$3);
          _v$4 !== _p$.o && className(_el$49, _p$.o = _v$4);
          _v$5 !== _p$.i && className(_el$50, _p$.i = _v$5);
          _v$6 !== _p$.n && className(_el$51, _p$.n = _v$6);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0,
          n: void 0
        });
        return _el$46;
      }
    }), _el$55);
    insert(_el$45, createComponent(Show, {
      get when() {
        return isLoading();
      },
      get children() {
        var _el$52 = _tmpl$4(), _el$53 = _el$52.firstChild, _el$54 = _el$53.nextSibling;
        createRenderEffect((_p$) => {
          var _v$7 = styles.loadingOverlay, _v$8 = styles.loadingSpinner, _v$9 = styles.loadingLabel;
          _v$7 !== _p$.e && className(_el$52, _p$.e = _v$7);
          _v$8 !== _p$.t && className(_el$53, _p$.t = _v$8);
          _v$9 !== _p$.a && className(_el$54, _p$.a = _v$9);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$52;
      }
    }), _el$55);
    insert(_el$, createComponent(AnalyticsDrawer, {
      get open() {
        return showAnalytics();
      },
      onClose: () => setShowAnalytics(false),
      onRollingChange: handleRollingChange,
      onAnomalyChange: handleAnomalyChange
    }), null);
    insert(_el$, createComponent(LabelsDrawer, {
      get open() {
        return showLabelsDrawer();
      },
      onClose: () => setShowLabelsDrawer(false),
      get title() {
        return chartTitle();
      },
      get xAxisLabel() {
        return xAxisLabel();
      },
      get yAxisLabel() {
        return yAxisLabel();
      },
      onChange: handleLabelsChange,
      get engineName() {
        return chartEngine();
      }
    }), null);
    insert(_el$, createComponent(ColumnFilterModal, {
      get open() {
        return filterModalOpen();
      },
      get column() {
        return filterModalColumn();
      },
      get columns() {
        return traceColumns();
      },
      get bounds() {
        return columnBounds();
      },
      get currentFilters() {
        return uiStore.state.filters;
      },
      onApply: handleFilterApply,
      onClear: handleFilterClear,
      onClose: () => setFilterModalOpen(false)
    }), null);
    createRenderEffect((_p$) => {
      var _v$0 = styles.page, _v$1 = styles.toolbarSeries, _v$10 = styles.toolbarGroup, _v$11 = styles.toolbarLabel, _v$12 = styles.xAxisSelect, _v$13 = styles.toolbarLabel, _v$14 = styles.columnFilterInput, _v$15 = styles.collapseBtn, _v$16 = styles.toolbarTools, _v$17 = styles.toolbarGroup, _v$18 = styles.toolbarLabel, _v$19 = styles.drawSelect, _v$20 = styles.ghostBtn, _v$21 = `${styles.toolbarGroup} ${styles.toolbarGroupSep}`, _v$22 = styles.panelOpenBtn, _v$23 = styles.toolbarLabel, _v$24 = styles.disclosureValue, _v$25 = `${styles.toolbarGroup} ${styles.toolbarGroupSep}`, _v$26 = styles.panelOpenBtn, _v$27 = styles.toolbarLabel, _v$28 = styles.disclosureValue, _v$29 = `${styles.toolbarGroup} ${styles.toolbarGroupPush}`, _v$30 = styles.ghostBtn, _v$31 = styles.toolbarKbd, _v$32 = styles.ghostBtn, _v$33 = styles.toolbarKbd, _v$34 = styles.panelOpenBtn, _v$35 = styles.toolbarLabel, _v$36 = styles.disclosureValue, _v$37 = `${styles.toolbarGroup} ${styles.toolbarGroupSep} ${styles.toolbarGroupPush}`, _v$38 = styles.panelOpenBtn, _v$39 = styles.toolbarLabel, _v$40 = styles.disclosureValue, _v$41 = styles.toolbarGroup, _v$42 = styles.ghostBtn, _v$43 = !chartStore.canZoomOut(), _v$44 = styles.ghostBtn, _v$45 = styles.zoomRangeBadge, _v$46 = styles.ghostBtn, _v$47 = styles.zoomHistoryBadge, _v$48 = styles.main, _v$49 = styles.overlayStack, _v$50 = styles.colorbarWrap, _v$51 = styles.colorbarName, _v$52 = styles.colorbarScale, _v$53 = styles.colorbarBound, _v$54 = styles.colorbar, _v$55 = styles.colorbarBound, _v$56 = styles.colorbarWrap, _v$57 = styles.colorbarName, _v$58 = styles.distributionLegend;
      _v$0 !== _p$.e && className(_el$, _p$.e = _v$0);
      _v$1 !== _p$.t && className(_el$2, _p$.t = _v$1);
      _v$10 !== _p$.a && className(_el$3, _p$.a = _v$10);
      _v$11 !== _p$.o && className(_el$4, _p$.o = _v$11);
      _v$12 !== _p$.i && className(_el$5, _p$.i = _v$12);
      _v$13 !== _p$.n && className(_el$8, _p$.n = _v$13);
      _v$14 !== _p$.s && className(_el$9, _p$.s = _v$14);
      _v$15 !== _p$.h && className(_el$0, _p$.h = _v$15);
      _v$16 !== _p$.r && className(_el$1, _p$.r = _v$16);
      _v$17 !== _p$.d && className(_el$10, _p$.d = _v$17);
      _v$18 !== _p$.l && className(_el$11, _p$.l = _v$18);
      _v$19 !== _p$.u && className(_el$12, _p$.u = _v$19);
      _v$20 !== _p$.c && className(_el$15, _p$.c = _v$20);
      _v$21 !== _p$.w && className(_el$16, _p$.w = _v$21);
      _v$22 !== _p$.m && className(_el$17, _p$.m = _v$22);
      _v$23 !== _p$.f && className(_el$18, _p$.f = _v$23);
      _v$24 !== _p$.y && className(_el$19, _p$.y = _v$24);
      _v$25 !== _p$.g && className(_el$20, _p$.g = _v$25);
      _v$26 !== _p$.p && className(_el$21, _p$.p = _v$26);
      _v$27 !== _p$.b && className(_el$22, _p$.b = _v$27);
      _v$28 !== _p$.T && className(_el$23, _p$.T = _v$28);
      _v$29 !== _p$.A && className(_el$24, _p$.A = _v$29);
      _v$30 !== _p$.O && className(_el$25, _p$.O = _v$30);
      _v$31 !== _p$.I && className(_el$27, _p$.I = _v$31);
      _v$32 !== _p$.S && className(_el$28, _p$.S = _v$32);
      _v$33 !== _p$.W && className(_el$30, _p$.W = _v$33);
      _v$34 !== _p$.C && className(_el$31, _p$.C = _v$34);
      _v$35 !== _p$.B && className(_el$32, _p$.B = _v$35);
      _v$36 !== _p$.v && className(_el$33, _p$.v = _v$36);
      _v$37 !== _p$.k && className(_el$34, _p$.k = _v$37);
      _v$38 !== _p$.x && className(_el$35, _p$.x = _v$38);
      _v$39 !== _p$.j && className(_el$36, _p$.j = _v$39);
      _v$40 !== _p$.q && className(_el$37, _p$.q = _v$40);
      _v$41 !== _p$.z && className(_el$38, _p$.z = _v$41);
      _v$42 !== _p$.P && className(_el$39, _p$.P = _v$42);
      _v$43 !== _p$.H && (_el$39.disabled = _p$.H = _v$43);
      _v$44 !== _p$.F && className(_el$40, _p$.F = _v$44);
      _v$45 !== _p$.M && className(_el$41, _p$.M = _v$45);
      _v$46 !== _p$.D && className(_el$42, _p$.D = _v$46);
      _v$47 !== _p$.R && className(_el$43, _p$.R = _v$47);
      _v$48 !== _p$.E && className(_el$45, _p$.E = _v$48);
      _v$49 !== _p$.L && className(_el$55, _p$.L = _v$49);
      _v$50 !== _p$.N && className(_el$56, _p$.N = _v$50);
      _v$51 !== _p$.G && className(_el$57, _p$.G = _v$51);
      _v$52 !== _p$.U && className(_el$58, _p$.U = _v$52);
      _v$53 !== _p$.K && className(_el$59, _p$.K = _v$53);
      _v$54 !== _p$.V && className(_el$60, _p$.V = _v$54);
      _v$55 !== _p$.Y && className(_el$61, _p$.Y = _v$55);
      _v$56 !== _p$.J && className(_el$62, _p$.J = _v$56);
      _v$57 !== _p$.Q && className(_el$63, _p$.Q = _v$57);
      _v$58 !== _p$.Z && className(_el$64, _p$.Z = _v$58);
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0,
      i: void 0,
      n: void 0,
      s: void 0,
      h: void 0,
      r: void 0,
      d: void 0,
      l: void 0,
      u: void 0,
      c: void 0,
      w: void 0,
      m: void 0,
      f: void 0,
      y: void 0,
      g: void 0,
      p: void 0,
      b: void 0,
      T: void 0,
      A: void 0,
      O: void 0,
      I: void 0,
      S: void 0,
      W: void 0,
      C: void 0,
      B: void 0,
      v: void 0,
      k: void 0,
      x: void 0,
      j: void 0,
      q: void 0,
      z: void 0,
      P: void 0,
      H: void 0,
      F: void 0,
      M: void 0,
      D: void 0,
      R: void 0,
      E: void 0,
      L: void 0,
      N: void 0,
      G: void 0,
      U: void 0,
      K: void 0,
      V: void 0,
      Y: void 0,
      J: void 0,
      Q: void 0,
      Z: void 0
    });
    createRenderEffect(() => _el$5.value = xAxisColumn() ?? "");
    createRenderEffect(() => _el$9.value = seriesFilter());
    createRenderEffect(() => _el$12.value = drawTool());
    createRenderEffect(() => _el$13.value = drawColor());
    createRenderEffect(() => _el$14.value = drawWidth());
    return _el$;
  })();
};
delegateEvents(["input", "click"]);

export { TimeseriesPage as default };
//# sourceMappingURL=TimeseriesPage.DshKExqH.js.map
