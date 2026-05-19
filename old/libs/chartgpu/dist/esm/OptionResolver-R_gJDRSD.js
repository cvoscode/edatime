function gs(t) {
  return typeof HTMLCanvasElement < "u" && t instanceof HTMLCanvasElement;
}
function fo(t) {
  if (gs(t)) {
    const i = t.clientWidth || t.width || 0, r = t.clientHeight || t.height || 0;
    if (!Number.isFinite(i) || !Number.isFinite(r))
      throw new Error(
        `GPUContext: Invalid canvas dimensions detected: width=${t.clientWidth || t.width}, height=${t.clientHeight || t.height}. Canvas must have finite dimensions. Ensure canvas is properly sized before initialization.`
      );
    return { width: i, height: r };
  }
  const n = t.width, e = t.height;
  if (!Number.isFinite(n) || !Number.isFinite(e))
    throw new Error(
      `GPUContext: Invalid OffscreenCanvas dimensions: width=${n}, height=${e}. OffscreenCanvas must be initialized with finite dimensions before GPUContext creation.`
    );
  return { width: n, height: e };
}
function ys(t, n) {
  const e = (n == null ? void 0 : n.devicePixelRatio) ?? (typeof window < "u" ? window.devicePixelRatio : 1), i = Number.isFinite(e) && e > 0 ? e : 1, r = (n == null ? void 0 : n.alphaMode) ?? "opaque", s = (n == null ? void 0 : n.powerPreference) ?? "high-performance";
  return {
    adapter: null,
    device: null,
    initialized: !1,
    canvas: t || null,
    canvasContext: null,
    preferredFormat: null,
    devicePixelRatio: i,
    alphaMode: r,
    powerPreference: s
  };
}
async function xs(t) {
  var i, r;
  if (t.initialized)
    throw new Error("GPUContext is already initialized. Call destroyGPUContext() before reinitializing.");
  const n = Number.isFinite(t.devicePixelRatio) && t.devicePixelRatio > 0 ? t.devicePixelRatio : 1;
  if (!navigator.gpu)
    throw new Error(
      "WebGPU is not available in this browser. Please use a browser that supports WebGPU (Chrome 113+, Edge 113+, or Safari 18+). Ensure WebGPU is enabled in browser flags if needed."
    );
  let e = null;
  try {
    const s = await navigator.gpu.requestAdapter({
      powerPreference: t.powerPreference
    });
    if (!s)
      throw new Error(
        "Failed to request WebGPU adapter. No compatible adapter found. This may occur if no GPU is available or WebGPU is disabled."
      );
    if (e = await s.requestDevice(), !e)
      throw new Error("Failed to request WebGPU device from adapter.");
    e.addEventListener("uncapturederror", (c) => {
      console.error("WebGPU uncaptured error:", c.error);
    });
    let o = null, l = null;
    if (t.canvas) {
      const c = t.canvas.getContext("webgpu");
      if (!c) {
        try {
          e.destroy();
        } catch (F) {
          console.warn("Error destroying device during canvas setup failure:", F);
        }
        throw new Error("Failed to get WebGPU context from canvas.");
      }
      const { width: u, height: p } = fo(t.canvas), f = n, a = Math.floor(u * f), w = Math.floor(p * f), M = e.limits.maxTextureDimension2D, P = Math.max(1, Math.min(a, M)), N = Math.max(1, Math.min(w, M));
      t.canvas.width = P, t.canvas.height = N, l = ((r = (i = navigator.gpu).getPreferredCanvasFormat) == null ? void 0 : r.call(i)) || "bgra8unorm", c.configure({
        device: e,
        format: l,
        alphaMode: t.alphaMode
      }), o = c;
    }
    return {
      adapter: s,
      device: e,
      initialized: !0,
      canvas: t.canvas,
      canvasContext: o,
      preferredFormat: l,
      devicePixelRatio: n,
      alphaMode: t.alphaMode,
      powerPreference: t.powerPreference
    };
  } catch (s) {
    if (e)
      try {
        e.destroy();
      } catch (o) {
        console.warn("Error destroying device during initialization failure:", o);
      }
    throw s instanceof Error ? s : new Error(`Failed to initialize GPUContext: ${String(s)}`);
  }
}
function ws(t) {
  if (!t.canvas)
    throw new Error("Canvas is not configured. Provide a canvas element when creating the context.");
  if (!t.initialized || !t.canvasContext)
    throw new Error("GPUContext is not initialized. Call initializeGPUContext() first.");
  return t.canvasContext.getCurrentTexture();
}
function mo(t, n, e, i, r) {
  if (n < 0 || n > 1 || e < 0 || e > 1 || i < 0 || i > 1 || r < 0 || r > 1)
    throw new Error("Color components must be in the range [0.0, 1.0]");
  if (!t.canvas)
    throw new Error("Canvas is not configured. Provide a canvas element when creating the context.");
  if (!t.initialized || !t.device || !t.canvasContext)
    throw new Error("GPUContext is not initialized. Call initializeGPUContext() first.");
  const s = ws(t), o = t.device.createCommandEncoder();
  o.beginRenderPass({
    colorAttachments: [
      {
        view: s.createView(),
        clearValue: { r: n, g: e, b: i, a: r },
        loadOp: "clear",
        storeOp: "store"
      }
    ]
  }).end(), t.device.queue.submit([o.finish()]);
}
function po(t) {
  if (t.device)
    try {
      t.device.destroy();
    } catch (n) {
      console.warn("Error destroying GPU device:", n);
    }
  return {
    adapter: null,
    device: null,
    initialized: !1,
    canvas: t.canvas,
    canvasContext: null,
    preferredFormat: null,
    devicePixelRatio: t.devicePixelRatio,
    alphaMode: t.alphaMode,
    powerPreference: t.powerPreference
  };
}
async function Uu(t, n) {
  const e = ys(t, n);
  return xs(e);
}
class Fs {
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
   * @param canvas - Optional canvas element (HTMLCanvasElement or OffscreenCanvas) to configure for WebGPU rendering
   * @param options - Optional configuration for device pixel ratio, alpha mode, and power preference
   */
  constructor(n, e) {
    this._state = ys(n, e);
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
    this._state = await xs(this._state);
  }
  /**
   * Static factory method to create and initialize a GPUContext instance.
   * 
   * @param canvas - Optional canvas element (HTMLCanvasElement or OffscreenCanvas) to configure for WebGPU rendering
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
  static async create(n, e) {
    const i = new Fs(n, e);
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
    return ws(this._state);
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
  clearScreen(n, e, i, r) {
    mo(this._state, n, e, i, r);
  }
  /**
   * Destroys the WebGPU device and cleans up resources.
   * After calling destroy(), the context must be reinitialized before use.
   */
  destroy() {
    this._state = po(this._state);
  }
}
function mr(t) {
  return Array.isArray(t);
}
function ho(t) {
  return Array.isArray(t);
}
function Fi(t) {
  if (!t)
    throw new TypeError("packDataPoints: points parameter is required");
  if (!Array.isArray(t))
    throw new TypeError("packDataPoints: points must be an array");
  if (t.length === 0)
    return new Float32Array(0);
  const n = 268435456;
  if (t.length > n)
    throw new RangeError(
      `packDataPoints: points array too large (${t.length} points). Maximum supported: ${n.toLocaleString()} points (2GB buffer limit)`
    );
  const e = new ArrayBuffer(t.length * 2 * 4), i = new Float32Array(e);
  for (let r = 0; r < t.length; r++) {
    const s = t[r];
    if (s == null)
      throw new TypeError(
        `packDataPoints: Invalid point at index ${r}. Expected DataPoint (tuple or object), got ${s}`
      );
    const o = mr(s) ? s[0] : s.x, l = mr(s) ? s[1] : s.y;
    if (typeof o != "number" || typeof l != "number")
      throw new TypeError(
        `packDataPoints: Invalid coordinate values at index ${r}. Expected numbers, got x=${typeof o}, y=${typeof l}`
      );
    i[r * 2 + 0] = o, i[r * 2 + 1] = l;
  }
  return i;
}
function Lu(t) {
  if (!t)
    throw new TypeError("packOHLCDataPoints: points parameter is required");
  if (!Array.isArray(t))
    throw new TypeError("packOHLCDataPoints: points must be an array");
  if (t.length === 0)
    return new Float32Array(0);
  const n = 107374182;
  if (t.length > n)
    throw new RangeError(
      `packOHLCDataPoints: points array too large (${t.length} points). Maximum supported: ${n.toLocaleString()} points (2GB buffer limit)`
    );
  const e = new ArrayBuffer(t.length * 5 * 4), i = new Float32Array(e);
  for (let r = 0; r < t.length; r++) {
    const s = t[r];
    if (s == null)
      throw new TypeError(
        `packOHLCDataPoints: Invalid point at index ${r}. Expected OHLCDataPoint (tuple or object), got ${s}`
      );
    if (ho(s)) {
      if (s.length !== 5)
        throw new TypeError(
          `packOHLCDataPoints: Invalid OHLC tuple at index ${r}. Expected 5 elements [timestamp, open, close, low, high], got ${s.length}`
        );
      const o = s[0], l = s[1], c = s[2], u = s[3], p = s[4];
      if (typeof o != "number" || typeof l != "number" || typeof c != "number" || typeof u != "number" || typeof p != "number")
        throw new TypeError(
          `packOHLCDataPoints: Invalid OHLC values at index ${r}. All values must be numbers, got [${typeof o}, ${typeof l}, ${typeof c}, ${typeof u}, ${typeof p}]`
        );
      i[r * 5 + 0] = o, i[r * 5 + 1] = l, i[r * 5 + 2] = p, i[r * 5 + 3] = u, i[r * 5 + 4] = c;
    } else {
      const o = s, { timestamp: l, open: c, high: u, low: p, close: f } = o;
      if (typeof l != "number" || typeof c != "number" || typeof u != "number" || typeof p != "number" || typeof f != "number")
        throw new TypeError(
          `packOHLCDataPoints: Invalid OHLC object at index ${r}. All properties (timestamp, open, high, low, close) must be numbers, got {timestamp: ${typeof l}, open: ${typeof c}, high: ${typeof u}, low: ${typeof p}, close: ${typeof f}}`
        );
      i[r * 5 + 0] = l, i[r * 5 + 1] = c, i[r * 5 + 2] = u, i[r * 5 + 3] = p, i[r * 5 + 4] = f;
    }
  }
  return i;
}
const ni = 4;
function zi(t) {
  return t + 3 & -4;
}
function bo(t) {
  if (!Number.isFinite(t) || t <= 0) return 1;
  const n = Math.ceil(t);
  return 2 ** Math.ceil(Math.log2(n));
}
function dr(t, n) {
  const e = Math.max(ni, zi(n)), i = Math.max(ni, bo(e));
  return Math.max(t, i);
}
function vs(t, n) {
  let e = t >>> 0;
  for (let i = 0; i < n.length; i++)
    e ^= n[i], e = Math.imul(e, 16777619) >>> 0;
  return e >>> 0;
}
function pr(t) {
  const n = new Uint32Array(t.buffer, t.byteOffset, t.byteLength / 4);
  return vs(2166136261, n);
}
function go(t) {
  const n = /* @__PURE__ */ new Map();
  let e = !1;
  const i = () => {
    if (e)
      throw new Error("DataStore is disposed.");
  }, r = (a) => {
    i();
    const w = n.get(a);
    if (!w)
      throw new Error(`Series ${a} has no data. Call setSeries(${a}, data) first.`);
    return w;
  };
  return {
    setSeries: (a, w) => {
      i();
      const M = Fi(w), P = w.length, N = pr(M), F = zi(M.byteLength), b = Math.max(ni, F), x = n.get(a);
      if (x && x.pointCount === P && x.hash32 === N) return;
      let m = (x == null ? void 0 : x.buffer) ?? null, d = (x == null ? void 0 : x.capacityBytes) ?? 0;
      if (!m || b > d) {
        const v = t.limits.maxBufferSize;
        if (b > v)
          throw new Error(
            `DataStore.setSeries(${a}): required buffer size ${b} exceeds device.limits.maxBufferSize (${v}).`
          );
        if (m)
          try {
            m.destroy();
          } catch {
          }
        const y = dr(d, b);
        y > v ? d = b : d = y, m = t.createBuffer({
          size: d,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
      }
      M.byteLength > 0 && t.queue.writeBuffer(m, 0, M.buffer), n.set(a, {
        buffer: m,
        capacityBytes: d,
        pointCount: P,
        hash32: N,
        data: w.length === 0 ? [] : w.slice()
      });
    },
    appendSeries: (a, w) => {
      if (i(), !w || w.length === 0) return;
      const M = r(a), P = M.pointCount, N = P + w.length, F = Fi(w), b = F.byteLength, x = zi(N * 2 * 4), g = Math.max(ni, x);
      let m = M.buffer, d = M.capacityBytes;
      const v = M.data;
      v.push(...w);
      const y = t.limits.maxBufferSize;
      if (g > d) {
        if (g > y)
          throw new Error(
            `DataStore.appendSeries(${a}): required buffer size ${g} exceeds device.limits.maxBufferSize (${y}).`
          );
        try {
          m.destroy();
        } catch {
        }
        const T = dr(d, g);
        d = T > y ? g : T, m = t.createBuffer({
          size: d,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        const I = Fi(v);
        I.byteLength > 0 && t.queue.writeBuffer(m, 0, I.buffer), n.set(a, {
          buffer: m,
          capacityBytes: d,
          pointCount: N,
          hash32: pr(I),
          data: v
        });
        return;
      }
      if (b > 0) {
        const T = P * 2 * 4;
        t.queue.writeBuffer(m, T, F.buffer);
      }
      const C = new Uint32Array(F.buffer, F.byteOffset, F.byteLength / 4), B = vs(M.hash32, C);
      n.set(a, {
        buffer: m,
        capacityBytes: d,
        pointCount: N,
        hash32: B,
        data: v
      });
    },
    removeSeries: (a) => {
      i();
      const w = n.get(a);
      if (w) {
        try {
          w.buffer.destroy();
        } catch {
        }
        n.delete(a);
      }
    },
    getSeriesBuffer: (a) => r(a).buffer,
    getSeriesPointCount: (a) => r(a).pointCount,
    getSeriesData: (a) => r(a).data,
    dispose: () => {
      if (!e) {
        e = !0;
        for (const a of n.values())
          try {
            a.buffer.destroy();
          } catch {
          }
        n.clear();
      }
    }
  };
}
function Ge(t) {
  return Array.isArray(t);
}
function yo(t, n) {
  const e = t.length >>> 1, i = e - 1;
  if (n <= 0 || e === 0) return new Int32Array(0);
  if (n === 1) return new Int32Array([0]);
  if (n === 2) return e >= 2 ? new Int32Array([0, i]) : new Int32Array([0]);
  if (e <= n) {
    const p = new Int32Array(e);
    for (let f = 0; f < e; f++) p[f] = f;
    return p;
  }
  const r = new Int32Array(n);
  r[0] = 0, r[n - 1] = i;
  const s = (e - 2) / (n - 2);
  let o = 0, l = 1;
  const c = t[i * 2 + 0], u = t[i * 2 + 1];
  for (let p = 0; p < n - 2; p++) {
    let f = Math.floor(s * p) + 1, a = Math.min(Math.floor(s * (p + 1)) + 1, i);
    f >= a && (f = Math.min(f, i - 1), a = Math.min(f + 1, i));
    const w = Math.floor(s * (p + 1)) + 1, M = Math.min(Math.floor(s * (p + 2)) + 1, i);
    let P = c, N = u;
    if (w < M) {
      let m = 0, d = 0, v = 0;
      for (let y = w; y < M; y++)
        m += t[y * 2 + 0], d += t[y * 2 + 1], v++;
      v > 0 && (P = m / v, N = d / v);
    }
    const F = t[o * 2 + 0], b = t[o * 2 + 1];
    let x = -1, g = f;
    for (let m = f; m < a; m++) {
      const d = t[m * 2 + 0], v = t[m * 2 + 1], y = (F - P) * (v - b) - (F - d) * (N - b), C = y < 0 ? -y : y;
      C > x && (x = C, g = m);
    }
    r[l++] = g, o = g;
  }
  return r;
}
function xo(t, n) {
  const e = t.length, i = e - 1;
  if (n <= 0 || e === 0) return new Int32Array(0);
  if (n === 1) return new Int32Array([0]);
  if (n === 2) return e >= 2 ? new Int32Array([0, i]) : new Int32Array([0]);
  if (e <= n) {
    const f = new Int32Array(e);
    for (let a = 0; a < e; a++) f[a] = a;
    return f;
  }
  const r = new Int32Array(n);
  r[0] = 0, r[n - 1] = i;
  const s = (e - 2) / (n - 2);
  let o = 0, l = 1;
  const c = t[i], u = Ge(c) ? c[0] : c.x, p = Ge(c) ? c[1] : c.y;
  for (let f = 0; f < n - 2; f++) {
    let a = Math.floor(s * f) + 1, w = Math.min(Math.floor(s * (f + 1)) + 1, i);
    a >= w && (a = Math.min(a, i - 1), w = Math.min(a + 1, i));
    const M = Math.floor(s * (f + 1)) + 1, P = Math.min(Math.floor(s * (f + 2)) + 1, i);
    let N = u, F = p;
    if (M < P) {
      let v = 0, y = 0, C = 0;
      for (let B = M; B < P; B++) {
        const T = t[B], I = Ge(T) ? T[0] : T.x, R = Ge(T) ? T[1] : T.y;
        v += I, y += R, C++;
      }
      C > 0 && (N = v / C, F = y / C);
    }
    const b = t[o], x = Ge(b) ? b[0] : b.x, g = Ge(b) ? b[1] : b.y;
    let m = -1, d = a;
    for (let v = a; v < w; v++) {
      const y = t[v], C = Ge(y) ? y[0] : y.x, B = Ge(y) ? y[1] : y.y, T = (x - N) * (B - g) - (x - C) * (F - g), I = T < 0 ? -T : T;
      I > m && (m = I, d = v);
    }
    r[l++] = d, o = d;
  }
  return r;
}
function wo(t, n) {
  const e = Math.floor(n);
  if (t instanceof Float32Array) {
    const o = t.length >>> 1;
    if (e <= 0 || o === 0) return new Float32Array(0);
    if (o <= e) return t;
    const l = yo(t, e), c = new Float32Array(l.length * 2);
    for (let u = 0; u < l.length; u++) {
      const p = l[u];
      c[u * 2 + 0] = t[p * 2 + 0], c[u * 2 + 1] = t[p * 2 + 1];
    }
    return c;
  }
  const i = t.length;
  if (e <= 0 || i === 0) return [];
  if (i <= e) return t;
  const r = xo(t, e), s = new Array(r.length);
  for (let o = 0; o < r.length; o++)
    s[o] = t[r[o]];
  return s;
}
function Ns(t) {
  return Array.isArray(t);
}
function hr(t) {
  return Ns(t) ? { x: t[0], y: t[1] } : { x: t.x, y: t.y };
}
function Fo(t) {
  return Ns(t) ? t[2] : t.size;
}
function Ms(t) {
  const n = Math.floor(t);
  return Number.isFinite(n) ? n : 0;
}
function vi(t, n, e) {
  const i = t.length, r = Ms(n);
  if (r <= 0 || i === 0) return [];
  if (r === 1) return [t[0]];
  if (r === 2) return i >= 2 ? [t[0], t[i - 1]] : [t[0]];
  if (i <= r) return t;
  const s = i - 1, o = new Array(r);
  o[0] = t[0], o[r - 1] = t[s];
  const l = (i - 2) / (r - 2);
  for (let c = 0; c < r - 2; c++) {
    let u = Math.floor(l * c) + 1, p = Math.min(Math.floor(l * (c + 1)) + 1, s);
    u >= p && (u = Math.min(u, s - 1), p = Math.min(u + 1, s));
    let f = null;
    if (e === "average") {
      let a = 0, w = 0, M = 0, P = 0, N = 0;
      for (let F = u; F < p; F++) {
        const b = t[F], { x, y: g } = hr(b);
        if (!Number.isFinite(x) || !Number.isFinite(g)) continue;
        a += x, w += g, P++;
        const m = Fo(b);
        typeof m == "number" && Number.isFinite(m) && (M += m, N++);
      }
      if (P > 0) {
        const F = a / P, b = w / P;
        N > 0 ? f = [F, b, M / N] : f = [F, b];
      }
    } else {
      let a = e === "max" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
      for (let w = u; w < p; w++) {
        const M = t[w], { y: P } = hr(M);
        Number.isFinite(P) && (e === "max" ? P > a && (a = P, f = M) : P < a && (a = P, f = M));
      }
    }
    o[c + 1] = f ?? t[u];
  }
  return o;
}
function an(t, n, e) {
  const i = Ms(e);
  if (n === "none" || !(i > 0) || t.length <= i) return t;
  switch (n) {
    case "lttb":
      return wo(t, i);
    case "average":
      return vi(t, i, "average");
    case "max":
      return vi(t, i, "max");
    case "min":
      return vi(t, i, "min");
    default:
      return t;
  }
}
function vo(t) {
  return Array.isArray(t);
}
function ki(t, n) {
  const e = Math.floor(n), i = t.length;
  if (e < 2 || i <= e) return t;
  const r = new Array(e);
  if (r[0] = t[0], r[e - 1] = t[i - 1], e === 2) return r;
  const s = vo(t[0]), o = (i - 2) / (e - 2);
  if (s) {
    const l = t;
    for (let c = 0; c < e - 2; c++) {
      let u = Math.floor(o * c) + 1, p = Math.min(Math.floor(o * (c + 1)) + 1, i - 1);
      u >= p && (u = Math.min(u, i - 2), p = Math.min(u + 1, i - 1));
      const f = l[u], a = l[p - 1], w = f[0], M = f[1], P = a[2];
      let N = -1 / 0, F = 1 / 0;
      for (let b = u; b < p; b++) {
        const x = l[b], g = x[3], m = x[4];
        m > N && (N = m), g < F && (F = g);
      }
      r[c + 1] = [w, M, P, F, N];
    }
  } else {
    const l = t;
    for (let c = 0; c < e - 2; c++) {
      let u = Math.floor(o * c) + 1, p = Math.min(Math.floor(o * (c + 1)) + 1, i - 1);
      u >= p && (u = Math.min(u, i - 2), p = Math.min(u + 1, i - 1));
      const f = l[u], a = l[p - 1], w = f.timestamp, M = f.open, P = a.close;
      let N = -1 / 0, F = 1 / 0;
      for (let b = u; b < p; b++) {
        const x = l[b], g = x.high, m = x.low;
        g > N && (N = g), m < F && (F = m);
      }
      r[c + 1] = { timestamp: w, open: M, close: P, low: F, high: N };
    }
  }
  return r;
}
const ii = `// grid.wgsl
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
`, No = "vsMain", Mo = "fsMain", So = (t) => Number.isInteger(t) && t > 0 && (t & t - 1) === 0, Co = (t, n) => {
  if (!Number.isFinite(t) || t < 0)
    throw new Error(`alignTo(value): value must be a finite non-negative number. Received: ${String(t)}`);
  if (!So(n))
    throw new Error(`alignTo(alignment): alignment must be a positive power of two. Received: ${String(n)}`);
  return Math.floor(t) + n - 1 & ~(n - 1);
}, br = (t, n) => "module" in n ? {
  module: n.module,
  entryPoint: n.entryPoint || "",
  constants: n.constants
} : {
  module: Ss(t, n.code, n.label),
  entryPoint: n.entryPoint || "",
  constants: n.constants
};
function Ss(t, n, e) {
  if (typeof n != "string" || n.length === 0)
    throw new Error("createShaderModule(code): WGSL code must be a non-empty string.");
  return t.createShaderModule({ code: n, label: e });
}
function be(t, n) {
  const e = n.layout ?? (n.bindGroupLayouts ? t.createPipelineLayout({ bindGroupLayouts: [...n.bindGroupLayouts] }) : "auto"), i = br(t, n.vertex), r = i.entryPoint || No;
  let s;
  if (n.fragment) {
    const c = br(t, n.fragment), u = c.entryPoint || Mo;
    let p = n.fragment.targets;
    if (!p) {
      const f = n.fragment.formats;
      if (!f)
        throw new Error(
          "createRenderPipeline(fragment): provide either `fragment.targets` or `fragment.formats` when a fragment stage is present."
        );
      p = (Array.isArray(f) ? f : [f]).map((w) => ({
        format: w,
        blend: n.fragment.blend,
        writeMask: n.fragment.writeMask
      }));
    }
    s = {
      module: c.module,
      entryPoint: u,
      targets: [...p],
      constants: c.constants
    };
  }
  const o = n.primitive ?? { topology: "triangle-list" }, l = n.multisample ?? { count: 1 };
  return t.createRenderPipeline({
    label: n.label,
    layout: e,
    vertex: {
      module: i.module,
      entryPoint: r,
      buffers: n.vertex.buffers ? [...n.vertex.buffers] : [],
      constants: i.constants
    },
    fragment: s,
    primitive: o,
    depthStencil: n.depthStencil,
    multisample: l
  });
}
function zt(t, n, e) {
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`createUniformBuffer(size): size must be a positive number. Received: ${String(n)}`);
  const i = (e == null ? void 0 : e.alignment) ?? 16, r = Co(n, Math.max(4, i)), s = t.limits.maxUniformBufferBindingSize;
  if (r > s)
    throw new Error(
      `createUniformBuffer(size): requested size ${r} exceeds device.limits.maxUniformBufferBindingSize (${s}).`
    );
  return t.createBuffer({
    label: e == null ? void 0 : e.label,
    size: r,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
}
function $t(t, n, e) {
  const i = e instanceof ArrayBuffer ? { arrayBuffer: e, offset: 0, size: e.byteLength } : { arrayBuffer: e.buffer, offset: e.byteOffset, size: e.byteLength };
  if (i.size !== 0) {
    if (i.offset & 3 || i.size & 3)
      throw new Error(
        `writeUniformBuffer(data): data byteOffset (${i.offset}) and byteLength (${i.size}) must be multiples of 4 for queue.writeBuffer().`
      );
    if (i.size > n.size)
      throw new Error(`writeUniformBuffer(data): data byteLength (${i.size}) exceeds buffer.size (${n.size}).`);
    t.queue.writeBuffer(n, 0, i.arrayBuffer, i.offset, i.size);
  }
}
const gr = (t) => Math.min(1, Math.max(0, t)), yr = (t) => Math.min(255, Math.max(0, t)), ke = (t) => {
  const n = Number.parseInt(t, 16);
  return Number.isFinite(n) ? n : 0;
}, Xe = (t) => {
  const n = Number.parseInt(t, 16);
  return Number.isFinite(n) ? n : 0;
}, Io = (t) => {
  const n = t.trim();
  if (!n.startsWith("#")) return null;
  const e = n.slice(1);
  if (e.length === 3) {
    const i = ke(e[0]), r = ke(e[1]), s = ke(e[2]);
    return [i * 17 / 255, r * 17 / 255, s * 17 / 255, 1];
  }
  if (e.length === 4) {
    const i = ke(e[0]), r = ke(e[1]), s = ke(e[2]), o = ke(e[3]);
    return [i * 17 / 255, r * 17 / 255, s * 17 / 255, o * 17 / 255];
  }
  if (e.length === 6) {
    const i = Xe(e.slice(0, 2)), r = Xe(e.slice(2, 4)), s = Xe(e.slice(4, 6));
    return [i / 255, r / 255, s / 255, 1];
  }
  if (e.length === 8) {
    const i = Xe(e.slice(0, 2)), r = Xe(e.slice(2, 4)), s = Xe(e.slice(4, 6)), o = Xe(e.slice(6, 8));
    return [i / 255, r / 255, s / 255, o / 255];
  }
  return null;
}, nn = (t) => {
  const n = t.trim();
  if (n.length === 0) return null;
  if (n.endsWith("%")) {
    const i = Number.parseFloat(n.slice(0, -1));
    return Number.isFinite(i) ? yr(i / 100 * 255) : null;
  }
  const e = Number.parseFloat(n);
  return Number.isFinite(e) ? yr(e) : null;
}, To = (t) => {
  const n = t.trim();
  if (n.length === 0) return null;
  if (n.endsWith("%")) {
    const i = Number.parseFloat(n.slice(0, -1));
    return Number.isFinite(i) ? gr(i / 100) : null;
  }
  const e = Number.parseFloat(n);
  return Number.isFinite(e) ? gr(e) : null;
}, Po = (t) => {
  const n = t.trim(), e = /^(rgba?|RGBA?)\(\s*([^\)]*)\s*\)$/.exec(n);
  if (!e) return null;
  const i = e[1].toLowerCase(), s = e[2].split(",").map((o) => o.trim());
  if (i === "rgb") {
    if (s.length !== 3) return null;
    const o = nn(s[0]), l = nn(s[1]), c = nn(s[2]);
    return o == null || l == null || c == null ? null : [o / 255, l / 255, c / 255, 1];
  }
  if (i === "rgba") {
    if (s.length !== 4) return null;
    const o = nn(s[0]), l = nn(s[1]), c = nn(s[2]), u = To(s[3]);
    return o == null || l == null || c == null || u == null ? null : [o / 255, l / 255, c / 255, u];
  }
  return null;
}, Qt = (t) => {
  if (typeof t != "string") return null;
  const n = t.trim();
  if (n.length === 0) return null;
  const e = Io(n);
  if (e) return e;
  const i = Po(n);
  return i || null;
}, Bo = (t, n = { r: 0, g: 0, b: 0, a: 1 }) => {
  const e = Qt(t);
  if (!e) return n;
  const [i, r, s, o] = e;
  return { r: i, g: r, b: s, a: o };
}, Ao = "bgra8unorm", Ro = 5, Do = 6, Eo = [1, 1, 1, 0.8], Uo = () => {
  const t = new ArrayBuffer(64);
  return new Float32Array(t).set([
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
  ]), t;
}, Lo = (t) => Number.isFinite(t.left) && Number.isFinite(t.right) && Number.isFinite(t.top) && Number.isFinite(t.bottom) && Number.isFinite(t.canvasWidth) && Number.isFinite(t.canvasHeight), xr = (t) => typeof t == "number" && Number.isFinite(t) ? t : void 0, _o = (t, n) => {
  let e = t, i = n;
  if ((!Number.isFinite(e) || !Number.isFinite(i)) && (e = 0, i = 1), e === i)
    i = e + 1;
  else if (e > i) {
    const r = e;
    e = i, i = r;
  }
  return { min: e, max: i };
}, Go = (t, n, e, i, r) => {
  const { left: s, right: o, top: l, bottom: c, canvasWidth: u, canvasHeight: p } = i, f = Number.isFinite(i.devicePixelRatio) && i.devicePixelRatio > 0 ? i.devicePixelRatio : 1;
  if (!Lo(i))
    throw new Error("AxisRenderer.prepare: gridArea dimensions must be finite numbers.");
  if (u <= 0 || p <= 0)
    throw new Error("AxisRenderer.prepare: canvas dimensions must be positive.");
  if (s < 0 || o < 0 || l < 0 || c < 0)
    throw new Error("AxisRenderer.prepare: gridArea margins must be non-negative.");
  const a = s * f, w = u - o * f, M = l * f, P = p - c * f, N = a / u * 2 - 1, F = w / u * 2 - 1, b = 1 - M / p * 2, x = 1 - P / p * 2, g = t.tickLength ?? Do;
  if (!Number.isFinite(g) || g < 0)
    throw new Error("AxisRenderer.prepare: tickLength must be a finite non-negative number.");
  const m = r ?? Ro, d = Math.max(1, Math.floor(m));
  if (!Number.isFinite(m) || d < 1)
    throw new Error("AxisRenderer.prepare: tickCount must be a finite number >= 1.");
  const v = g * f, y = v / u * 2, C = v / p * 2, B = xr(t.min) ?? (e === "x" ? n.invert(N) : n.invert(x)), T = xr(t.max) ?? (e === "x" ? n.invert(F) : n.invert(b)), I = _o(B, T), R = I.min, U = I.max, G = 1 + d, E = new Float32Array(G * 2 * 2);
  let _ = 0;
  if (e === "x") {
    E[_++] = N, E[_++] = x, E[_++] = F, E[_++] = x;
    const X = x, j = X - C;
    for (let z = 0; z < d; z++) {
      const rt = d === 1 ? 0.5 : z / (d - 1), lt = R + rt * (U - R), Y = n.scale(lt);
      E[_++] = Y, E[_++] = X, E[_++] = Y, E[_++] = j;
    }
  } else {
    E[_++] = N, E[_++] = x, E[_++] = N, E[_++] = b;
    const X = N, j = X - y;
    for (let z = 0; z < d; z++) {
      const rt = d === 1 ? 0.5 : z / (d - 1), lt = R + rt * (U - R), Y = n.scale(lt);
      E[_++] = X, E[_++] = Y, E[_++] = j, E[_++] = Y;
    }
  }
  return E;
};
function wr(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? Ao, r = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), s = zt(t, 64, { label: "axisRenderer/vsUniforms" }), o = zt(t, 16, { label: "axisRenderer/fsUniformsLine" }), l = zt(t, 16, { label: "axisRenderer/fsUniformsTick" }), c = t.createBindGroup({
    layout: r,
    entries: [
      { binding: 0, resource: { buffer: s } },
      { binding: 1, resource: { buffer: o } }
    ]
  }), u = t.createBindGroup({
    layout: r,
    entries: [
      { binding: 0, resource: { buffer: s } },
      { binding: 1, resource: { buffer: l } }
    ]
  }), p = be(t, {
    label: "axisRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: ii,
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
      code: ii,
      label: "grid.wgsl",
      formats: i,
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "line-list", cullMode: "none" },
    multisample: { count: 1 }
  });
  let f = null, a = 0;
  const w = () => {
    if (e) throw new Error("AxisRenderer is disposed.");
  };
  return { prepare: (F, b, x, g, m, d, v) => {
    if (w(), x !== "x" && x !== "y")
      throw new Error("AxisRenderer.prepare: orientation must be 'x' or 'y'.");
    const y = Go(F, b, x, g, v), C = y.byteLength, B = Math.max(4, C);
    if (!f || f.size < B) {
      if (f)
        try {
          f.destroy();
        } catch {
        }
      f = t.createBuffer({
        label: "axisRenderer/vertexBuffer",
        size: B,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
    t.queue.writeBuffer(f, 0, y.buffer, 0, y.byteLength), a = y.length / 2, $t(t, s, Uo());
    const T = m ?? "rgba(255,255,255,0.8)", I = d ?? T, R = Qt(T) ?? Eo, U = Qt(I) ?? R, G = new ArrayBuffer(4 * 4);
    new Float32Array(G).set([
      R[0],
      R[1],
      R[2],
      R[3]
    ]), $t(t, o, G);
    const E = new ArrayBuffer(4 * 4);
    new Float32Array(E).set([
      U[0],
      U[1],
      U[2],
      U[3]
    ]), $t(t, l, E);
  }, render: (F) => {
    w(), !(a === 0 || !f) && (F.setPipeline(p), F.setVertexBuffer(0, f), F.setBindGroup(0, c), F.draw(Math.min(2, a)), a > 2 && (F.setBindGroup(0, u), F.draw(a - 2, 1, 2, 0)));
  }, dispose: () => {
    if (!e) {
      e = !0;
      try {
        s.destroy();
      } catch {
      }
      try {
        o.destroy();
      } catch {
      }
      try {
        l.destroy();
      } catch {
      }
      if (f)
        try {
          f.destroy();
        } catch {
        }
      f = null, a = 0;
    }
  } };
}
const Oo = "bgra8unorm", Wo = 5, Vo = 6, $o = "rgba(255,255,255,0.15)", zo = [1, 1, 1, 0.15], ko = () => {
  const t = new ArrayBuffer(64);
  return new Float32Array(t).set([
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
  ]), t;
}, Xo = (t, n, e) => {
  const { left: i, right: r, top: s, bottom: o, canvasWidth: l, canvasHeight: c } = t, u = Number.isFinite(t.devicePixelRatio) && t.devicePixelRatio > 0 ? t.devicePixelRatio : 1, p = i * u, f = l - r * u, a = s * u, w = c - o * u, M = f - p, P = w - a, N = n + e, F = new Float32Array(N * 2 * 2);
  let b = 0;
  for (let x = 0; x < n; x++) {
    const g = n === 1 ? 0.5 : x / (n - 1), m = a + g * P, d = p / l * 2 - 1, v = f / l * 2 - 1, y = 1 - m / c * 2;
    F[b++] = d, F[b++] = y, F[b++] = v, F[b++] = y;
  }
  for (let x = 0; x < e; x++) {
    const g = e === 1 ? 0.5 : x / (e - 1), d = (p + g * M) / l * 2 - 1, v = 1 - a / c * 2, y = 1 - w / c * 2;
    F[b++] = d, F[b++] = v, F[b++] = d, F[b++] = y;
  }
  return F;
};
function Ho(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? Oo, r = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), s = zt(t, 64, { label: "gridRenderer/vsUniforms" }), o = zt(t, 16, { label: "gridRenderer/fsUniforms" }), l = t.createBindGroup({
    layout: r,
    entries: [
      { binding: 0, resource: { buffer: s } },
      { binding: 1, resource: { buffer: o } }
    ]
  }), c = be(t, {
    label: "gridRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: ii,
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
      code: ii,
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
    multisample: { count: 1 }
  });
  let u = null, p = 0;
  const f = () => {
    if (e) throw new Error("GridRenderer is disposed.");
  };
  return { prepare: (P, N) => {
    f();
    const F = N != null && typeof N == "object" && ("lineCount" in N || "color" in N), b = F ? N : void 0, x = F ? b == null ? void 0 : b.lineCount : N, g = (x == null ? void 0 : x.horizontal) ?? Wo, m = (x == null ? void 0 : x.vertical) ?? Vo, d = (b == null ? void 0 : b.color) ?? $o;
    if (g < 0 || m < 0)
      throw new Error("GridRenderer.prepare: line counts must be non-negative.");
    if (!Number.isFinite(P.left) || !Number.isFinite(P.right) || !Number.isFinite(P.top) || !Number.isFinite(P.bottom) || !Number.isFinite(P.canvasWidth) || !Number.isFinite(P.canvasHeight))
      throw new Error("GridRenderer.prepare: gridArea dimensions must be finite numbers.");
    if (P.canvasWidth <= 0 || P.canvasHeight <= 0)
      throw new Error("GridRenderer.prepare: canvas dimensions must be positive.");
    if (g === 0 && m === 0) {
      p = 0;
      return;
    }
    const v = Xo(P, g, m), y = v.byteLength, C = Math.max(4, y);
    if (!u || u.size < C) {
      if (u)
        try {
          u.destroy();
        } catch {
        }
      u = t.createBuffer({
        label: "gridRenderer/vertexBuffer",
        size: C,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
    t.queue.writeBuffer(u, 0, v.buffer, 0, v.byteLength), p = (g + m) * 2;
    const B = ko();
    $t(t, s, B);
    const T = Qt(d) ?? zo, I = new ArrayBuffer(4 * 4);
    new Float32Array(I).set([T[0], T[1], T[2], T[3]]), $t(t, o, I);
  }, render: (P) => {
    f(), !(p === 0 || !u) && (P.setPipeline(c), P.setBindGroup(0, l), P.setVertexBuffer(0, u), P.draw(p));
  }, dispose: () => {
    if (!e) {
      e = !0;
      try {
        s.destroy();
      } catch {
      }
      try {
        o.destroy();
      } catch {
      }
      if (u)
        try {
          u.destroy();
        } catch {
        }
      u = null, p = 0;
    }
  } };
}
const Fr = `// area.wgsl
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

`, Yo = "bgra8unorm", vr = (t) => Math.min(1, Math.max(0, t)), qo = (t) => Qt(t) ?? [0, 0, 0, 1], jo = (t) => Array.isArray(t), Cs = (t) => jo(t) ? { x: t[0], y: t[1] } : { x: t.x, y: t.y }, Zo = (t) => {
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < t.length; s++) {
    const { x: o, y: l } = Cs(t[s]);
    !Number.isFinite(o) || !Number.isFinite(l) || (o < n && (n = o), o > e && (e = o), l < i && (i = l), l > r && (r = l));
  }
  return !Number.isFinite(n) || !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (n === e && (e = n + 1), i === r && (r = i + 1), { xMin: n, xMax: e, yMin: i, yMax: r });
}, Nr = (t, n, e) => {
  const i = t.scale(n), r = t.scale(e);
  if (!Number.isFinite(n) || !Number.isFinite(e) || n === e || !Number.isFinite(i) || !Number.isFinite(r))
    return { a: 0, b: Number.isFinite(i) ? i : 0 };
  const s = (r - i) / (e - n), o = i - s * n;
  return { a: Number.isFinite(s) ? s : 0, b: Number.isFinite(o) ? o : 0 };
}, Ko = (t, n, e, i, r) => {
  t[0] = n, t[1] = 0, t[2] = 0, t[3] = 0, t[4] = 0, t[5] = i, t[6] = 0, t[7] = 0, t[8] = 0, t[9] = 0, t[10] = 1, t[11] = 0, t[12] = e, t[13] = r, t[14] = 0, t[15] = 1;
}, Jo = (t) => {
  const n = t.length, e = new Float32Array(n * 2 * 2);
  let i = 0;
  for (let r = 0; r < n; r++) {
    const { x: s, y: o } = Cs(t[r]);
    e[i++] = s, e[i++] = o, e[i++] = s, e[i++] = o;
  }
  return e;
};
function Qo(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? Yo, r = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), s = zt(t, 96, { label: "areaRenderer/vsUniforms" }), o = zt(t, 16, { label: "areaRenderer/fsUniforms" }), l = new ArrayBuffer(96), c = new Float32Array(l), u = new Float32Array(4), p = t.createBindGroup({
    layout: r,
    entries: [
      { binding: 0, resource: { buffer: s } },
      { binding: 1, resource: { buffer: o } }
    ]
  }), f = be(t, {
    label: "areaRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: Fr,
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
      code: Fr,
      label: "area.wgsl",
      formats: i,
      // Enable standard alpha blending so `areaStyle.opacity` behaves correctly.
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "triangle-strip", cullMode: "none" },
    multisample: { count: 1 }
  });
  let a = null, w = 0;
  const M = () => {
    if (e) throw new Error("AreaRenderer is disposed.");
  }, P = (x, g, m, d, v) => {
    Ko(c, x, g, m, d), c[16] = v, c[17] = 0, c[18] = 0, c[19] = 0, c[20] = 0, c[21] = 0, c[22] = 0, c[23] = 0, $t(t, s, l);
  };
  return { prepare: (x, g, m, d, v) => {
    M();
    const y = Jo(g), C = y.byteLength, B = Math.max(4, C);
    if (!a || a.size < B) {
      if (a)
        try {
          a.destroy();
        } catch {
        }
      a = t.createBuffer({
        label: "areaRenderer/vertexBuffer",
        size: B,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
    y.byteLength > 0 && t.queue.writeBuffer(a, 0, y.buffer, 0, y.byteLength), w = y.length / 2;
    const { xMin: T, xMax: I, yMin: R, yMax: U } = Zo(g), { a: G, b: E } = Nr(m, T, I), { a: _, b: X } = Nr(d, R, U), j = Number.isFinite(v ?? Number.NaN) ? v : Number.isFinite(R) ? R : 0;
    P(G, E, _, X, j);
    const [z, rt, lt, Y] = qo(x.areaStyle.color), nt = vr(x.areaStyle.opacity);
    u[0] = z, u[1] = rt, u[2] = lt, u[3] = vr(Y * nt), $t(t, o, u);
  }, render: (x) => {
    M(), !(!a || w < 4) && (x.setPipeline(f), x.setBindGroup(0, p), x.setVertexBuffer(0, a), x.draw(w));
  }, dispose: () => {
    if (!e) {
      if (e = !0, a)
        try {
          a.destroy();
        } catch {
        }
      a = null, w = 0;
      try {
        s.destroy();
      } catch {
      }
      try {
        o.destroy();
      } catch {
      }
    }
  } };
}
const Mr = `// line.wgsl
// Minimal line-strip shader:
// - Vertex input: vec2<f32> position in data coords
// - Uniforms: clip-space transform + solid RGBA color

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

`, ta = "bgra8unorm", Sr = (t) => Math.min(1, Math.max(0, t)), ea = (t) => Qt(t) ?? [0, 0, 0, 1], na = (t) => Array.isArray(t), ia = (t) => na(t) ? { x: t[0], y: t[1] } : { x: t.x, y: t.y }, ra = (t) => {
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < t.length; s++) {
    const { x: o, y: l } = ia(t[s]);
    !Number.isFinite(o) || !Number.isFinite(l) || (o < n && (n = o), o > e && (e = o), l < i && (i = l), l > r && (r = l));
  }
  return !Number.isFinite(n) || !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (n === e && (e = n + 1), i === r && (r = i + 1), { xMin: n, xMax: e, yMin: i, yMax: r });
}, Cr = (t, n, e) => {
  const i = t.scale(n), r = t.scale(e);
  if (!Number.isFinite(n) || !Number.isFinite(e) || n === e || !Number.isFinite(i) || !Number.isFinite(r))
    return { a: 0, b: Number.isFinite(i) ? i : 0 };
  const s = (r - i) / (e - n), o = i - s * n;
  return { a: Number.isFinite(s) ? s : 0, b: Number.isFinite(o) ? o : 0 };
}, sa = (t, n, e, i, r) => {
  t[0] = n, t[1] = 0, t[2] = 0, t[3] = 0, t[4] = 0, t[5] = i, t[6] = 0, t[7] = 0, t[8] = 0, t[9] = 0, t[10] = 1, t[11] = 0, t[12] = e, t[13] = r, t[14] = 0, t[15] = 1;
};
function oa(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? ta, r = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), s = zt(t, 64, { label: "lineRenderer/vsUniforms" }), o = zt(t, 16, { label: "lineRenderer/fsUniforms" }), l = new ArrayBuffer(64), c = new Float32Array(l), u = new Float32Array(4), p = t.createBindGroup({
    layout: r,
    entries: [
      { binding: 0, resource: { buffer: s } },
      { binding: 1, resource: { buffer: o } }
    ]
  }), f = be(t, {
    label: "lineRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: Mr,
      label: "line.wgsl",
      buffers: [
        {
          arrayStride: 8,
          stepMode: "vertex",
          attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }]
        }
      ]
    },
    fragment: {
      code: Mr,
      label: "line.wgsl",
      formats: i,
      // Enable standard alpha blending so per-series `lineStyle.opacity` behaves
      // correctly against an opaque cleared background.
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "line-strip", cullMode: "none" },
    multisample: { count: 1 }
  });
  let a = null, w = 0;
  const M = () => {
    if (e) throw new Error("LineRenderer is disposed.");
  };
  return { prepare: (b, x, g, m) => {
    M(), a = x, w = b.data.length;
    const { xMin: d, xMax: v, yMin: y, yMax: C } = ra(b.data), { a: B, b: T } = Cr(g, d, v), { a: I, b: R } = Cr(m, y, C);
    sa(c, B, T, I, R), $t(t, s, l);
    const [U, G, E, _] = ea(b.color), X = Sr(b.lineStyle.opacity);
    u[0] = U, u[1] = G, u[2] = E, u[3] = Sr(_ * X), $t(t, o, u);
  }, render: (b) => {
    M(), !(!a || w < 2) && (b.setPipeline(f), b.setBindGroup(0, p), b.setVertexBuffer(0, a), b.draw(w));
  }, dispose: () => {
    if (!e) {
      e = !0, a = null, w = 0;
      try {
        s.destroy();
      } catch {
      }
      try {
        o.destroy();
      } catch {
      }
    }
  } };
}
const Ir = `// bar.wgsl
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

`, aa = "bgra8unorm", la = 0.01, ca = 0.2, qn = 32, Ni = qn / 4, Mi = (t) => Math.min(1, Math.max(0, t)), ua = (t) => Qt(t) ?? [0, 0, 0, 1], Tr = (t) => {
  if (!Number.isFinite(t) || t <= 0) return 1;
  const n = Math.ceil(t);
  return 2 ** Math.ceil(Math.log2(n));
}, fa = () => {
  const t = new ArrayBuffer(64);
  return new Float32Array(t).set([
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
  ]), t;
}, ma = (t) => {
  const n = t.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!n) return null;
  const e = Number(n[1]) / 100;
  return Number.isFinite(e) ? e : null;
}, Pr = (t) => {
  if (typeof t != "string") return "";
  const n = t.trim();
  return n.length > 0 ? n : "";
}, da = (t) => Array.isArray(t), Si = (t) => da(t) ? { x: t[0], y: t[1] } : { x: t.x, y: t.y }, pa = (t) => {
  const n = t.devicePixelRatio;
  if (!(n > 0)) return null;
  const e = t.canvasWidth / n, i = t.canvasHeight / n, r = e - t.left - t.right, s = i - t.top - t.bottom;
  return !(r > 0) || !(s > 0) ? null : { plotWidthCss: r, plotHeightCss: s };
}, ha = (t) => {
  const { left: n, right: e, top: i, bottom: r, canvasWidth: s, canvasHeight: o, devicePixelRatio: l } = t, c = n * l, u = s - e * l, p = i * l, f = o - r * l, a = c / s * 2 - 1, w = u / s * 2 - 1, M = 1 - p / o * 2, P = 1 - f / o * 2;
  return { left: a, right: w, top: M, bottom: P };
}, ba = (t, n, e, i) => {
  if (Number.isFinite(n) && n > 0) {
    const l = t.scale(0), c = t.scale(0 + n), u = Math.abs(c - l);
    if (Number.isFinite(u) && u > 0) return u;
  }
  const r = Math.abs(e.right - e.left);
  if (!(r > 0)) return 0;
  const s = Math.max(1, Math.floor(i));
  return r / s;
};
function ga(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? aa, r = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }
    ]
  }), s = zt(t, 64, { label: "barRenderer/vsUniforms" });
  $t(t, s, fa());
  const o = t.createBindGroup({
    layout: r,
    entries: [
      { binding: 0, resource: { buffer: s } }
    ]
  }), l = be(t, {
    label: "barRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: Ir,
      label: "bar.wgsl",
      buffers: [
        {
          arrayStride: qn,
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
      code: Ir,
      label: "bar.wgsl",
      formats: i,
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: 1 }
  });
  let c = null, u = 0, p = new ArrayBuffer(0), f = new Float32Array(p);
  const a = [], w = () => {
    if (e) throw new Error("BarRenderer is disposed.");
  }, M = (d) => {
    if (d <= f.length) return;
    const v = Math.max(8, Tr(d));
    p = new ArrayBuffer(v * 4), f = new Float32Array(p);
  }, P = (d) => {
    a.length = 0;
    for (let y = 0; y < d.length; y++) {
      const C = d[y].data;
      for (let B = 0; B < C.length; B++) {
        const { x: T } = Si(C[B]);
        Number.isFinite(T) && a.push(T);
      }
    }
    if (a.length < 2) return 1;
    a.sort((y, C) => y - C);
    let v = Number.POSITIVE_INFINITY;
    for (let y = 1; y < a.length; y++) {
      const C = a[y] - a[y - 1];
      C > 0 && C < v && (v = C);
    }
    return Number.isFinite(v) && v > 0 ? v : 1;
  }, N = (d) => {
    let v, y, C;
    for (let B = 0; B < d.length; B++) {
      const T = d[B];
      v === void 0 && T.barWidth !== void 0 && (v = T.barWidth), y === void 0 && T.barGap !== void 0 && (y = T.barGap), C === void 0 && T.barCategoryGap !== void 0 && (C = T.barCategoryGap);
    }
    return { barWidth: v, barGap: y, barCategoryGap: C };
  }, F = (d) => {
    let v = Number.POSITIVE_INFINITY, y = Number.NEGATIVE_INFINITY;
    for (let C = 0; C < d.length; C++) {
      const B = d[C].data;
      for (let T = 0; T < B.length; T++) {
        const { y: I } = Si(B[T]);
        Number.isFinite(I) && (I < v && (v = I), I > y && (y = I));
      }
    }
    return !Number.isFinite(v) || !Number.isFinite(y) || v <= 0 && 0 <= y ? 0 : Math.abs(v) < Math.abs(y) ? v : y;
  }, b = (d, v, y) => {
    const C = v.invert(y.bottom), B = v.invert(y.top), T = Math.min(C, B), I = Math.max(C, B);
    return !Number.isFinite(T) || !Number.isFinite(I) ? F(d) : T <= 0 && 0 <= I ? 0 : T > 0 ? T : I < 0 ? I : F(d);
  };
  return { prepare: (d, v, y, C, B) => {
    if (w(), d.length === 0) {
      u = 0;
      return;
    }
    const T = pa(B);
    if (!T) {
      u = 0;
      return;
    }
    const I = ha(B), R = I.right - I.left, U = T.plotWidthCss > 0 ? R / T.plotWidthCss : 0, G = /* @__PURE__ */ new Map(), E = new Array(d.length);
    let _ = 0;
    for (let et = 0; et < d.length; et++) {
      const Bt = Pr(d[et].stack);
      if (Bt !== "") {
        const vt = G.get(Bt);
        if (vt !== void 0)
          E[et] = vt;
        else {
          const At = _++;
          G.set(Bt, At), E[et] = At;
        }
      } else
        E[et] = _++;
    }
    _ = Math.max(1, _);
    const X = P(d), j = N(d), z = Mi(j.barGap ?? la), rt = Mi(j.barCategoryGap ?? ca);
    let lt = 1;
    for (let et = 0; et < d.length; et++)
      lt = Math.max(lt, Math.floor(d[et].data.length));
    const Y = ba(y, X, I, lt), nt = Math.max(0, Y * (1 - rt)), St = _ + Math.max(0, _ - 1) * z, Ct = St > 0 ? nt / St : 0;
    let ft = 0;
    const ot = j.barWidth;
    if (typeof ot == "number")
      ft = Math.max(0, ot) * U, ft = Math.min(ft, Ct);
    else if (typeof ot == "string") {
      const et = ma(ot);
      ft = et == null ? 0 : Ct * Mi(et);
    }
    ft > 0 || (ft = Ct);
    const wt = ft * z, Ft = _ * ft + Math.max(0, _ - 1) * wt;
    let ut = b(d, C, I), st = C.scale(ut);
    if (!Number.isFinite(st)) {
      const et = F(d);
      if (ut = et, st = C.scale(et), Number.isFinite(st) || (ut = 0, st = C.scale(0)), !Number.isFinite(st)) {
        u = 0;
        return;
      }
    }
    let bt = 0;
    for (let et = 0; et < d.length; et++) bt += Math.max(0, d[et].data.length);
    M(bt * Ni);
    const K = f;
    let tt = 0;
    const It = /* @__PURE__ */ new Map();
    for (let et = 0; et < d.length; et++) {
      const Bt = d[et], vt = Bt.data, [At, Gt, Yt, Lt] = ua(Bt.color), Nt = Pr(Bt.stack), Ot = E[et] ?? 0;
      for (let Ut = 0; Ut < vt.length; Ut++) {
        const { x: te, y: Wt } = Si(vt[Ut]), oe = y.scale(te);
        if (!Number.isFinite(oe) || !Number.isFinite(Wt)) continue;
        const Vt = oe - Ft / 2 + Ot * (ft + wt);
        let kt = st, le = 0;
        if (Nt !== "") {
          let qt = It.get(Nt);
          qt || (qt = /* @__PURE__ */ new Map(), It.set(Nt, qt));
          let ie;
          Number.isFinite(Y) && Y > 0 && Number.isFinite(oe) ? ie = Math.round((oe - I.left) / Y) : Number.isFinite(X) && X > 0 ? ie = Math.round(te / X) : ie = Math.round(te * 1e6);
          let Te = qt.get(ie);
          Te || (Te = { posSum: ut, negSum: ut }, qt.set(ie, Te));
          let Pe, Ee;
          Wt >= 0 ? (Pe = Te.posSum, Ee = Pe + Wt, Te.posSum = Ee) : (Pe = Te.negSum, Ee = Pe + Wt, Te.negSum = Ee);
          const un = C.scale(Pe), Qe = C.scale(Ee);
          if (!Number.isFinite(un) || !Number.isFinite(Qe)) continue;
          kt = un, le = Qe - un;
        } else {
          const qt = C.scale(Wt);
          if (!Number.isFinite(qt)) continue;
          le = qt - st;
        }
        K[tt + 0] = Vt, K[tt + 1] = kt, K[tt + 2] = ft, K[tt + 3] = le, K[tt + 4] = At, K[tt + 5] = Gt, K[tt + 6] = Yt, K[tt + 7] = Lt, tt += Ni;
      }
    }
    u = tt / Ni;
    const pt = Math.max(4, u * qn);
    if (!c || c.size < pt) {
      const et = Math.max(Math.max(4, Tr(pt)), c ? c.size : 0);
      if (c)
        try {
          c.destroy();
        } catch {
        }
      c = t.createBuffer({
        label: "barRenderer/instanceBuffer",
        size: et,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
    u > 0 && t.queue.writeBuffer(c, 0, p, 0, u * qn);
  }, render: (d) => {
    w(), !(!c || u === 0) && (d.setPipeline(l), d.setBindGroup(0, o), d.setVertexBuffer(0, c), d.draw(6, u));
  }, dispose: () => {
    if (!e) {
      if (e = !0, c)
        try {
          c.destroy();
        } catch {
        }
      c = null, u = 0;
      try {
        s.destroy();
      } catch {
      }
    }
  } };
}
const Br = `// scatter.wgsl
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

`, ya = "bgra8unorm", Ci = 4, jn = 16, Ii = jn / 4, xa = (t) => Math.min(1, Math.max(0, t)), Bn = (t, n, e) => Math.min(e, Math.max(n, t | 0)), wa = (t) => Qt(t) ?? [0, 0, 0, 1], Ar = (t) => {
  if (!Number.isFinite(t) || t <= 0) return 1;
  const n = Math.ceil(t);
  return 2 ** Math.ceil(Math.log2(n));
}, Hi = (t) => Array.isArray(t), Is = (t) => Hi(t) ? { x: t[0], y: t[1] } : { x: t.x, y: t.y }, Fa = (t) => {
  if (Hi(t)) {
    const e = t[2];
    return typeof e == "number" && Number.isFinite(e) ? e : null;
  }
  const n = t.size;
  return typeof n == "number" && Number.isFinite(n) ? n : null;
}, va = (t) => Hi(t) ? t : [t.x, t.y, t.size], Na = (t) => {
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < t.length; s++) {
    const { x: o, y: l } = Is(t[s]);
    !Number.isFinite(o) || !Number.isFinite(l) || (o < n && (n = o), o > e && (e = o), l < i && (i = l), l > r && (r = l));
  }
  return !Number.isFinite(n) || !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (n === e && (e = n + 1), i === r && (r = i + 1), { xMin: n, xMax: e, yMin: i, yMax: r });
}, Rr = (t, n, e) => {
  const i = t.scale(n), r = t.scale(e);
  if (!Number.isFinite(n) || !Number.isFinite(e) || n === e || !Number.isFinite(i) || !Number.isFinite(r))
    return { a: 0, b: Number.isFinite(i) ? i : 0 };
  const s = (r - i) / (e - n), o = i - s * n;
  return { a: Number.isFinite(s) ? s : 0, b: Number.isFinite(o) ? o : 0 };
}, Ma = (t, n, e, i, r) => {
  t[0] = n, t[1] = 0, t[2] = 0, t[3] = 0, t[4] = 0, t[5] = i, t[6] = 0, t[7] = 0, t[8] = 0, t[9] = 0, t[10] = 1, t[11] = 0, t[12] = e, t[13] = r, t[14] = 0, t[15] = 1;
}, Sa = (t) => {
  const { canvasWidth: n, canvasHeight: e, devicePixelRatio: i } = t, r = t.left * i, s = n - t.right * i, o = t.top * i, l = e - t.bottom * i, c = Bn(Math.floor(r), 0, Math.max(0, n)), u = Bn(Math.floor(o), 0, Math.max(0, e)), p = Bn(Math.ceil(s), 0, Math.max(0, n)), f = Bn(Math.ceil(l), 0, Math.max(0, e)), a = Math.max(0, p - c), w = Math.max(0, f - u);
  return { x: c, y: u, w: a, h: w };
};
function Ca(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? ya, r = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), s = zt(t, 80, { label: "scatterRenderer/vsUniforms" }), o = zt(t, 16, { label: "scatterRenderer/fsUniforms" }), l = new ArrayBuffer(80), c = new Float32Array(l), u = new Float32Array(4), p = t.createBindGroup({
    layout: r,
    entries: [
      { binding: 0, resource: { buffer: s } },
      { binding: 1, resource: { buffer: o } }
    ]
  }), f = be(t, {
    label: "scatterRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: Br,
      label: "scatter.wgsl",
      buffers: [
        {
          arrayStride: jn,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 0, format: "float32x2", offset: 0 },
            { shaderLocation: 1, format: "float32", offset: 8 }
          ]
        }
      ]
    },
    fragment: {
      code: Br,
      label: "scatter.wgsl",
      formats: i,
      // Standard alpha blending (circle AA uses alpha, and series color may be translucent).
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: 1 }
  });
  let a = null, w = 0, M = new ArrayBuffer(0), P = new Float32Array(M), N = 0, F = 0, b = [1, 1], x = null;
  const g = () => {
    if (e) throw new Error("ScatterRenderer is disposed.");
  }, m = (B) => {
    if (B <= P.length) return;
    const T = Math.max(8, Ar(B));
    M = new ArrayBuffer(T * 4), P = new Float32Array(M);
  }, d = (B, T, I, R, U, G) => {
    const E = Number.isFinite(U) && U > 0 ? U : 1, _ = Number.isFinite(G) && G > 0 ? G : 1;
    Ma(c, B, T, I, R), c[16] = E, c[17] = _, c[18] = 0, c[19] = 0, $t(t, s, l), b = [E, _];
  };
  return { prepare: (B, T, I, R, U) => {
    g();
    const { xMin: G, xMax: E, yMin: _, yMax: X } = Na(T), { a: j, b: z } = Rr(I, G, E), { a: rt, b: lt } = Rr(R, _, X);
    U ? (N = U.canvasWidth, F = U.canvasHeight, d(j, z, rt, lt, U.canvasWidth, U.canvasHeight), x = Sa(U)) : (d(j, z, rt, lt, b[0], b[1]), x = null);
    const [Y, nt, St, Ct] = wa(B.color);
    u[0] = Y, u[1] = nt, u[2] = St, u[3] = xa(Ct), $t(t, o, u);
    const ft = (U == null ? void 0 : U.devicePixelRatio) ?? 1, ot = ft > 0 && Number.isFinite(ft), wt = B.symbolSize, Ft = typeof wt == "function" ? (K) => {
      const tt = wt(va(K));
      return typeof tt == "number" && Number.isFinite(tt) ? tt : Ci;
    } : typeof wt == "number" && Number.isFinite(wt) ? () => wt : () => Ci;
    m(T.length * Ii);
    const ut = P;
    let st = 0;
    for (let K = 0; K < T.length; K++) {
      const tt = T[K], { x: It, y: pt } = Is(tt);
      if (!Number.isFinite(It) || !Number.isFinite(pt)) continue;
      const et = Fa(tt) ?? Ft(tt), Bt = Number.isFinite(et) ? Math.max(0, et) : Ci, vt = ot ? Bt * ft : Bt;
      vt > 0 && (ut[st + 0] = It, ut[st + 1] = pt, ut[st + 2] = vt, ut[st + 3] = 0, st += Ii);
    }
    w = st / Ii;
    const bt = Math.max(4, w * jn);
    if (!a || a.size < bt) {
      const K = Math.max(Math.max(4, Ar(bt)), a ? a.size : 0);
      if (a)
        try {
          a.destroy();
        } catch {
        }
      a = t.createBuffer({
        label: "scatterRenderer/instanceBuffer",
        size: K,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
    a && w > 0 && t.queue.writeBuffer(a, 0, M, 0, w * jn);
  }, render: (B) => {
    g(), !(!a || w === 0) && (x && N > 0 && F > 0 && B.setScissorRect(x.x, x.y, x.w, x.h), B.setPipeline(f), B.setBindGroup(0, p), B.setVertexBuffer(0, a), B.draw(6, w), x && N > 0 && F > 0 && B.setScissorRect(0, 0, N, F));
  }, dispose: () => {
    if (!e) {
      if (e = !0, a)
        try {
          a.destroy();
        } catch {
        }
      a = null, w = 0;
      try {
        s.destroy();
      } catch {
      }
      try {
        o.destroy();
      } catch {
      }
      N = 0, F = 0, b = [1, 1], x = null;
    }
  } };
}
const Ia = `struct ComputeUniforms {
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

`, Dr = `struct RenderUniforms {
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

`, Ta = "bgra8unorm", An = (t) => Math.min(1, Math.max(0, t)), Oe = (t, n, e) => Math.min(e, Math.max(n, t | 0)), Pa = (t) => {
  if (!Number.isFinite(t) || t <= 0) return 1;
  const n = Math.ceil(t);
  return 2 ** Math.ceil(Math.log2(n));
}, Er = (t, n, e) => {
  const i = t.scale(n), r = t.scale(e);
  if (!Number.isFinite(n) || !Number.isFinite(e) || n === e || !Number.isFinite(i) || !Number.isFinite(r))
    return { a: 0, b: Number.isFinite(i) ? i : 0 };
  const s = (r - i) / (e - n), o = i - s * n;
  return { a: Number.isFinite(s) ? s : 0, b: Number.isFinite(o) ? o : 0 };
}, Ba = (t, n, e, i, r) => {
  t[0] = n, t[1] = 0, t[2] = 0, t[3] = 0, t[4] = 0, t[5] = i, t[6] = 0, t[7] = 0, t[8] = 0, t[9] = 0, t[10] = 1, t[11] = 0, t[12] = e, t[13] = r, t[14] = 0, t[15] = 1;
}, Aa = (t) => {
  const { canvasWidth: n, canvasHeight: e, devicePixelRatio: i } = t, r = t.left * i, s = n - t.right * i, o = t.top * i, l = e - t.bottom * i, c = Oe(Math.floor(r), 0, Math.max(0, n)), u = Oe(Math.floor(o), 0, Math.max(0, e)), p = Oe(Math.ceil(s), 0, Math.max(0, n)), f = Oe(Math.ceil(l), 0, Math.max(0, e)), a = Math.max(0, p - c), w = Math.max(0, f - u);
  return { x: c, y: u, w: a, h: w };
}, Rn = (t, n, e) => t + (n - t) * e, Ra = (t, n, e) => [Rn(t[0], n[0], e), Rn(t[1], n[1], e), Rn(t[2], n[2], e), Rn(t[3], n[3], e)], Da = (t) => Qt(t) ?? [0, 0, 0, 1], Ur = (t) => t === "plasma" ? ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"] : t === "inferno" ? ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"] : ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"], Ea = (t) => {
  const e = (typeof t == "string" ? Ur(t) : Array.isArray(t) && t.length > 0 ? t : Ur("viridis")).map(Da), i = Math.max(2, e.length), r = new Uint8Array(new ArrayBuffer(256 * 4));
  for (let s = 0; s < 256; s++) {
    const l = s / 255 * (i - 1), c = Math.min(i - 2, Math.max(0, Math.floor(l))), u = l - c, p = Ra(e[c], e[c + 1], u);
    r[s * 4 + 0] = Oe(Math.round(An(p[0]) * 255), 0, 255), r[s * 4 + 1] = Oe(Math.round(An(p[1]) * 255), 0, 255), r[s * 4 + 2] = Oe(Math.round(An(p[2]) * 255), 0, 255), r[s * 4 + 3] = Oe(Math.round(An(p[3]) * 255), 0, 255);
  }
  return r;
}, Ua = (t) => {
  if (typeof t == "string") return t;
  try {
    return JSON.stringify(t);
  } catch {
    return "custom";
  }
}, La = (t) => t === "sqrt" ? 1 : t === "log" ? 2 : 0;
function _a(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? Ta, r = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
    ]
  }), s = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      // `scatterDensityColormap.wgsl` declares these as `var<storage, read>`, so they must be read-only-storage.
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } }
    ]
  }), o = zt(t, 128, { label: "scatterDensity/computeUniforms" }), l = new ArrayBuffer(128), c = new Float32Array(l, 0, 20), u = new Uint32Array(l), p = zt(t, 48, { label: "scatterDensity/renderUniforms" }), f = new ArrayBuffer(48), a = new Uint32Array(f), w = Ss(t, Ia, "scatterDensityBinning.wgsl"), M = t.createComputePipeline({
    label: "scatterDensity/binPointsPipeline",
    layout: t.createPipelineLayout({ bindGroupLayouts: [r] }),
    compute: { module: w, entryPoint: "binPoints" }
  }), P = t.createComputePipeline({
    label: "scatterDensity/reduceMaxPipeline",
    layout: t.createPipelineLayout({ bindGroupLayouts: [r] }),
    compute: { module: w, entryPoint: "reduceMax" }
  }), N = be(t, {
    label: "scatterDensity/renderPipeline",
    bindGroupLayouts: [s],
    vertex: { code: Dr, label: "scatterDensityColormap.wgsl" },
    fragment: {
      code: Dr,
      label: "scatterDensityColormap.wgsl",
      formats: i,
      blend: void 0
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: 1 }
  });
  let F = null, b = null, x = 0, g = null, m = null, d = "", v = null, y = null, C = null, B = -1, T = 0, I = 0, R = 0, U = 0, G = 0, E = null, _ = 0, X = 0, j = 2, z = !0, rt = !1, lt = new Uint32Array(0);
  const Y = () => {
    if (e) throw new Error("ScatterDensityRenderer is disposed.");
  }, nt = (ut) => {
    const st = Ua(ut.densityColormap);
    if (g || (g = t.createTexture({
      label: "scatterDensity/lutTexture",
      size: { width: 256, height: 1, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    }), m = g.createView(), d = ""), st === d) return;
    const bt = Ea(ut.densityColormap);
    t.queue.writeTexture(
      { texture: g },
      bt,
      { bytesPerRow: 256 * 4, rowsPerImage: 1 },
      { width: 256, height: 1, depthOrArrayLayers: 1 }
    ), d = st;
  }, St = (ut, st) => {
    const bt = Math.max(1, ut | 0) * Math.max(1, st | 0);
    if (F && b && bt <= x) return;
    const K = Math.max(1, bt);
    if (x = Math.max(256, Pa(K)), F) {
      try {
        F.destroy();
      } catch {
      }
      F = null;
    }
    if (b) {
      try {
        b.destroy();
      } catch {
      }
      b = null;
    }
    F = t.createBuffer({
      label: "scatterDensity/binsBuffer",
      size: x * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    }), b = t.createBuffer({
      label: "scatterDensity/maxBuffer",
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    }), lt = new Uint32Array(x), v = null, y = null, z = !0;
  }, Ct = () => {
    !F || !b || !m || !C || (v || (v = t.createBindGroup({
      label: "scatterDensity/computeBindGroup",
      layout: r,
      entries: [
        { binding: 0, resource: { buffer: o } },
        { binding: 1, resource: { buffer: C } },
        { binding: 2, resource: { buffer: F } },
        { binding: 3, resource: { buffer: b } }
      ]
    })), y || (y = t.createBindGroup({
      label: "scatterDensity/renderBindGroup",
      layout: s,
      entries: [
        { binding: 0, resource: { buffer: p } },
        { binding: 1, resource: { buffer: F } },
        { binding: 2, resource: { buffer: b } },
        { binding: 3, resource: m }
      ]
    })));
  };
  return { prepare: (ut, st, bt, K, tt, It, pt, et, Bt) => {
    Y(), rt = !0;
    const vt = Aa(et), At = et.devicePixelRatio, Gt = Number.isFinite(ut.binSize) ? Math.max(1e-6, ut.binSize) : 2, Yt = Math.max(1, Math.round(Gt * (Number.isFinite(At) && At > 0 ? At : 1))), Lt = Math.max(1, Math.ceil(vt.w / Yt)), Nt = Math.max(1, Math.ceil(vt.h / Yt));
    St(Lt, Nt), nt(ut);
    const Ot = La(ut.densityNormalization);
    C !== st && (C = st, v = null, y = null, z = !0), B !== bt && (B = bt, z = !0), (T !== K || I !== tt) && (T = K, I = tt, z = !0), (R !== Yt || U !== Lt || G !== Nt) && (R = Yt, U = Lt, G = Nt, z = !0), (!E || E.x !== vt.x || E.y !== vt.y || E.w !== vt.w || E.h !== vt.h) && (E = vt, z = !0), (_ !== et.canvasWidth || X !== et.canvasHeight) && (_ = et.canvasWidth, X = et.canvasHeight, z = !0), j !== Ot && (j = Ot, z = !0);
    const Ut = Bt, te = (Ut == null ? void 0 : Ut.xMin) ?? 0, Wt = (Ut == null ? void 0 : Ut.xMax) ?? 1, oe = (Ut == null ? void 0 : Ut.yMin) ?? 0, Vt = (Ut == null ? void 0 : Ut.yMax) ?? 1, { a: kt, b: le } = Er(It, te, Wt), { a: qt, b: ie } = Er(pt, oe, Vt);
    Ba(c, kt, le, qt, ie), c[16] = et.canvasWidth > 0 ? et.canvasWidth : 1, c[17] = et.canvasHeight > 0 ? et.canvasHeight : 1, c[18] = 0, c[19] = 0, u[20] = vt.x >>> 0, u[21] = vt.y >>> 0, u[22] = vt.w >>> 0, u[23] = vt.h >>> 0, u[24] = Yt >>> 0, u[25] = Lt >>> 0, u[26] = Nt >>> 0, u[27] = (Math.max(0, K) | 0) >>> 0, u[28] = (Math.max(0, tt) | 0) >>> 0, u[29] = Ot >>> 0, $t(t, o, l), a[0] = vt.x >>> 0, a[1] = vt.y >>> 0, a[2] = vt.w >>> 0, a[3] = vt.h >>> 0, a[4] = Yt >>> 0, a[5] = Lt >>> 0, a[6] = Nt >>> 0, a[7] = Ot >>> 0, $t(t, p, f), Ct();
  }, encodeCompute: (ut) => {
    if (Y(), !rt || !z) return;
    if (!F || !b || !v || B <= 0) {
      z = !1;
      return;
    }
    if (!E || E.w <= 0 || E.h <= 0) {
      z = !1;
      return;
    }
    t.queue.writeBuffer(F, 0, lt.buffer, 0, x * 4), t.queue.writeBuffer(b, 0, new Uint32Array([0]).buffer);
    const st = U * G | 0, bt = Math.max(0, I - T | 0), K = ut.beginComputePass({ label: "scatterDensity/computePass" });
    K.setBindGroup(0, v), K.setPipeline(M);
    const tt = 256, It = Math.ceil(bt / tt);
    It > 0 && K.dispatchWorkgroups(It), K.setPipeline(P);
    const pt = Math.ceil(st / tt);
    pt > 0 && K.dispatchWorkgroups(pt), K.end(), z = !1;
  }, render: (ut) => {
    Y(), rt && (!y || !E || !m || E.w <= 0 || E.h <= 0 || (ut.setScissorRect(E.x, E.y, E.w, E.h), ut.setPipeline(N), ut.setBindGroup(0, y), ut.draw(3), _ > 0 && X > 0 && ut.setScissorRect(0, 0, _, X)));
  }, dispose: () => {
    if (!e) {
      e = !0;
      try {
        o.destroy();
      } catch {
      }
      try {
        p.destroy();
      } catch {
      }
      if (F)
        try {
          F.destroy();
        } catch {
        }
      if (b)
        try {
          b.destroy();
        } catch {
        }
      if (F = null, b = null, x = 0, g)
        try {
          g.destroy();
        } catch {
        }
      g = null, m = null, v = null, y = null, C = null;
    }
  } };
}
const Lr = `// pie.wgsl
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

`, Ga = "bgra8unorm", Zn = 40, Ti = Zn / 4, xn = Math.PI * 2, _r = (t) => Math.min(1, Math.max(0, t)), Dn = (t, n, e) => Math.min(e, Math.max(n, t | 0)), Gr = (t) => {
  if (!Number.isFinite(t) || t <= 0) return 1;
  const n = Math.ceil(t);
  return 2 ** Math.ceil(Math.log2(n));
}, Or = (t) => {
  if (!Number.isFinite(t)) return 0;
  const n = t % xn;
  return n < 0 ? n + xn : n;
}, Oa = (t, n) => {
  const e = Qt(t);
  if (e) return [e[0], e[1], e[2], _r(e[3])];
  const i = Qt(n);
  return i ? [i[0], i[1], i[2], _r(i[3])] : [0, 0, 0, 1];
}, wn = (t, n) => {
  if (typeof t == "number") return Number.isFinite(t) ? t : null;
  if (typeof t != "string") return null;
  const e = t.trim();
  if (e.length === 0) return null;
  if (e.endsWith("%")) {
    const r = Number.parseFloat(e.slice(0, -1));
    return Number.isFinite(r) ? r / 100 * n : null;
  }
  const i = Number.parseFloat(e);
  return Number.isFinite(i) ? i : null;
}, Wa = (t, n, e) => {
  const i = (t == null ? void 0 : t[0]) ?? "50%", r = (t == null ? void 0 : t[1]) ?? "50%", s = wn(i, n), o = wn(r, e);
  return {
    x: Number.isFinite(s) ? s : n * 0.5,
    y: Number.isFinite(o) ? o : e * 0.5
  };
}, Va = (t) => Array.isArray(t), $a = (t, n) => {
  if (t == null) return { inner: 0, outer: n * 0.7 };
  if (Va(t)) {
    const r = wn(t[0], n), s = wn(t[1], n), o = Math.max(0, Number.isFinite(r) ? r : 0), l = Math.max(o, Number.isFinite(s) ? s : n * 0.7);
    return { inner: o, outer: Math.min(n, l) };
  }
  const e = wn(t, n), i = Math.max(0, Number.isFinite(e) ? e : n * 0.7);
  return { inner: 0, outer: Math.min(n, i) };
}, za = (t) => {
  const { canvasWidth: n, canvasHeight: e, devicePixelRatio: i } = t, r = t.left * i, s = n - t.right * i, o = t.top * i, l = e - t.bottom * i, c = Dn(Math.floor(r), 0, Math.max(0, n)), u = Dn(Math.floor(o), 0, Math.max(0, e)), p = Dn(Math.ceil(s), 0, Math.max(0, n)), f = Dn(Math.ceil(l), 0, Math.max(0, e)), a = Math.max(0, p - c), w = Math.max(0, f - u);
  return { x: c, y: u, w: a, h: w };
}, ka = new Float32Array([
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
function Xa(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? Ga, r = t.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }]
  }), s = zt(t, 80, { label: "pieRenderer/vsUniforms" }), o = new ArrayBuffer(80), l = new Float32Array(o), c = t.createBindGroup({
    layout: r,
    entries: [{ binding: 0, resource: { buffer: s } }]
  }), u = be(t, {
    label: "pieRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: Lr,
      label: "pie.wgsl",
      buffers: [
        {
          arrayStride: Zn,
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
      code: Lr,
      label: "pie.wgsl",
      formats: i,
      // Standard alpha blending for AA edges and translucent slice colors.
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: 1 }
  });
  let p = null, f = 0, a = new ArrayBuffer(0), w = new Float32Array(a), M = 0, P = 0, N = null;
  const F = () => {
    if (e) throw new Error("PieRenderer is disposed.");
  }, b = (v) => {
    if (v <= w.length) return;
    const y = Math.max(8, Gr(v));
    a = new ArrayBuffer(y * 4), w = new Float32Array(a);
  }, x = (v, y) => {
    const C = Number.isFinite(v) && v > 0 ? v : 1, B = Number.isFinite(y) && y > 0 ? y : 1;
    l.set(ka, 0), l[16] = C, l[17] = B, l[18] = 0, l[19] = 0, $t(t, s, o);
  };
  return { prepare: (v, y) => {
    var tt;
    F();
    const C = y.devicePixelRatio, B = C > 0 && Number.isFinite(C) ? C : 1;
    M = y.canvasWidth, P = y.canvasHeight, x(y.canvasWidth, y.canvasHeight), N = za(y);
    const T = y.canvasWidth / B, I = y.canvasHeight / B;
    if (!(T > 0) || !(I > 0)) {
      f = 0;
      return;
    }
    const R = T - y.left - y.right, U = I - y.top - y.bottom;
    if (!(R > 0) || !(U > 0)) {
      f = 0;
      return;
    }
    const G = 0.5 * Math.min(R, U);
    if (!(G > 0)) {
      f = 0;
      return;
    }
    const E = Wa(v.center, R, U), _ = y.left + E.x, X = y.top + E.y, j = _ / T * 2 - 1, z = 1 - X / I * 2;
    if (!Number.isFinite(j) || !Number.isFinite(z)) {
      f = 0;
      return;
    }
    const rt = $a(v.radius, G), lt = Math.max(0, Math.min(rt.inner, rt.outer)), Y = Math.max(lt, rt.outer), nt = lt * B, St = Y * B;
    if (!(St > 0)) {
      f = 0;
      return;
    }
    let Ct = 0, ft = 0;
    for (let It = 0; It < v.data.length; It++) {
      const pt = (tt = v.data[It]) == null ? void 0 : tt.value;
      typeof pt == "number" && Number.isFinite(pt) && pt > 0 && (Ct += pt, ft++);
    }
    if (!(Ct > 0) || ft === 0) {
      f = 0;
      return;
    }
    b(ft * Ti);
    const ot = w, wt = typeof v.startAngle == "number" && Number.isFinite(v.startAngle) ? v.startAngle : 90;
    let Ft = Or(wt * Math.PI / 180), ut = 0, st = 0, bt = 0;
    for (let It = 0; It < v.data.length; It++) {
      const pt = v.data[It], et = pt == null ? void 0 : pt.value;
      if (typeof et != "number" || !Number.isFinite(et) || et <= 0) continue;
      bt++;
      const Bt = bt === ft;
      let At = et / Ct * xn;
      if (Bt ? At = Math.max(0, xn - ut) : At = Math.max(0, Math.min(xn, At)), ut += At, !(At > 0)) continue;
      const Gt = Ft, Yt = Or(Ft + At);
      Ft = Yt;
      const [Lt, Nt, Ot, Ut] = Oa(pt.color, v.color);
      ot[st + 0] = j, ot[st + 1] = z, ot[st + 2] = Gt, ot[st + 3] = Yt, ot[st + 4] = nt, ot[st + 5] = St, ot[st + 6] = Lt, ot[st + 7] = Nt, ot[st + 8] = Ot, ot[st + 9] = Ut, st += Ti;
    }
    f = st / Ti;
    const K = Math.max(4, f * Zn);
    if (!p || p.size < K) {
      const It = Math.max(Math.max(4, Gr(K)), p ? p.size : 0);
      if (p)
        try {
          p.destroy();
        } catch {
        }
      p = t.createBuffer({
        label: "pieRenderer/instanceBuffer",
        size: It,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
    p && f > 0 && t.queue.writeBuffer(p, 0, a, 0, f * Zn);
  }, render: (v) => {
    F(), !(!p || f === 0) && (N && M > 0 && P > 0 && v.setScissorRect(N.x, N.y, N.w, N.h), v.setPipeline(u), v.setBindGroup(0, c), v.setVertexBuffer(0, p), v.draw(6, f), N && M > 0 && P > 0 && v.setScissorRect(0, 0, M, P));
  }, dispose: () => {
    if (!e) {
      if (e = !0, p)
        try {
          p.destroy();
        } catch {
        }
      p = null, f = 0;
      try {
        s.destroy();
      } catch {
      }
      M = 0, P = 0, N = null;
    }
  } };
}
const Wr = `// candlestick.wgsl
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
`, Ha = "bgra8unorm", Ya = 1, on = 40, He = on / 4, qa = (t) => Math.min(1, Math.max(0, t)), En = (t, n, e) => Math.min(e, Math.max(n, t | 0)), hn = (t) => Qt(t) ?? [0, 0, 0, 1], Un = (t) => {
  if (!Number.isFinite(t) || t <= 0) return 1;
  const n = Math.ceil(t);
  return 2 ** Math.ceil(Math.log2(n));
}, ja = (t) => {
  const n = t.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!n) return null;
  const e = Number(n[1]) / 100;
  return Number.isFinite(e) ? e : null;
}, Za = (t) => Array.isArray(t), Ts = (t) => Za(t) ? { timestamp: t[0], open: t[1], close: t[2], low: t[3], high: t[4] } : { timestamp: t.timestamp, open: t.open, close: t.close, low: t.low, high: t.high }, Ka = (t) => {
  const n = t.devicePixelRatio;
  if (!(n > 0)) return null;
  const e = t.canvasWidth / n, i = t.canvasHeight / n, r = e - t.left - t.right, s = i - t.top - t.bottom;
  return !(r > 0) || !(s > 0) ? null : { plotWidthCss: r, plotHeightCss: s };
}, Ja = (t) => {
  const { left: n, right: e, top: i, bottom: r, canvasWidth: s, canvasHeight: o, devicePixelRatio: l } = t, c = n * l, u = s - e * l, p = i * l, f = o - r * l, a = c / s * 2 - 1, w = u / s * 2 - 1, M = 1 - p / o * 2, P = 1 - f / o * 2;
  return {
    left: a,
    right: w,
    top: M,
    bottom: P,
    width: w - a,
    height: M - P
  };
}, Qa = (t) => {
  const { canvasWidth: n, canvasHeight: e, devicePixelRatio: i } = t, r = t.left * i, s = n - t.right * i, o = t.top * i, l = e - t.bottom * i, c = En(Math.floor(r), 0, Math.max(0, n)), u = En(Math.floor(o), 0, Math.max(0, e)), p = En(Math.ceil(s), 0, Math.max(0, n)), f = En(Math.ceil(l), 0, Math.max(0, e)), a = Math.max(0, p - c), w = Math.max(0, f - u);
  return { x: c, y: u, w: a, h: w };
}, tl = (t) => {
  const n = [];
  for (let i = 0; i < t.length; i++) {
    const { timestamp: r } = Ts(t[i]);
    Number.isFinite(r) && n.push(r);
  }
  if (n.length < 2) return 1;
  n.sort((i, r) => i - r);
  let e = Number.POSITIVE_INFINITY;
  for (let i = 1; i < n.length; i++) {
    const r = n[i] - n[i - 1];
    r > 0 && r < e && (e = r);
  }
  return Number.isFinite(e) && e > 0 ? e : 1;
}, el = (t, n, e, i) => {
  if (Number.isFinite(n) && n > 0) {
    const l = t.scale(0), c = t.scale(0 + n), u = Math.abs(c - l);
    if (Number.isFinite(u) && u > 0) return u;
  }
  const r = Math.abs(e.width);
  if (!(r > 0)) return 0;
  const s = Math.max(1, Math.floor(i));
  return r / s;
}, nl = () => {
  const t = new ArrayBuffer(64);
  return new Float32Array(t).set([
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
  ]), t;
};
function il(t, n) {
  let e = !1;
  const i = (n == null ? void 0 : n.targetFormat) ?? Ha, r = t.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }]
  }), s = zt(t, 80, { label: "candlestickRenderer/vsUniforms" });
  $t(t, s, nl());
  const o = new ArrayBuffer(80), l = new Float32Array(o), c = t.createBindGroup({
    layout: r,
    entries: [{ binding: 0, resource: { buffer: s } }]
  }), u = be(t, {
    label: "candlestickRenderer/pipeline",
    bindGroupLayouts: [r],
    vertex: {
      code: Wr,
      label: "candlestick.wgsl",
      buffers: [
        {
          arrayStride: on,
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
      code: Wr,
      label: "candlestick.wgsl",
      formats: i,
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: 1 }
  });
  let p = null, f = 0, a = new ArrayBuffer(0), w = new Float32Array(a), M = 0, P = 0, N = null, F = !1, b = null, x = 0, g = new ArrayBuffer(0), m = new Float32Array(g);
  const d = () => {
    if (e) throw new Error("CandlestickRenderer is disposed.");
  }, v = (I) => {
    if (I <= w.length) return;
    const R = Math.max(8, Un(I));
    a = new ArrayBuffer(R * 4), w = new Float32Array(a);
  }, y = (I) => {
    if (I <= m.length) return;
    const R = Math.max(8, Un(I));
    g = new ArrayBuffer(R * 4), m = new Float32Array(g);
  };
  return { prepare: (I, R, U, G, E, _) => {
    if (d(), R.length === 0) {
      f = 0, x = 0;
      return;
    }
    const X = Ka(E);
    if (!X) {
      f = 0, x = 0;
      return;
    }
    const j = Ja(E), z = X.plotWidthCss > 0 ? j.width / X.plotWidthCss : 0;
    M = E.canvasWidth, P = E.canvasHeight, N = Qa(E);
    const rt = tl(R), lt = el(U, rt, j, R.length);
    let Y = 0;
    const nt = I.barWidth;
    if (typeof nt == "number")
      Y = Math.max(0, nt) * z;
    else if (typeof nt == "string") {
      const Bt = ja(nt);
      Y = Bt == null ? 0 : lt * qa(Bt);
    }
    const St = I.barMinWidth * z, Ct = I.barMaxWidth * z;
    Y = Math.min(Math.max(Y, St), Ct);
    const ft = I.itemStyle.borderWidth ?? Ya, ot = Math.max(0, ft) * z;
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
      ot,
      0,
      0,
      0
    ]), $t(t, s, o);
    const wt = hn(I.itemStyle.upColor), Ft = hn(I.itemStyle.downColor), ut = hn(I.itemStyle.upBorderColor), st = hn(I.itemStyle.downBorderColor), bt = _ ? hn(_) : [0, 0, 0, 1];
    F = I.style === "hollow", v(R.length * He);
    const K = w;
    let tt = 0;
    F && y(R.length * He);
    const It = m;
    let pt = 0;
    for (let Bt = 0; Bt < R.length; Bt++) {
      const { timestamp: vt, open: At, close: Gt, low: Yt, high: Lt } = Ts(R[Bt]);
      if (!Number.isFinite(vt) || !Number.isFinite(At) || !Number.isFinite(Gt) || !Number.isFinite(Yt) || !Number.isFinite(Lt))
        continue;
      const Nt = U.scale(vt), Ot = G.scale(At), Ut = G.scale(Gt), te = G.scale(Yt), Wt = G.scale(Lt);
      if (!Number.isFinite(Nt) || !Number.isFinite(Ot) || !Number.isFinite(Ut) || !Number.isFinite(te) || !Number.isFinite(Wt))
        continue;
      const oe = Gt > At;
      if (F) {
        const Vt = oe ? ut : st;
        if (K[tt + 0] = Nt, K[tt + 1] = Ot, K[tt + 2] = Ut, K[tt + 3] = te, K[tt + 4] = Wt, K[tt + 5] = Y, K[tt + 6] = Vt[0], K[tt + 7] = Vt[1], K[tt + 8] = Vt[2], K[tt + 9] = Vt[3], tt += He, oe) {
          const kt = I.itemStyle.borderWidth * z, le = Math.max(0, Y - 2 * kt);
          It[pt + 0] = Nt, It[pt + 1] = Ot, It[pt + 2] = Ut, It[pt + 3] = te, It[pt + 4] = Wt, It[pt + 5] = le, It[pt + 6] = bt[0], It[pt + 7] = bt[1], It[pt + 8] = bt[2], It[pt + 9] = bt[3], pt += He;
        }
      } else {
        const Vt = oe ? wt : Ft;
        K[tt + 0] = Nt, K[tt + 1] = Ot, K[tt + 2] = Ut, K[tt + 3] = te, K[tt + 4] = Wt, K[tt + 5] = Y, K[tt + 6] = Vt[0], K[tt + 7] = Vt[1], K[tt + 8] = Vt[2], K[tt + 9] = Vt[3], tt += He;
      }
    }
    f = tt / He, x = pt / He;
    const et = Math.max(4, f * on);
    if (!p || p.size < et) {
      const Bt = Math.max(Math.max(4, Un(et)), p ? p.size : 0);
      if (p)
        try {
          p.destroy();
        } catch {
        }
      p = t.createBuffer({
        label: "candlestickRenderer/instanceBuffer",
        size: Bt,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
    if (f > 0 && t.queue.writeBuffer(p, 0, a, 0, f * on), F && x > 0) {
      const Bt = Math.max(4, x * on);
      if (!b || b.size < Bt) {
        const vt = Math.max(Math.max(4, Un(Bt)), b ? b.size : 0);
        if (b)
          try {
            b.destroy();
          } catch {
          }
        b = t.createBuffer({
          label: "candlestickRenderer/hollowInstanceBuffer",
          size: vt,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      t.queue.writeBuffer(b, 0, g, 0, x * on);
    }
  }, render: (I) => {
    d(), !(!p || f === 0) && (N && M > 0 && P > 0 && I.setScissorRect(N.x, N.y, N.w, N.h), I.setPipeline(u), I.setBindGroup(0, c), I.setVertexBuffer(0, p), I.draw(18, f), F && b && x > 0 && (I.setVertexBuffer(0, b), I.draw(6, x)), N && M > 0 && P > 0 && I.setScissorRect(0, 0, M, P));
  }, dispose: () => {
    if (!e) {
      if (e = !0, p)
        try {
          p.destroy();
        } catch {
        }
      if (p = null, f = 0, b)
        try {
          b.destroy();
        } catch {
        }
      b = null, x = 0;
      try {
        s.destroy();
      } catch {
      }
      M = 0, P = 0, N = null;
    }
  } };
}
const Vr = `// crosshair.wgsl
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

`, rl = (t) => t + 3 & -4, sl = 1024, ol = 128, al = 16384, ll = (t) => {
  if (t.byteOffset & 3)
    throw new Error("createStreamBuffer.write: data.byteOffset must be 4-byte aligned.");
  return new Uint32Array(t.buffer, t.byteOffset, t.byteLength >>> 2);
};
function cl(t, n) {
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`createStreamBuffer(maxSize): maxSize (bytes) must be a positive number. Received: ${String(n)}`);
  const e = Math.max(4, Math.floor(n)), i = rl(e), r = t.limits.maxBufferSize;
  if (i > r)
    throw new Error(
      `createStreamBuffer(maxSize): requested size ${i} bytes exceeds device.limits.maxBufferSize (${r}).`
    );
  const s = i >>> 2, o = (b) => ({
    buffer: t.createBuffer({
      label: b,
      size: i,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    }),
    mirror: new Uint32Array(s)
  }), l = [o("streamBuffer/a"), o("streamBuffer/b")];
  let c = !1, u = 0, p = 0;
  const f = () => {
    if (c) throw new Error("createStreamBuffer: StreamBuffer is disposed.");
  }, a = (b, x, g) => {
    const m = l[b], d = m.mirror;
    if (g < 0 || g > x.length)
      throw new Error("createStreamBuffer.write: internal error (invalid usedWords).");
    if (g === 0) return;
    const v = g << 2;
    t.queue.writeBuffer(m.buffer, 0, x.buffer, x.byteOffset, v), d.set(x.subarray(0, g), 0);
  }, w = (b, x, g) => {
    const m = l[b], d = m.mirror;
    if (g < 0 || g > x.length)
      throw new Error("createStreamBuffer.write: internal error (invalid usedWords).");
    const v = g << 2;
    if (v > 0 && v <= sl) {
      a(b, x, g);
      return;
    }
    const y = [];
    let C = 0, B = 0, T = 0;
    for (; T < g; ) {
      for (; T < g && d[T] === x[T]; ) T++;
      if (T >= g) break;
      const I = T;
      for (T++; T < g && d[T] !== x[T]; ) T++;
      const R = T;
      if (y.push([I, R]), C++, B += R - I, C > ol || B > al) {
        a(b, x, g);
        return;
      }
    }
    for (let I = 0; I < y.length; I++) {
      const [R, U] = y[I], G = R << 2, E = U - R << 2;
      t.queue.writeBuffer(m.buffer, G, x.buffer, x.byteOffset + G, E), d.set(x.subarray(R, U), R);
    }
  };
  return { write: (b) => {
    if (f(), b.length & 1)
      throw new Error("createStreamBuffer.write: data length must be even (vec2<f32> vertices).");
    const x = b.byteLength;
    if (x > i)
      throw new Error(
        `createStreamBuffer.write: data.byteLength (${x}) exceeds capacity (${i}). Increase maxSize.`
      );
    const g = b.length >>> 1;
    if (x === 0) {
      p = g;
      return;
    }
    const m = ll(b), d = 1 - u;
    w(d, m, m.length), u = d, p = g;
  }, getBuffer: () => (f(), l[u].buffer), getVertexCount: () => (f(), p), dispose: () => {
    if (!c) {
      c = !0, p = 0;
      for (const b of l)
        try {
          b.buffer.destroy();
        } catch {
        }
    }
  } };
}
const ul = "bgra8unorm", fl = [1, 1, 1, 0.8], ml = 8, dl = 6, pl = 4, Ps = 8192, hl = () => {
  const t = new ArrayBuffer(64);
  return new Float32Array(t).set([
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
  ]), t;
}, bl = (t) => Number.isFinite(t.left) && Number.isFinite(t.right) && Number.isFinite(t.top) && Number.isFinite(t.bottom) && Number.isFinite(t.canvasWidth) && Number.isFinite(t.canvasHeight), Ln = (t, n, e) => Math.min(e, Math.max(n, t | 0)), gl = (t, n) => {
  if (!Number.isFinite(t) || t < 0)
    throw new Error("CrosshairRenderer.prepare: lineWidth must be a finite non-negative number.");
  if (t === 0) return [];
  const e = t * n, i = Math.max(1, Math.min(ml, Math.round(e))), r = (i - 1) / 2, s = [];
  for (let o = 0; o < i; o++) s.push(o - r);
  return s;
}, rn = (t, n) => t / n * 2 - 1, sn = (t, n) => 1 - t / n * 2, _n = (t, n) => {
  t.push(n[0], n[1], n[2], n[3]);
}, $r = (t, n) => {
  if (!Number.isFinite(t) || !Number.isFinite(n)) return [];
  const e = Math.min(t, n), i = Math.max(t, n);
  if (i <= e) return [];
  const r = dl, o = r + pl;
  if (!Number.isFinite(o)) return [];
  const l = Math.ceil((i - e) / o);
  if (!Number.isFinite(l) || l <= 0) return [];
  const c = [];
  let u = e;
  for (; u < i; ) {
    const p = u, f = Math.min(u + r, i);
    f > p && c.push([p, f]), u += o;
  }
  return c;
}, yl = (t, n, e, i) => {
  if (!Number.isFinite(t) || !Number.isFinite(n))
    throw new Error("CrosshairRenderer.prepare: x and y must be finite numbers.");
  if (!bl(e))
    throw new Error("CrosshairRenderer.prepare: gridArea dimensions must be finite numbers.");
  if (e.canvasWidth <= 0 || e.canvasHeight <= 0)
    throw new Error("CrosshairRenderer.prepare: canvas dimensions must be positive.");
  if (e.left < 0 || e.right < 0 || e.top < 0 || e.bottom < 0)
    throw new Error("CrosshairRenderer.prepare: gridArea margins must be non-negative.");
  const { canvasWidth: r, canvasHeight: s } = e, o = Number.isFinite(e.devicePixelRatio) && e.devicePixelRatio > 0 ? e.devicePixelRatio : 1, l = e.left * o, c = r - e.right * o, u = e.top * o, p = s - e.bottom * o, f = Ln(Math.floor(l), 0, Math.max(0, r)), a = Ln(Math.floor(u), 0, Math.max(0, s)), w = Ln(Math.ceil(c), 0, Math.max(0, r)), M = Ln(Math.ceil(p), 0, Math.max(0, s)), P = Math.max(0, w - f), N = Math.max(0, M - a), F = t * o, b = n * o, x = gl(i.lineWidth, o);
  if (x.length === 0 || !i.showX && !i.showY)
    return {
      vertices: new Float32Array(0),
      scissor: { x: f, y: a, w: P, h: N }
    };
  const g = [], m = i.showX ? $r(u, p) : [], d = i.showY ? $r(l, c) : [], y = ((i.showX ? m.length : 0) + (i.showY ? d.length : 0)) * x.length * 2, C = y > 0 && y <= Ps, B = (R) => {
    const U = rn(R, r), G = sn(u, s), E = sn(p, s);
    _n(g, [U, G, U, E]);
  }, T = (R) => {
    const U = sn(R, s), G = rn(l, r), E = rn(c, r);
    _n(g, [G, U, E, U]);
  };
  if (i.showX)
    for (let R = 0; R < x.length; R++) {
      const U = F + x[R];
      if (!C) {
        B(U);
        continue;
      }
      const G = rn(U, r);
      for (let E = 0; E < m.length; E++) {
        const [_, X] = m[E], j = sn(_, s), z = sn(X, s);
        _n(g, [G, j, G, z]);
      }
    }
  if (i.showY)
    for (let R = 0; R < x.length; R++) {
      const U = b + x[R];
      if (!C) {
        T(U);
        continue;
      }
      const G = sn(U, s);
      for (let E = 0; E < d.length; E++) {
        const [_, X] = d[E], j = rn(_, r), z = rn(X, r);
        _n(g, [j, G, z, G]);
      }
    }
  return { vertices: new Float32Array(g), scissor: { x: f, y: a, w: P, h: N } };
};
function xl(t, n) {
  let e = !1, i = !0;
  const r = (n == null ? void 0 : n.targetFormat) ?? ul, s = t.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
    ]
  }), o = zt(t, 64, { label: "crosshairRenderer/vsUniforms" }), l = zt(t, 16, { label: "crosshairRenderer/fsUniforms" }), c = t.createBindGroup({
    layout: s,
    entries: [
      { binding: 0, resource: { buffer: o } },
      { binding: 1, resource: { buffer: l } }
    ]
  }), u = be(t, {
    label: "crosshairRenderer/pipeline",
    bindGroupLayouts: [s],
    vertex: {
      code: Vr,
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
      code: Vr,
      label: "crosshair.wgsl",
      formats: r,
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "line-list", cullMode: "none" },
    multisample: { count: 1 }
  }), p = cl(t, Ps * 8);
  let f = 0, a = 0, w = 0, M = { x: 0, y: 0, w: 0, h: 0 };
  const P = () => {
    if (e) throw new Error("CrosshairRenderer is disposed.");
  };
  return { prepare: (g, m, d, v) => {
    if (P(), typeof v.showX != "boolean" || typeof v.showY != "boolean")
      throw new Error("CrosshairRenderer.prepare: showX/showY must be boolean.");
    if (typeof v.color != "string")
      throw new Error("CrosshairRenderer.prepare: color must be a string.");
    if (!Number.isFinite(v.lineWidth) || v.lineWidth < 0)
      throw new Error("CrosshairRenderer.prepare: lineWidth must be a finite non-negative number.");
    const { vertices: y, scissor: C } = yl(g, m, d, v);
    y.byteLength === 0 ? f = 0 : (p.write(y), f = p.getVertexCount()), $t(t, o, hl());
    const B = Qt(v.color) ?? fl, T = new ArrayBuffer(4 * 4);
    new Float32Array(T).set([B[0], B[1], B[2], B[3]]), $t(t, l, T), a = d.canvasWidth, w = d.canvasHeight, M = C;
  }, render: (g) => {
    P(), i && f !== 0 && (a <= 0 || w <= 0 || (g.setScissorRect(M.x, M.y, M.w, M.h), g.setPipeline(u), g.setBindGroup(0, c), g.setVertexBuffer(0, p.getBuffer()), g.draw(f), g.setScissorRect(0, 0, a, w)));
  }, setVisible: (g) => {
    P(), i = !!g;
  }, dispose: () => {
    if (!e) {
      e = !0;
      try {
        o.destroy();
      } catch {
      }
      try {
        l.destroy();
      } catch {
      }
      p.dispose(), f = 0, a = 0, w = 0, M = { x: 0, y: 0, w: 0, h: 0 };
    }
  } };
}
const zr = `// highlight.wgsl
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

`, wl = "bgra8unorm", Fl = [1, 1, 1, 1], Gn = (t) => Math.min(1, Math.max(0, t)), On = (t, n, e) => Math.min(e, Math.max(n, t | 0)), vl = (t) => Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.w) && Number.isFinite(t.h), Nl = (t, n) => {
  const e = Number.isFinite(n) ? n : 1;
  return [Gn(t[0] * e), Gn(t[1] * e), Gn(t[2] * e), Gn(t[3])];
}, Ml = (t) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
function Sl(t, n) {
  let e = !1, i = !0;
  const r = (n == null ? void 0 : n.targetFormat) ?? wl, s = t.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
  }), o = zt(t, 48, { label: "highlightRenderer/uniforms" }), l = t.createBindGroup({
    layout: s,
    entries: [{ binding: 0, resource: { buffer: o } }]
  }), c = be(t, {
    label: "highlightRenderer/pipeline",
    bindGroupLayouts: [s],
    vertex: { code: zr, label: "highlight.wgsl" },
    fragment: {
      code: zr,
      label: "highlight.wgsl",
      formats: r,
      blend: {
        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      }
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: 1 }
  });
  let u = 0, p = 0, f = { x: 0, y: 0, w: 0, h: 0 }, a = !1;
  const w = () => {
    if (e) throw new Error("HighlightRenderer is disposed.");
  };
  return { prepare: (b, x, g) => {
    if (w(), !Number.isFinite(b.centerDeviceX) || !Number.isFinite(b.centerDeviceY))
      throw new Error("HighlightRenderer.prepare: point center must be finite.");
    if (!Number.isFinite(b.canvasWidth) || !Number.isFinite(b.canvasHeight) || b.canvasWidth <= 0 || b.canvasHeight <= 0)
      throw new Error("HighlightRenderer.prepare: canvasWidth/canvasHeight must be positive finite numbers.");
    if (!vl(b.scissor))
      throw new Error("HighlightRenderer.prepare: scissor must be finite.");
    if (!Number.isFinite(g) || g < 0)
      throw new Error("HighlightRenderer.prepare: size must be a finite non-negative number.");
    const m = b.devicePixelRatio, d = Number.isFinite(m) && m > 0 ? m : 1, v = g * d, y = Math.max(1, v * 1.5), C = Math.max(1, Math.round(Math.max(2, y * 0.25))), B = Qt(x) ?? Fl, T = Nl(B, 1.25), R = Ml(B) > 0.7 ? [0, 0, 0, 0.9] : [1, 1, 1, 0.9], U = new ArrayBuffer(12 * 4);
    new Float32Array(U).set([
      b.centerDeviceX,
      b.centerDeviceY,
      y,
      C,
      T[0],
      T[1],
      T[2],
      1,
      R[0],
      R[1],
      R[2],
      R[3]
    ]), $t(t, o, U), u = b.canvasWidth, p = b.canvasHeight;
    const G = On(Math.floor(b.scissor.x), 0, Math.max(0, b.canvasWidth)), E = On(Math.floor(b.scissor.y), 0, Math.max(0, b.canvasHeight)), _ = On(Math.ceil(b.scissor.x + b.scissor.w), 0, Math.max(0, b.canvasWidth)), X = On(Math.ceil(b.scissor.y + b.scissor.h), 0, Math.max(0, b.canvasHeight));
    f = { x: G, y: E, w: Math.max(0, _ - G), h: Math.max(0, X - E) }, a = !0;
  }, render: (b) => {
    w(), i && a && (u <= 0 || p <= 0 || f.w === 0 || f.h === 0 || (b.setScissorRect(f.x, f.y, f.w, f.h), b.setPipeline(c), b.setBindGroup(0, l), b.draw(3), b.setScissorRect(0, 0, u, p)));
  }, setVisible: (b) => {
    w(), i = !!b;
  }, dispose: () => {
    if (!e) {
      e = !0;
      try {
        o.destroy();
      } catch {
      }
      u = 0, p = 0, f = { x: 0, y: 0, w: 0, h: 0 }, a = !1;
    }
  } };
}
const Cl = 6, Il = 500;
function Tl(t, n) {
  let e = !1, i = n;
  const r = {
    mousemove: /* @__PURE__ */ new Set(),
    click: /* @__PURE__ */ new Set(),
    mouseleave: /* @__PURE__ */ new Set()
  };
  let s = null, o = null;
  const l = (g) => {
    const m = t.getBoundingClientRect();
    if (m.width === 0 || m.height === 0) return null;
    const d = g.clientX - m.left, v = g.clientY - m.top, y = i.left, C = i.top, B = m.width - i.left - i.right, T = m.height - i.top - i.bottom, I = d - y, R = v - C, U = I >= 0 && I <= B && R >= 0 && R <= T;
    return { x: d, y: v, gridX: I, gridY: R, plotWidthCss: B, plotHeightCss: T, isInGrid: U, originalEvent: g };
  }, c = (g, m) => {
    const d = l(m);
    if (d)
      for (const v of r[g]) v(d);
  }, u = (g) => {
    s && g.isPrimary && g.pointerId === s.pointerId && (s = null);
  }, p = (g) => {
    e || c("mousemove", g);
  }, f = (g) => {
    e || (u(g), c("mouseleave", g));
  }, a = (g) => {
    e || (u(g), c("mouseleave", g));
  }, w = (g) => {
    if (!e) {
      if (o === g.pointerId) {
        o = null;
        return;
      }
      u(g), c("mouseleave", g);
    }
  }, M = (g) => {
    if (e || !g.isPrimary || g.pointerType === "mouse" && g.button !== 0) return;
    const m = t.getBoundingClientRect();
    if (!(m.width === 0 || m.height === 0)) {
      s = {
        pointerId: g.pointerId,
        startClientX: g.clientX,
        startClientY: g.clientY,
        startTimeMs: g.timeStamp
      };
      try {
        t.setPointerCapture(g.pointerId);
      } catch {
      }
    }
  }, P = (g) => {
    if (e || !g.isPrimary || !s || g.pointerId !== s.pointerId) return;
    const m = g.timeStamp - s.startTimeMs, d = g.clientX - s.startClientX, v = g.clientY - s.startClientY, y = d * d + v * v;
    s = null;
    try {
      t.hasPointerCapture(g.pointerId) && (o = g.pointerId, t.releasePointerCapture(g.pointerId));
    } catch {
    }
    const C = Cl;
    m <= Il && y <= C * C && c("click", g);
  };
  return t.addEventListener("pointermove", p, { passive: !0 }), t.addEventListener("pointerleave", f, { passive: !0 }), t.addEventListener("pointercancel", a, { passive: !0 }), t.addEventListener("lostpointercapture", w, { passive: !0 }), t.addEventListener("pointerdown", M, { passive: !0 }), t.addEventListener("pointerup", P, { passive: !0 }), { canvas: t, on: (g, m) => {
    e || r[g].add(m);
  }, off: (g, m) => {
    r[g].delete(m);
  }, updateGridArea: (g) => {
    i = g;
  }, dispose: () => {
    e || (e = !0, s = null, o = null, t.removeEventListener("pointermove", p), t.removeEventListener("pointerleave", f), t.removeEventListener("pointercancel", a), t.removeEventListener("lostpointercapture", w), t.removeEventListener("pointerdown", M), t.removeEventListener("pointerup", P), r.mousemove.clear(), r.click.clear(), r.mouseleave.clear());
  } };
}
const kr = (t, n, e) => Math.min(e, Math.max(n, t)), Pl = (t, n) => {
  const e = t.deltaY;
  if (!Number.isFinite(e) || e === 0) return 0;
  switch (t.deltaMode) {
    case WheelEvent.DOM_DELTA_PIXEL:
      return e;
    case WheelEvent.DOM_DELTA_LINE:
      return e * 16;
    case WheelEvent.DOM_DELTA_PAGE:
      return e * (Number.isFinite(n) && n > 0 ? n : 800);
    default:
      return e;
  }
}, Bl = (t, n) => {
  const e = t.deltaX;
  if (!Number.isFinite(e) || e === 0) return 0;
  switch (t.deltaMode) {
    case WheelEvent.DOM_DELTA_PIXEL:
      return e;
    case WheelEvent.DOM_DELTA_LINE:
      return e * 16;
    case WheelEvent.DOM_DELTA_PAGE:
      return e * (Number.isFinite(n) && n > 0 ? n : 800);
    default:
      return e;
  }
}, Al = (t) => {
  const n = Math.abs(t);
  if (!Number.isFinite(n) || n === 0) return 1;
  const e = Math.min(n, 200);
  return Math.exp(e * 2e-3);
}, Rl = (t) => t.pointerType === "mouse" && (t.buttons & 4) !== 0, Dl = (t) => t.pointerType === "mouse" && t.shiftKey && (t.buttons & 1) !== 0;
function El(t, n) {
  let e = !1, i = !1, r = null, s = !1, o = 0;
  const l = () => {
    s = !1, o = 0;
  }, c = (M) => {
    if (r = M, !i) return;
    const P = M.originalEvent;
    if (!(M.isInGrid && (Dl(P) || Rl(P)))) {
      l();
      return;
    }
    const F = M.plotWidthCss;
    if (!(F > 0) || !Number.isFinite(F)) {
      l();
      return;
    }
    if (!s) {
      s = !0, o = M.gridX;
      return;
    }
    const b = M.gridX - o;
    if (o = M.gridX, !Number.isFinite(b) || b === 0) return;
    const { start: x, end: g } = n.getRange(), m = g - x;
    if (!Number.isFinite(m) || m === 0) return;
    const d = -(b / F) * m;
    !Number.isFinite(d) || d === 0 || n.pan(d);
  }, u = (M) => {
    r = null, l();
  }, p = (M) => {
    if (!i || e) return;
    const P = r;
    if (!P || !P.isInGrid) return;
    const N = P.plotWidthCss, F = P.plotHeightCss;
    if (!(N > 0) || !(F > 0)) return;
    const b = Pl(M, F), x = Bl(M, N);
    if (Math.abs(x) > Math.abs(b) && x !== 0) {
      const { start: B, end: T } = n.getRange(), I = T - B;
      if (!Number.isFinite(I) || I === 0) return;
      const R = x / N * I;
      if (!Number.isFinite(R) || R === 0) return;
      M.preventDefault(), n.pan(R);
      return;
    }
    if (b === 0) return;
    const g = Al(b);
    if (!(g > 1)) return;
    const { start: m, end: d } = n.getRange(), v = d - m;
    if (!Number.isFinite(v) || v === 0) return;
    const y = kr(P.gridX / N, 0, 1), C = kr(m + y * v, 0, 100);
    M.preventDefault(), b < 0 ? n.zoomIn(C, g) : n.zoomOut(C, g);
  }, f = () => {
    e || i || (i = !0, t.on("mousemove", c), t.on("mouseleave", u), t.canvas.addEventListener("wheel", p, { passive: !1 }));
  }, a = () => {
    e || !i || (i = !1, t.off("mousemove", c), t.off("mouseleave", u), t.canvas.removeEventListener("wheel", p), r = null, l());
  };
  return { enable: f, disable: a, dispose: () => {
    e || (a(), e = !0);
  } };
}
const Ul = 0.5, Ll = 100, pe = (t, n, e) => Math.min(e, Math.max(n, t)), Pi = (t) => pe(t, 0, 1), Xr = (t) => Object.is(t, -0) ? 0 : t, _l = (t) => ({ start: t.start, end: t.end });
function Gl(t, n, e) {
  let i = 0, r = 100, s = null;
  const o = /* @__PURE__ */ new Set();
  let l = (() => {
    const d = Number.isFinite(e == null ? void 0 : e.minSpan) ? e.minSpan : Ul;
    return pe(Number.isFinite(d) ? d : 0, 0, 100);
  })(), c = (() => {
    const d = Number.isFinite(e == null ? void 0 : e.maxSpan) ? e.maxSpan : Ll;
    return pe(Number.isFinite(d) ? d : 100, 0, 100);
  })(), u = Math.min(l, c), p = Math.max(l, c);
  const f = () => {
    const d = { start: i, end: r };
    if (s !== null && s.start === d.start && s.end === d.end)
      return;
    s = _l(d);
    const v = Array.from(o);
    for (const y of v) y({ start: i, end: r });
  }, a = (d, v, y) => {
    if (y) {
      if (typeof y == "string")
        switch (y) {
          case "start":
            return { center: d, ratio: 0 };
          case "end":
            return { center: v, ratio: 1 };
          case "center":
            return { center: (d + v) * 0.5, ratio: 0.5 };
        }
      if (y && Number.isFinite(y.center) && Number.isFinite(y.ratio))
        return { center: y.center, ratio: y.ratio };
    }
  }, w = (d, v, y) => {
    if (!Number.isFinite(d) || !Number.isFinite(v)) return;
    let C = d, B = v;
    if (C > B) {
      const R = C;
      C = B, B = R;
    }
    let T = B - C;
    if (!Number.isFinite(T) || T < 0) return;
    const I = pe(T, u, p);
    if (I !== T) {
      const R = y != null && y.anchor && Number.isFinite(y.anchor.center) ? pe(y.anchor.center, 0, 100) : (C + B) * 0.5, U = y != null && y.anchor && Number.isFinite(y.anchor.ratio) ? Pi(y.anchor.ratio) : 0.5;
      C = R - U * I, B = C + I, T = I;
    }
    if (T > 100 && (C = 0, B = 100, T = 100), C < 0) {
      const R = -C;
      C += R, B += R;
    }
    if (B > 100) {
      const R = B - 100;
      C -= R, B -= R;
    }
    C = pe(C, 0, 100), B = pe(B, 0, 100), C = Xr(C), B = Xr(B), !(C === i && B === r) && (i = C, r = B, (y == null ? void 0 : y.emit) !== !1 && f());
  };
  return w(t, n, { emit: !1 }), { getRange: () => ({ start: i, end: r }), setRange: (d, v) => {
    w(d, v);
  }, setRangeAnchored: (d, v, y) => {
    w(d, v, { anchor: a(d, v, y) });
  }, setSpanConstraints: (d, v) => {
    const y = typeof d == "number" && Number.isFinite(d) ? pe(d, 0, 100) : l, C = typeof v == "number" && Number.isFinite(v) ? pe(v, 0, 100) : c;
    if (y === l && C === c) return;
    l = y, c = C, u = Math.min(l, c), p = Math.max(l, c);
    const B = i, T = r, I = 1e-6, R = T >= 100 - I ? "end" : B <= 0 + I ? "start" : "center";
    w(B, T, { anchor: a(B, T, R) });
  }, zoomIn: (d, v) => {
    if (!Number.isFinite(d) || !Number.isFinite(v) || v <= 1) return;
    const y = pe(d, 0, 100), C = r - i, B = C === 0 ? 0.5 : Pi((y - i) / C), T = C / v, I = y - B * T, R = I + T;
    w(I, R, { anchor: { center: y, ratio: B } });
  }, zoomOut: (d, v) => {
    if (!Number.isFinite(d) || !Number.isFinite(v) || v <= 1) return;
    const y = pe(d, 0, 100), C = r - i, B = C === 0 ? 0.5 : Pi((y - i) / C), T = C * v, I = y - B * T, R = I + T;
    w(I, R, { anchor: { center: y, ratio: B } });
  }, pan: (d) => {
    Number.isFinite(d) && w(i + d, r + d);
  }, onChange: (d) => (o.add(d), () => {
    o.delete(d);
  }) };
}
const Hr = 20, Ol = 0.01, Wl = 0.2, Fn = 4, Yr = /* @__PURE__ */ new WeakMap();
function Vl(t, n, e) {
  return t >= e.left && t <= e.right && n >= e.top && n <= e.bottom;
}
const Bi = (t) => Math.min(1, Math.max(0, t)), $l = (t) => {
  const n = t.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!n) return null;
  const e = Number(n[1]) / 100;
  return Number.isFinite(e) ? e : null;
}, zl = (t) => {
  if (typeof t != "string") return "";
  const n = t.trim();
  return n.length > 0 ? n : "";
}, Yi = (t) => Array.isArray(t), Mn = (t) => Yi(t) ? { x: t[0], y: t[1] } : { x: t.x, y: t.y }, Bs = (t) => {
  if (Yi(t)) {
    const e = t[2];
    return typeof e == "number" && Number.isFinite(e) ? e : null;
  }
  const n = t.size;
  return typeof n == "number" && Number.isFinite(n) ? n : null;
}, kl = (t) => Yi(t) ? t : [t.x, t.y, t.size], Xl = (t, n) => {
  try {
    const e = t(n);
    return typeof e == "number" && Number.isFinite(e) ? e : null;
  } catch {
    return null;
  }
}, gn = (t, n) => {
  const e = Bs(n);
  if (e != null) return Math.max(0, e);
  const i = t.symbolSize;
  if (typeof i == "number")
    return Number.isFinite(i) ? Math.max(0, i) : Fn;
  if (typeof i == "function") {
    const r = Xl(i, kl(n));
    return r == null ? Fn : Math.max(0, r);
  }
  return Fn;
}, Hl = (t) => {
  const n = Yr.get(t);
  if (n !== void 0) return n;
  const e = t.data, i = t.symbolSize;
  let r = 0;
  if (typeof i != "function") {
    const s = typeof i == "number" && Number.isFinite(i) ? Math.max(0, i) : Fn;
    let o = 0, l = !1;
    for (let c = 0; c < e.length; c++) {
      const u = Bs(e[c]);
      if (u == null)
        l = !0;
      else {
        const p = Math.max(0, u);
        p > o && (o = p);
      }
    }
    r = l ? Math.max(o, s) : o;
  } else
    for (let s = 0; s < e.length; s++) {
      const o = gn(t, e[s]);
      o > r && (r = o);
    }
  return r = Number.isFinite(r) ? Math.max(0, r) : Fn, Yr.set(t, r), r;
};
function Yl(t) {
  const n = /* @__PURE__ */ new Map(), e = new Array(t.length), i = new Array(t.length);
  let r = 0;
  for (let s = 0; s < t.length; s++) {
    const o = zl(t[s].stack);
    if (i[s] = o, o !== "") {
      const l = n.get(o);
      if (l !== void 0)
        e[s] = l;
      else {
        const c = r++;
        n.set(o, c), e[s] = c;
      }
    } else
      e[s] = r++;
  }
  return {
    clusterIndexBySeries: e,
    clusterCount: Math.max(1, r),
    stackIdBySeries: i
  };
}
function ql(t) {
  const n = [];
  for (let i = 0; i < t.length; i++) {
    const r = t[i].data;
    for (let s = 0; s < r.length; s++) {
      const { x: o } = Mn(r[s]);
      Number.isFinite(o) && n.push(o);
    }
  }
  if (n.length < 2) return 1;
  n.sort((i, r) => i - r);
  let e = Number.POSITIVE_INFINITY;
  for (let i = 1; i < n.length; i++) {
    const r = n[i] - n[i - 1];
    r > 0 && r < e && (e = r);
  }
  return Number.isFinite(e) && e > 0 ? e : 1;
}
function jl(t, n, e) {
  if (Number.isFinite(e) && e > 0) {
    const o = n.scale(0), l = n.scale(0 + e), c = Math.abs(l - o);
    if (Number.isFinite(c) && c > 0) return c;
  }
  const i = [];
  for (let s = 0; s < t.length; s++) {
    const o = t[s].data;
    for (let l = 0; l < o.length; l++) {
      const { x: c } = Mn(o[l]);
      if (!Number.isFinite(c)) continue;
      const u = n.scale(c);
      Number.isFinite(u) && i.push(u);
    }
  }
  if (i.length < 2) return 0;
  i.sort((s, o) => s - o);
  let r = Number.POSITIVE_INFINITY;
  for (let s = 1; s < i.length; s++) {
    const o = i[s] - i[s - 1];
    o > 0 && o < r && (r = o);
  }
  return Number.isFinite(r) && r > 0 ? r : 0;
}
const Zl = (t) => {
  let n, e, i;
  for (let r = 0; r < t.length; r++) {
    const s = t[r];
    n === void 0 && s.barWidth !== void 0 && (n = s.barWidth), e === void 0 && s.barGap !== void 0 && (e = s.barGap), i === void 0 && s.barCategoryGap !== void 0 && (i = s.barCategoryGap);
  }
  return { barWidth: n, barGap: e, barCategoryGap: i };
};
function As(t, n) {
  const e = Yl(t), i = e.clusterCount, r = ql(t), s = jl(t, n, r), o = Zl(t), l = Bi(o.barGap ?? Ol), c = Bi(o.barCategoryGap ?? Wl), u = Math.max(0, s * (1 - c)), p = i + Math.max(0, i - 1) * l, f = p > 0 ? u / p : 0;
  let a = 0;
  const w = o.barWidth;
  if (typeof w == "number")
    a = Math.max(0, w), a = Math.min(a, f);
  else if (typeof w == "string") {
    const N = $l(w);
    a = N == null ? 0 : f * Bi(N);
  }
  a > 0 || (a = f);
  const M = a * l, P = i * a + Math.max(0, i - 1) * M;
  return {
    categoryStep: r,
    categoryWidthPx: s,
    barWidthPx: a,
    gapPx: M,
    clusterWidthPx: P,
    clusterSlots: e
  };
}
const Ai = (t) => {
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < t.length; i++) {
    const r = t[i].data;
    for (let s = 0; s < r.length; s++) {
      const { y: o } = Mn(r[s]);
      Number.isFinite(o) && (o < n && (n = o), o > e && (e = o));
    }
  }
  return !Number.isFinite(n) || !Number.isFinite(e) || n <= 0 && 0 <= e ? 0 : Math.abs(n) < Math.abs(e) ? n : e;
};
function Kl(t, n) {
  let e = 0;
  for (let i = 0; i < t.length; i++) {
    const r = t[i].data;
    for (let s = 0; s < r.length; s++) {
      const { y: o } = Mn(r[s]);
      if (!Number.isFinite(o)) continue;
      const l = n.scale(o);
      Number.isFinite(l) && l > e && (e = l);
    }
  }
  return Math.max(0, e);
}
function Jl(t, n, e) {
  const i = n.invert(e), r = n.invert(0), s = Math.min(i, r), o = Math.max(i, r);
  let l;
  !Number.isFinite(s) || !Number.isFinite(o) ? l = Ai(t) : s <= 0 && 0 <= o ? l = 0 : s > 0 ? l = s : o < 0 ? l = o : l = Ai(t);
  let c = n.scale(l);
  return Number.isFinite(c) || (l = Ai(t), c = n.scale(l)), Number.isFinite(c) || (l = 0, c = n.scale(0)), { baselineDomain: l, baselinePx: c };
}
function Ql(t, n, e, i) {
  return Number.isFinite(n) && n > 0 && Number.isFinite(t) ? Math.round(t / n) : Number.isFinite(i) && i > 0 && Number.isFinite(e) ? Math.round(e / i) : Math.round(e * 1e6);
}
const tc = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r][0] < n ? e = r + 1 : i = r;
  }
  return e;
}, ec = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r].x < n ? e = r + 1 : i = r;
  }
  return e;
};
function Ri(t, n, e, i, r, s = Hr) {
  var P;
  if (!Number.isFinite(n) || !Number.isFinite(e)) return null;
  const o = Number.isFinite(s) ? Math.max(0, s) : Hr, l = o * o, c = i.invert(n);
  if (!Number.isFinite(c)) return null;
  let u = -1, p = -1, f = null, a = Number.POSITIVE_INFINITY;
  const w = [], M = [];
  for (let N = 0; N < t.length; N++) {
    const F = t[N];
    (F == null ? void 0 : F.type) === "bar" && (w.push(F), M.push(N));
  }
  if (w.length > 0) {
    const N = As(w, i);
    if (N.barWidthPx > 0 && N.clusterWidthPx >= 0) {
      const F = Kl(w, r), { baselineDomain: b, baselinePx: x } = Jl(w, r, F), { clusterSlots: g, barWidthPx: m, gapPx: d, clusterWidthPx: v, categoryWidthPx: y, categoryStep: C } = N, B = /* @__PURE__ */ new Map();
      let T = null;
      for (let I = 0; I < w.length; I++) {
        const R = w[I], U = M[I] ?? -1;
        if (U < 0) continue;
        const G = R.data, E = g.clusterIndexBySeries[I] ?? 0, _ = g.stackIdBySeries[I] ?? "";
        for (let X = 0; X < G.length; X++) {
          const { x: j, y: z } = Mn(G[X]);
          if (!Number.isFinite(j) || !Number.isFinite(z)) continue;
          const rt = i.scale(j);
          if (!Number.isFinite(rt)) continue;
          const lt = rt - v / 2 + E * (m + d), Y = lt + m;
          let nt = b, St = z;
          if (_ !== "") {
            let Ft = B.get(_);
            Ft || (Ft = /* @__PURE__ */ new Map(), B.set(_, Ft));
            const ut = Ql(rt, y, j, C);
            let st = Ft.get(ut);
            st || (st = { posSum: b, negSum: b }, Ft.set(ut, st)), z >= 0 ? (nt = st.posSum, St = nt + z, st.posSum = St) : (nt = st.negSum, St = nt + z, st.negSum = St);
          } else
            nt = b, St = z;
          const Ct = _ !== "" ? r.scale(nt) : x, ft = r.scale(St);
          if (!Number.isFinite(Ct) || !Number.isFinite(ft)) continue;
          const ot = {
            left: lt,
            right: Y,
            top: Math.min(Ct, ft),
            bottom: Math.max(Ct, ft)
          };
          if (!Vl(n, e, ot)) continue;
          (T === null || ot.top < T.top || ot.top === T.top && U > T.seriesIndex) && (T = { seriesIndex: U, dataIndex: X, top: ot.top });
        }
      }
      if (T) {
        const I = (P = t[T.seriesIndex]) == null ? void 0 : P.data[T.dataIndex];
        if (I)
          return {
            seriesIndex: T.seriesIndex,
            dataIndex: T.dataIndex,
            point: I,
            distance: 0
          };
      }
    }
  }
  for (let N = 0; N < t.length; N++) {
    const F = t[N];
    if (F.type === "pie" || F.type === "candlestick") continue;
    const b = F.data, x = b.length;
    if (x === 0) continue;
    const g = F.type === "scatter", m = g ? F : null, d = m ? Hl(m) : 0, v = g ? (o + d) * (o + d) : l, y = b[0];
    if (Array.isArray(y)) {
      const B = b, T = tc(B, c);
      let I = T - 1, R = T;
      for (; I >= 0 || R < x; ) {
        const U = Math.min(a, v);
        let G = Number.POSITIVE_INFINITY;
        if (I >= 0) {
          const _ = B[I][0];
          if (Number.isFinite(_)) {
            const X = i.scale(_);
            if (Number.isFinite(X)) {
              const j = X - n;
              G = j * j;
            }
          }
        }
        let E = Number.POSITIVE_INFINITY;
        if (R < x) {
          const _ = B[R][0];
          if (Number.isFinite(_)) {
            const X = i.scale(_);
            if (Number.isFinite(X)) {
              const j = X - n;
              E = j * j;
            }
          }
        }
        if (G > U && E > U) break;
        if (G <= E && G <= U && I >= 0) {
          const _ = B[I][1];
          if (Number.isFinite(_)) {
            const X = r.scale(_);
            if (Number.isFinite(X)) {
              const j = X - e, z = G + j * j, rt = b[I], lt = m ? (() => {
                const Y = gn(m, rt), nt = o + Y;
                return nt * nt;
              })() : l;
              z <= lt && (z < a || z === a && (f === null || N < u || N === u && I < p)) && (a = z, u = N, p = I, f = rt);
            }
          }
          I--;
        } else G <= E && I--;
        if (E <= G && E <= U && R < x) {
          const _ = B[R][1];
          if (Number.isFinite(_)) {
            const X = r.scale(_);
            if (Number.isFinite(X)) {
              const j = X - e, z = E + j * j, rt = b[R], lt = m ? (() => {
                const Y = gn(m, rt), nt = o + Y;
                return nt * nt;
              })() : l;
              z <= lt && (z < a || z === a && (f === null || N < u || N === u && R < p)) && (a = z, u = N, p = R, f = rt);
            }
          }
          R++;
        } else E < G && R++;
      }
    } else {
      const B = b, T = ec(B, c);
      let I = T - 1, R = T;
      for (; I >= 0 || R < x; ) {
        const U = Math.min(a, v);
        let G = Number.POSITIVE_INFINITY;
        if (I >= 0) {
          const _ = B[I].x;
          if (Number.isFinite(_)) {
            const X = i.scale(_);
            if (Number.isFinite(X)) {
              const j = X - n;
              G = j * j;
            }
          }
        }
        let E = Number.POSITIVE_INFINITY;
        if (R < x) {
          const _ = B[R].x;
          if (Number.isFinite(_)) {
            const X = i.scale(_);
            if (Number.isFinite(X)) {
              const j = X - n;
              E = j * j;
            }
          }
        }
        if (G > U && E > U) break;
        if (G <= E && G <= U && I >= 0) {
          const _ = B[I].y;
          if (Number.isFinite(_)) {
            const X = r.scale(_);
            if (Number.isFinite(X)) {
              const j = X - e, z = G + j * j, rt = b[I], lt = m ? (() => {
                const Y = gn(m, rt), nt = o + Y;
                return nt * nt;
              })() : l;
              z <= lt && (z < a || z === a && (f === null || N < u || N === u && I < p)) && (a = z, u = N, p = I, f = rt);
            }
          }
          I--;
        } else G <= E && I--;
        if (E <= G && E <= U && R < x) {
          const _ = B[R].y;
          if (Number.isFinite(_)) {
            const X = r.scale(_);
            if (Number.isFinite(X)) {
              const j = X - e, z = E + j * j, rt = b[R], lt = m ? (() => {
                const Y = gn(m, rt), nt = o + Y;
                return nt * nt;
              })() : l;
              z <= lt && (z < a || z === a && (f === null || N < u || N === u && R < p)) && (a = z, u = N, p = R, f = rt);
            }
          }
          R++;
        } else E < G && R++;
      }
    }
  }
  return f === null || !Number.isFinite(a) ? null : {
    seriesIndex: u,
    dataIndex: p,
    point: f,
    distance: Math.sqrt(a)
  };
}
const Di = /* @__PURE__ */ new WeakMap(), qr = (t, n) => {
  if (Di.has(t)) return Di.get(t);
  let e = !1;
  if (n) {
    const i = t;
    for (let r = 0; r < i.length; r++) {
      const s = i[r][0];
      if (Number.isNaN(s)) {
        e = !0;
        break;
      }
    }
  } else {
    const i = t;
    for (let r = 0; r < i.length; r++) {
      const s = i[r].x;
      if (Number.isNaN(s)) {
        e = !0;
        break;
      }
    }
  }
  return Di.set(t, e), e;
}, nc = (t, n) => {
  const e = [];
  for (let c = 0; c < t.length; c++) {
    const u = t[c];
    (u == null ? void 0 : u.type) === "bar" && e.push({ globalSeriesIndex: c, s: u });
  }
  if (e.length === 0) return null;
  const i = As(
    e.map((c) => c.s),
    n
  ), r = i.barWidthPx, s = i.gapPx, o = i.clusterWidthPx;
  if (!Number.isFinite(r) || !(r > 0)) return null;
  const l = /* @__PURE__ */ new Map();
  for (let c = 0; c < e.length; c++) {
    const u = e[c].globalSeriesIndex, p = i.clusterSlots.clusterIndexBySeries[c] ?? 0;
    l.set(u, p);
  }
  return {
    barWidth: r,
    gap: s,
    clusterWidth: o,
    clusterIndexByGlobalSeriesIndex: l
  };
}, jr = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r][0] < n ? e = r + 1 : i = r;
  }
  return e;
}, Zr = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r].x < n ? e = r + 1 : i = r;
  }
  return e;
};
function Kr(t, n, e, i) {
  if (!Number.isFinite(n)) return [];
  const r = Number.POSITIVE_INFINITY, s = r * r, o = e.invert(n);
  if (!Number.isFinite(o)) return [];
  const l = [], c = nc(t, e);
  for (let u = 0; u < t.length; u++) {
    const p = t[u];
    if (p.type === "pie" || p.type === "candlestick") continue;
    const f = p.data, a = f.length;
    if (a === 0) continue;
    const w = f[0], M = Array.isArray(w);
    if (p.type === "bar" && c) {
      const x = c.clusterIndexByGlobalSeriesIndex.get(u);
      if (x !== void 0) {
        const { barWidth: g, gap: m, clusterWidth: d } = c, v = -d / 2 + x * (g + m), y = 0;
        if (Number.isFinite(g) && g > 0 && Number.isFinite(v)) {
          let C = -1;
          const B = (T) => {
            if (!Number.isFinite(T)) return !1;
            const I = T + v, R = I + g;
            return n >= I - y && n < R + y;
          };
          if (qr(f, M))
            if (M) {
              const T = f;
              for (let I = 0; I < a; I++) {
                const R = T[I][0];
                if (!Number.isFinite(R)) continue;
                const U = e.scale(R);
                B(U) && (C = C < 0 ? I : Math.min(C, I));
              }
            } else {
              const T = f;
              for (let I = 0; I < a; I++) {
                const R = T[I].x;
                if (!Number.isFinite(R)) continue;
                const U = e.scale(R);
                B(U) && (C = C < 0 ? I : Math.min(C, I));
              }
            }
          else {
            const T = e.invert(n - v);
            if (Number.isFinite(T)) {
              const I = M ? jr(f, T) : Zr(f, T), R = (U) => {
                if (U < 0 || U >= a) return null;
                const G = M ? f[U][0] : f[U].x;
                if (!Number.isFinite(G)) return null;
                const E = e.scale(G);
                return Number.isFinite(E) ? E : null;
              };
              for (let U = I - 1; U >= 0; U--) {
                const G = R(U);
                if (G === null) continue;
                const E = G + v, _ = E + g;
                if (_ + y <= n) break;
                n >= E - y && n < _ + y && (C = C < 0 ? U : Math.min(C, U));
              }
              for (let U = I; U < a; U++) {
                const G = R(U);
                if (G === null) continue;
                const E = G + v;
                if (E - y > n) break;
                const _ = E + g;
                n < _ + y && (C = C < 0 ? U : Math.min(C, U));
              }
            }
          }
          if (C >= 0) {
            l.push({ seriesIndex: u, dataIndex: C, point: f[C] });
            continue;
          }
        }
      }
    }
    let P = -1, N = null, F = s;
    const b = (x, g) => {
      !Number.isFinite(g) || !(g < F || g === F && (P < 0 || x < P)) || (F = g, P = x, N = f[x]);
    };
    if (qr(f, M))
      if (M) {
        const x = f;
        for (let g = 0; g < a; g++) {
          const m = x[g][0];
          if (!Number.isFinite(m)) continue;
          const d = e.scale(m);
          if (!Number.isFinite(d)) continue;
          const v = d - n;
          b(g, v * v);
        }
      } else {
        const x = f;
        for (let g = 0; g < a; g++) {
          const m = x[g].x;
          if (!Number.isFinite(m)) continue;
          const d = e.scale(m);
          if (!Number.isFinite(d)) continue;
          const v = d - n;
          b(g, v * v);
        }
      }
    else if (M) {
      const x = f, g = jr(x, o);
      let m = g - 1, d = g;
      const v = (y) => {
        const C = x[y][0];
        if (!Number.isFinite(C)) return null;
        const B = e.scale(C);
        if (!Number.isFinite(B)) return null;
        const T = B - n;
        return T * T;
      };
      for (; m >= 0 || d < a; ) {
        for (; m >= 0 && v(m) === null; ) m--;
        for (; d < a && v(d) === null; ) d++;
        if (m < 0 && d >= a) break;
        const y = m >= 0 ? v(m) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY, C = d < a ? v(d) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
        if (y > F && C > F) break;
        y <= C ? (m >= 0 && y <= F && b(m, y), m--, d < a && C <= F && C === y && (b(d, C), d++)) : (d < a && C <= F && b(d, C), d++);
      }
    } else {
      const x = f, g = Zr(x, o);
      let m = g - 1, d = g;
      const v = (y) => {
        const C = x[y].x;
        if (!Number.isFinite(C)) return null;
        const B = e.scale(C);
        if (!Number.isFinite(B)) return null;
        const T = B - n;
        return T * T;
      };
      for (; m >= 0 || d < a; ) {
        for (; m >= 0 && v(m) === null; ) m--;
        for (; d < a && v(d) === null; ) d++;
        if (m < 0 && d >= a) break;
        const y = m >= 0 ? v(m) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY, C = d < a ? v(d) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
        if (y > F && C > F) break;
        y <= C ? (m >= 0 && y <= F && b(m, y), m--, d < a && C <= F && C === y && (b(d, C), d++)) : (d < a && C <= F && b(d, C), d++);
      }
    }
    N !== null && l.push({ seriesIndex: u, dataIndex: P, point: N });
  }
  return l;
}
const ic = (t) => Math.min(1, Math.max(0, t)), rc = (t) => {
  const n = t.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!n) return null;
  const e = Number(n[1]) / 100;
  return Number.isFinite(e) ? e : null;
}, qi = (t) => Array.isArray(t), Je = (t) => qi(t) ? t[0] : t.timestamp, sc = (t) => qi(t) ? t[1] : t.open, oc = (t) => qi(t) ? t[2] : t.close, Jr = /* @__PURE__ */ new WeakMap(), ac = (t) => {
  const n = Jr.get(t);
  if (n !== void 0) return n;
  const e = [];
  for (let s = 0; s < t.length; s++) {
    const o = Je(t[s]);
    Number.isFinite(o) && e.push(o);
  }
  if (e.length < 2) return 1;
  e.sort((s, o) => s - o);
  let i = Number.POSITIVE_INFINITY;
  for (let s = 1; s < e.length; s++) {
    const o = e[s] - e[s - 1];
    o > 0 && o < i && (i = o);
  }
  const r = Number.isFinite(i) && i > 0 ? i : 1;
  return Jr.set(t, r), r;
};
function lc(t, n, e, i) {
  if (n.length === 0) return 0;
  const r = ac(n);
  let s = 0;
  if (Number.isFinite(r) && r > 0) {
    let f = null;
    for (let a = 0; a < n.length; a++) {
      const w = Je(n[a]);
      if (Number.isFinite(w)) {
        f = w;
        break;
      }
    }
    if (f != null) {
      const a = e.scale(f), w = e.scale(f + r), M = Math.abs(w - a);
      Number.isFinite(M) && M > 0 && (s = M);
    }
  }
  (!(s > 0) || !Number.isFinite(s)) && (s = (Number.isFinite(i ?? Number.NaN) ? i : 0) / Math.max(1, n.length));
  let o = 0;
  const l = t.barWidth;
  if (typeof l == "number")
    o = Number.isFinite(l) ? Math.max(0, l) : 0;
  else if (typeof l == "string") {
    const f = rc(l);
    o = f == null ? 0 : s * ic(f);
  }
  const c = Number.isFinite(t.barMinWidth) ? Math.max(0, t.barMinWidth) : 0, u = Number.isFinite(t.barMaxWidth) ? Math.max(0, t.barMaxWidth) : Number.POSITIVE_INFINITY, p = Math.max(c, u);
  return o = Math.min(Math.max(o, c), p), Number.isFinite(o) ? o : 0;
}
const Wn = /* @__PURE__ */ new WeakMap(), cc = (t) => {
  const n = Wn.get(t);
  if (n !== void 0) return n;
  let e = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < t.length; i++) {
    const r = Je(t[i]);
    if (!Number.isFinite(r) || r < e)
      return Wn.set(t, !1), !1;
    e = r;
  }
  return Wn.set(t, !0), !0;
}, uc = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    Je(t[r]) < n ? e = r + 1 : i = r;
  }
  return e;
};
function fc(t, n, e, i, r, s) {
  if (!Number.isFinite(n) || !Number.isFinite(e) || !Number.isFinite(s) || !(s > 0)) return null;
  const o = i.invert(n);
  if (!Number.isFinite(o)) return null;
  const l = s / 2;
  let c = null, u = Number.POSITIVE_INFINITY;
  const p = (a, w, M, P) => {
    if (Number.isFinite(P)) {
      if (P < u) {
        u = P, c = { seriesIndex: a, dataIndex: w, point: M };
        return;
      }
      P === u && c && (w < c.dataIndex ? c = { seriesIndex: a, dataIndex: w, point: M } : w === c.dataIndex && a < c.seriesIndex && (c = { seriesIndex: a, dataIndex: w, point: M }));
    }
  }, f = (a) => {
    const w = sc(a), M = oc(a);
    if (!Number.isFinite(w) || !Number.isFinite(M)) return !1;
    const P = r.scale(w), N = r.scale(M);
    if (!Number.isFinite(P) || !Number.isFinite(N)) return !1;
    const F = Math.min(P, N), b = Math.max(P, N);
    return e >= F && e <= b;
  };
  for (let a = 0; a < t.length; a++) {
    const M = t[a].data, P = M.length;
    if (P === 0) continue;
    if (!cc(M)) {
      for (let b = 0; b < P; b++) {
        const x = M[b], g = Je(x);
        if (!Number.isFinite(g)) continue;
        const m = i.scale(g);
        if (!Number.isFinite(m)) continue;
        const d = Math.abs(n - m);
        d > l || f(x) && p(a, b, x, d);
      }
      continue;
    }
    const F = uc(M, o);
    for (let b = F - 1; b >= 0; b--) {
      const x = M[b], g = Je(x), m = i.scale(g);
      if (!Number.isFinite(m)) continue;
      if (m < n - l) break;
      const d = Math.abs(n - m);
      d > l || f(x) && p(a, b, x, d);
    }
    for (let b = F; b < P; b++) {
      const x = M[b], g = Je(x), m = i.scale(g);
      if (!Number.isFinite(m)) continue;
      if (m > n + l) break;
      const d = Math.abs(n - m);
      d > l || f(x) && p(a, b, x, d);
    }
  }
  return c;
}
const Ze = Math.PI * 2, Ei = (t) => {
  if (!Number.isFinite(t)) return 0;
  const n = t % Ze;
  return n < 0 ? n + Ze : n;
};
function mc(t, n, e, i, r) {
  var x;
  if (!Number.isFinite(t) || !Number.isFinite(n) || !Number.isFinite(i.x) || !Number.isFinite(i.y)) return null;
  const s = Number.isFinite(r.inner) ? Math.max(0, r.inner) : 0, o = Number.isFinite(r.outer) ? Math.max(0, r.outer) : 0;
  if (!(o > 0)) return null;
  const l = t - i.x, c = i.y - n, u = Math.hypot(l, c);
  if (!Number.isFinite(u) || u <= s || u > o) return null;
  const p = Ei(Math.atan2(c, l)), f = e.series, a = f.data;
  let w = 0, M = 0;
  for (let g = 0; g < a.length; g++) {
    const m = (x = a[g]) == null ? void 0 : x.value;
    typeof m == "number" && Number.isFinite(m) && m > 0 && (w += m, M++);
  }
  if (!(w > 0) || M === 0) return null;
  const P = typeof f.startAngle == "number" && Number.isFinite(f.startAngle) ? f.startAngle : 90;
  let N = Ei(P * Math.PI / 180), F = 0, b = 0;
  for (let g = 0; g < a.length; g++) {
    const m = a[g], d = m == null ? void 0 : m.value;
    if (typeof d != "number" || !Number.isFinite(d) || d <= 0) continue;
    b++;
    const v = b === M;
    let C = d / w * Ze;
    if (v ? C = Math.max(0, Ze - F) : C = Math.max(0, Math.min(Ze, C)), F += C, !(C > 0)) continue;
    const B = N, T = Ei(N + C);
    N = T;
    let I = T - B;
    I < 0 && (I += Ze);
    let R = p - B;
    if (R < 0 && (R += Ze), R <= I)
      return { seriesIndex: e.seriesIndex, dataIndex: g, slice: m };
  }
  return null;
}
const ln = (t, n) => {
  if (!Number.isFinite(n))
    throw new Error(`${t} must be a finite number. Received: ${String(n)}`);
};
function Vn() {
  let t = 0, n = 1, e = 0, i = 1;
  const r = {
    domain(s, o) {
      return ln("domain min", s), ln("domain max", o), t = s, n = o, r;
    },
    range(s, o) {
      return ln("range min", s), ln("range max", o), e = s, i = o, r;
    },
    scale(s) {
      if (!Number.isFinite(s)) return Number.NaN;
      if (t === n)
        return (e + i) / 2;
      const o = (s - t) / (n - t);
      return e + o * (i - e);
    },
    invert(s) {
      if (!Number.isFinite(s)) return Number.NaN;
      if (t === n)
        return t;
      if (e === i)
        return (t + n) / 2;
      const o = (s - e) / (i - e);
      return t + o * (n - t);
    }
  };
  return r;
}
function _u() {
  let t = [], n = /* @__PURE__ */ new Map(), e = 0, i = 1;
  const r = (o) => {
    const l = /* @__PURE__ */ new Map();
    for (let c = 0; c < o.length; c++) {
      const u = o[c];
      if (l.has(u))
        throw new Error(`Category domain must not contain duplicates. Duplicate: ${JSON.stringify(u)}`);
      l.set(u, c);
    }
    n = l;
  }, s = {
    domain(o) {
      return t = [...o], r(t), s;
    },
    range(o, l) {
      return ln("range min", o), ln("range max", l), e = o, i = l, s;
    },
    categoryIndex(o) {
      const l = n.get(o);
      return l === void 0 ? -1 : l;
    },
    bandwidth() {
      const o = t.length;
      return o === 0 ? 0 : Math.abs((i - e) / o);
    },
    scale(o) {
      const l = t.length;
      if (l === 0)
        return (e + i) / 2;
      const c = s.categoryIndex(o);
      if (c < 0) return Number.NaN;
      const u = (i - e) / l;
      return e + (c + 0.5) * u;
    }
  };
  return s;
}
const dc = (t) => {
  switch (t) {
    case "start":
      return { translateX: "0%", originX: "0%" };
    case "middle":
      return { translateX: "-50%", originX: "50%" };
    case "end":
      return { translateX: "-100%", originX: "100%" };
  }
};
function pc(t) {
  const n = getComputedStyle(t), e = n.position, i = n.overflow, r = e === "static", s = i === "hidden" || i === "scroll" || i === "auto", o = r ? t.style.position : null, l = s ? t.style.overflow : null;
  r && (t.style.position = "relative"), s && (t.style.overflow = "visible");
  const c = document.createElement("div");
  c.style.position = "absolute", c.style.inset = "0", c.style.pointerEvents = "none", c.style.overflow = "visible", c.style.zIndex = "10", t.appendChild(c);
  let u = !1;
  return { clear: () => {
    u || c.replaceChildren();
  }, addLabel: (w, M, P, N) => {
    if (u)
      return document.createElement("span");
    const F = document.createElement("span");
    F.textContent = w, F.style.position = "absolute", F.style.left = `${M}px`, F.style.top = `${P}px`, F.style.pointerEvents = "none", F.style.userSelect = "none", F.style.whiteSpace = "nowrap", F.style.lineHeight = "1", (N == null ? void 0 : N.fontSize) != null && (F.style.fontSize = `${N.fontSize}px`), (N == null ? void 0 : N.color) != null && (F.style.color = N.color);
    const b = (N == null ? void 0 : N.rotation) ?? 0, x = (N == null ? void 0 : N.anchor) ?? "start", { translateX: g, originX: m } = dc(x);
    return F.style.transformOrigin = `${m} 50%`, F.style.transform = `translateX(${g}) translateY(-50%) rotate(${b}deg)`, c.appendChild(F), F;
  }, dispose: () => {
    if (!u) {
      u = !0;
      try {
        c.remove();
      } finally {
        o !== null && (t.style.position = o), l !== null && (t.style.overflow = l);
      }
    }
  } };
}
function Rs(t) {
  return Math.max(
    t + 1,
    Math.round(t * 1.15)
  );
}
function cn(t, n, e) {
  t.dir = "auto", t.style.fontFamily = e.fontFamily, n.isTitle && (t.style.fontWeight = "600");
}
function Gu(t, n, e, i) {
  t.clear();
  const r = Rs(i.fontSize);
  for (const s of n) {
    const o = t.addLabel(s.text, s.x, s.y, {
      fontSize: s.isTitle ? r : i.fontSize,
      color: i.textColor,
      anchor: s.anchor ?? "middle",
      rotation: s.rotation
    });
    cn(o, s, i);
  }
  for (const s of e) {
    const o = t.addLabel(s.text, s.x, s.y, {
      fontSize: s.isTitle ? r : i.fontSize,
      color: i.textColor,
      anchor: s.anchor ?? "end",
      rotation: s.rotation
    });
    cn(o, s, i);
  }
}
const hc = (t, n) => {
  var i;
  const e = (i = t.name) == null ? void 0 : i.trim();
  return e || `Series ${n + 1}`;
}, bc = (t, n, e) => {
  var s;
  const i = (s = t.color) == null ? void 0 : s.trim();
  if (i) return i;
  const r = e.colorPalette;
  return r.length > 0 ? r[n % r.length] ?? "#000000" : "#000000";
}, gc = (t, n) => {
  const e = t == null ? void 0 : t.trim();
  return e || `Slice ${n + 1}`;
}, yc = (t, n, e, i) => {
  const r = t == null ? void 0 : t.trim();
  if (r) return r;
  const s = i.colorPalette, o = s.length;
  return o > 0 ? s[(n + e) % o] ?? "#000000" : "#000000";
};
function xc(t, n = "right") {
  const i = getComputedStyle(t).position === "static", r = i ? t.style.position : null;
  i && (t.style.position = "relative");
  const s = document.createElement("div");
  s.style.position = "absolute", s.style.pointerEvents = "none", s.style.userSelect = "none", s.style.boxSizing = "border-box", s.style.padding = "8px", s.style.borderRadius = "8px", s.style.borderStyle = "solid", s.style.borderWidth = "1px", s.style.maxHeight = "calc(100% - 16px)", s.style.overflow = "auto";
  const o = document.createElement("div");
  o.style.display = "flex", o.style.gap = "8px", s.appendChild(o), ((f) => {
    switch (s.style.top = "", s.style.right = "", s.style.bottom = "", s.style.left = "", s.style.maxWidth = "", o.style.flexDirection = "", o.style.flexWrap = "", o.style.alignItems = "", f) {
      case "right": {
        s.style.top = "8px", s.style.right = "8px", s.style.maxWidth = "40%", o.style.flexDirection = "column", o.style.flexWrap = "nowrap", o.style.alignItems = "flex-start";
        return;
      }
      case "left": {
        s.style.top = "8px", s.style.left = "8px", s.style.maxWidth = "40%", o.style.flexDirection = "column", o.style.flexWrap = "nowrap", o.style.alignItems = "flex-start";
        return;
      }
      case "top": {
        s.style.top = "8px", s.style.left = "8px", s.style.right = "8px", o.style.flexDirection = "row", o.style.flexWrap = "wrap", o.style.alignItems = "center";
        return;
      }
      case "bottom": {
        s.style.bottom = "8px", s.style.left = "8px", s.style.right = "8px", o.style.flexDirection = "row", o.style.flexWrap = "wrap", o.style.alignItems = "center";
        return;
      }
    }
  })(n), t.appendChild(s);
  let c = !1;
  return { update: (f, a) => {
    if (c) return;
    s.style.color = a.textColor, s.style.background = a.backgroundColor, s.style.borderColor = a.axisLineColor, s.style.fontFamily = a.fontFamily, s.style.fontSize = `${a.fontSize}px`;
    const w = [];
    for (let M = 0; M < f.length; M++) {
      const P = f[M];
      if (P.type === "pie")
        for (let N = 0; N < P.data.length; N++) {
          const F = P.data[N], b = document.createElement("div");
          b.style.display = "flex", b.style.alignItems = "center", b.style.gap = "6px", b.style.lineHeight = "1.1", b.style.whiteSpace = "nowrap";
          const x = document.createElement("div");
          x.style.width = "10px", x.style.height = "10px", x.style.borderRadius = "2px", x.style.flex = "0 0 auto", x.style.background = yc(F == null ? void 0 : F.color, M, N, a), x.style.border = `1px solid ${a.axisLineColor}`;
          const g = document.createElement("span");
          g.textContent = gc(F == null ? void 0 : F.name, N), b.appendChild(x), b.appendChild(g), w.push(b);
        }
      else {
        const N = document.createElement("div");
        N.style.display = "flex", N.style.alignItems = "center", N.style.gap = "6px", N.style.lineHeight = "1.1", N.style.whiteSpace = "nowrap";
        const F = document.createElement("div");
        F.style.width = "10px", F.style.height = "10px", F.style.borderRadius = "2px", F.style.flex = "0 0 auto", F.style.background = bc(P, M, a), F.style.border = `1px solid ${a.axisLineColor}`;
        const b = document.createElement("span");
        b.textContent = hc(P, M), N.appendChild(F), N.appendChild(b), w.push(N);
      }
    }
    o.replaceChildren(...w);
  }, dispose: () => {
    if (!c) {
      c = !0;
      try {
        s.remove();
      } finally {
        r !== null && (t.style.position = r);
      }
    }
  } };
}
const Qr = (t, n, e) => e < n || t < n ? n : t > e ? e : t;
function ts(t) {
  const e = getComputedStyle(t).position === "static", i = e ? t.style.position : null;
  e && (t.style.position = "relative");
  const r = document.createElement("div");
  r.style.position = "absolute", r.style.left = "0", r.style.top = "0", r.style.pointerEvents = "none", r.style.userSelect = "none", r.style.boxSizing = "border-box", r.style.zIndex = "var(--chartgpu-tooltip-z, 10)", r.style.padding = "var(--chartgpu-tooltip-padding, 6px 8px)", r.style.borderRadius = "var(--chartgpu-tooltip-radius, 8px)", r.style.borderStyle = "solid", r.style.borderWidth = "var(--chartgpu-tooltip-border-width, 1px)", r.style.borderColor = "var(--chartgpu-tooltip-border, rgba(224,224,224,0.35))", r.style.boxShadow = "var(--chartgpu-tooltip-shadow, 0 6px 18px rgba(0,0,0,0.35))", r.style.maxWidth = "var(--chartgpu-tooltip-max-width, min(320px, 100%))", r.style.overflow = "hidden", r.style.fontFamily = 'var(--chartgpu-tooltip-font-family, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji")', r.style.fontSize = "var(--chartgpu-tooltip-font-size, 12px)", r.style.lineHeight = "var(--chartgpu-tooltip-line-height, 1.2)", r.style.color = "var(--chartgpu-tooltip-color, #e0e0e0)", r.style.background = "var(--chartgpu-tooltip-bg, rgba(26,26,46,0.95))", r.style.whiteSpace = "normal", r.style.opacity = "0", r.style.transitionProperty = "opacity";
  const s = 140;
  r.style.transitionDuration = `${s}ms`, r.style.transitionTimingFunction = "ease", r.style.willChange = "opacity", r.style.display = "none", r.style.visibility = "hidden", r.setAttribute("role", "tooltip"), t.appendChild(r);
  let o = !1, l = 0, c = null, u = null;
  const p = () => {
    c != null && (window.clearTimeout(c), c = null), u != null && (window.cancelAnimationFrame(u), u = null);
  }, f = () => r.style.display === "none" || r.style.visibility === "hidden", a = () => {
    const N = r.style.visibility;
    r.style.visibility = "hidden";
    const F = r.offsetWidth, b = r.offsetHeight;
    return r.style.visibility = N, { width: F, height: b };
  };
  return { show: (N, F, b) => {
    if (o) return;
    l += 1, p();
    const x = f();
    r.innerHTML = b;
    const g = 12, m = 12, d = 8;
    r.style.display = "block", r.style.visibility = "hidden";
    const { width: v, height: y } = a(), C = t.clientWidth, B = t.clientHeight;
    let T = N + g, I = F + m;
    if (T + v > C - d && (T = N - g - v), I + y > B - d && (I = F - m - y), T = Qr(T, d, C - d - v), I = Qr(I, d, B - d - y), r.style.left = `${T}px`, r.style.top = `${I}px`, r.style.visibility = "visible", x) {
      r.style.opacity = "0";
      const R = l;
      u = window.requestAnimationFrame(() => {
        u = null, !o && R === l && (r.style.opacity = "1");
      });
    } else
      r.style.opacity = "1";
  }, hide: () => {
    if (o) return;
    if (l += 1, p(), r.style.display === "none" || r.style.visibility === "hidden") {
      r.style.opacity = "0", r.style.visibility = "hidden", r.style.display = "none";
      return;
    }
    r.style.opacity = "0";
    const N = l;
    c = window.setTimeout(() => {
      c = null, !o && N === l && (r.style.visibility = "hidden", r.style.display = "none");
    }, s + 50);
  }, dispose: () => {
    if (!o) {
      o = !0;
      try {
        p(), r.remove();
      } finally {
        i !== null && (t.style.position = i);
      }
    }
  } };
}
const Kn = "—";
function Me(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function Ke(t) {
  if (!Number.isFinite(t)) return Kn;
  const i = (Object.is(t, -0) ? 0 : t).toFixed(2).replace(/\.?0+$/, "");
  return i === "-0" ? "0" : i;
}
function Ds(t) {
  const n = t.seriesName.trim();
  return n.length > 0 ? n : `Series ${t.seriesIndex + 1}`;
}
function Es(t) {
  const n = t.trim();
  return n.length === 0 ? "#888" : /^#[0-9a-fA-F]{3}$/.test(n) || /^#[0-9a-fA-F]{6}$/.test(n) || /^#[0-9a-fA-F]{8}$/.test(n) || /^rgba?\(\s*\d{1,3}\s*(?:,\s*|\s+)\d{1,3}\s*(?:,\s*|\s+)\d{1,3}(?:\s*(?:,\s*|\/\s*)(?:0|1|0?\.\d+))?\s*\)$/.test(
    n
  ) || /^[a-zA-Z]+$/.test(n) ? n : "#888";
}
function Us(t) {
  return t.length === 5;
}
function wc(t, n) {
  if (!Number.isFinite(t) || !Number.isFinite(n) || t === 0) return Kn;
  const e = (n - t) / t * 100;
  return Number.isFinite(e) ? `${e > 0 ? "+" : ""}${e.toFixed(2)}%` : Kn;
}
function Ls(t, n) {
  const e = Me(Ds(t)), i = Me(n);
  return [
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">',
    '<span style="display:flex;align-items:center;gap:8px;min-width:0;">',
    `<span style="width:8px;height:8px;border-radius:999px;flex:0 0 auto;background-color:${Me(Es(t.color))};"></span>`,
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e}</span>`,
    "</span>",
    `<span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${i}</span>`,
    "</div>"
  ].join("");
}
function _s(t) {
  const [, n, e, i, r] = t.value, s = Me(Ds(t)), o = Me(Es(t.color)), l = Ke(n), c = Ke(r), u = Ke(i), p = Ke(e), f = e > n, a = f ? "▲" : "▼", w = f ? "#22c55e" : "#ef4444", M = wc(n, e), P = `O: ${l} H: ${c} L: ${u} C: ${p}`, N = Me(P), F = Me(a), b = Me(M), x = Me(w);
  return [
    '<div style="display:flex;flex-direction:column;gap:4px;">',
    // Series name row
    '<div style="display:flex;align-items:center;gap:8px;">',
    `<span style="width:8px;height:8px;border-radius:999px;flex:0 0 auto;background-color:${o};"></span>`,
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">${s}</span>`,
    "</div>",
    // OHLC values row
    `<div style="font-variant-numeric:tabular-nums;white-space:nowrap;font-size:0.9em;">${N}</div>`,
    // Change row with arrow
    '<div style="display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;">',
    `<span style="color:${x};font-weight:700;">${F}</span>`,
    `<span style="color:${x};font-weight:600;">${b}</span>`,
    "</div>",
    "</div>"
  ].join("");
}
function Fc(t) {
  return _s(t);
}
function bn(t) {
  return Us(t.value) ? Fc(t) : Ls(t, Ke(t.value[1]));
}
function Ui(t) {
  if (t.length === 0) return "";
  const n = `x: ${Ke(t[0].value[0])}`, e = `<div style="margin:0 0 6px 0;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;">${Me(
    n
  )}</div>`, i = t.map((r) => Us(r.value) ? _s(r) : Ls(r, Ke(r.value[1]))).join('<div style="height:4px;"></div>');
  return `${e}${i}`;
}
const vc = (t) => Number.isFinite(t) ? t : 0, Nc = (t) => Number.isFinite(t) ? t : null;
function es() {
  const t = /* @__PURE__ */ new Map();
  function n(s, o, l, c, u, p) {
    const f = Symbol("Animation");
    if (Array.isArray(s) || Array.isArray(o)) {
      if (!Array.isArray(s) || !Array.isArray(o))
        throw new Error('Array animation requires both "from" and "to" to be arrays');
      if (s.length !== o.length)
        throw new Error(
          `Array animation length mismatch: from.length=${s.length}, to.length=${o.length}`
        );
      const a = new Array(s.length);
      return t.set(f, {
        kind: "array",
        from: s,
        to: o,
        duration: l,
        easing: c,
        onUpdate: u,
        onComplete: p,
        startTime: null,
        out: a
      }), f;
    }
    return t.set(f, {
      kind: "scalar",
      from: s,
      to: o,
      duration: l,
      easing: c,
      onUpdate: u,
      onComplete: p,
      startTime: null
    }), f;
  }
  function e(s) {
    t.delete(s);
  }
  function i() {
    t.clear();
  }
  function r(s) {
    var c;
    const o = Nc(s);
    if (o === null) return;
    const l = Array.from(t.keys());
    for (const u of l) {
      const p = t.get(u);
      if (!p) continue;
      const f = p.startTime ?? o;
      p.startTime === null && t.set(u, { ...p, startTime: f });
      const a = vc(p.duration), w = Math.max(0, o - f), M = a <= 0 || w >= a, P = a <= 0 ? 1 : w / a, N = M ? 1 : p.easing(P);
      if (p.kind === "scalar") {
        const F = p.from + (p.to - p.from) * N;
        if (p.onUpdate(F), !t.has(u)) continue;
      } else {
        const F = p.out.length;
        for (let b = 0; b < F; b++) {
          const x = p.from[b] ?? 0, g = p.to[b] ?? 0;
          p.out[b] = x + (g - x) * N;
        }
        if (p.onUpdate(p.out), !t.has(u)) continue;
      }
      M && ((c = p.onComplete) == null || c.call(p), t.delete(u));
    }
  }
  return {
    animate: n,
    cancel: e,
    cancelAll: i,
    update: r
  };
}
const ai = (t) => Number.isNaN(t) || t <= 0 ? 0 : t >= 1 ? 1 : t;
function ns(t) {
  return ai(t);
}
function Mc(t) {
  const e = 1 - ai(t);
  return 1 - e * e * e;
}
function Sc(t) {
  const n = ai(t);
  if (n < 0.5) return 4 * n * n * n;
  const e = -2 * n + 2;
  return 1 - e * e * e / 2;
}
function Cc(t) {
  const n = ai(t), e = 7.5625, i = 2.75;
  if (n < 1 / i)
    return e * n * n;
  if (n < 2 / i) {
    const s = n - 1.5 / i;
    return e * s * s + 0.75;
  }
  if (n < 2.5 / i) {
    const s = n - 2.25 / i;
    return e * s * s + 0.9375;
  }
  const r = n - 2.625 / i;
  return e * r * r + 0.984375;
}
function Ic(t) {
  switch (t) {
    case "linear":
      return ns;
    case "cubicOut":
      return Mc;
    case "cubicInOut":
      return Sc;
    case "bounceOut":
      return Cc;
    default:
      return ns;
  }
}
const Zt = gs;
function is(t, n = 1) {
  return t ? Zt(t) ? t.clientWidth : t.width / n : 0;
}
function Tc(t, n = 1) {
  return t ? Zt(t) ? t.clientHeight : t.height / n : 0;
}
const Pc = "bgra8unorm", vn = 5, rs = 6, Li = 4, Bc = 1, Ac = 4, ri = 24 * 60 * 60 * 1e3, Rc = 30 * ri, Dc = 365 * ri, Ec = 9, _i = 1, Uc = 6, si = (t) => typeof t == "number" && Number.isFinite(t) ? t : null, Se = (t) => typeof t == "number" && Number.isFinite(t) ? t : void 0, Lc = 2e4, Gi = (t) => {
  throw new Error(`RenderCoordinator: unreachable value: ${String(t)}`);
}, Jn = (t) => Array.isArray(t), Ce = (t) => Jn(t) ? { x: t[0], y: t[1] } : { x: t.x, y: t.y }, Xi = (t) => {
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < t.length; s++) {
    const { x: o, y: l } = Ce(t[s]);
    !Number.isFinite(o) || !Number.isFinite(l) || (o < n && (n = o), o > e && (e = o), l < i && (i = l), l > r && (r = l));
  }
  return !Number.isFinite(n) || !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r) ? null : (n === e && (e = n + 1), i === r && (r = i + 1), { xMin: n, xMax: e, yMin: i, yMax: r });
}, _c = (t, n) => {
  if (n.length === 0) return t;
  let e = t;
  if (!e) {
    const l = Xi(n);
    if (!l) return t;
    e = l;
  }
  let i = e.xMin, r = e.xMax, s = e.yMin, o = e.yMax;
  for (let l = 0; l < n.length; l++) {
    const { x: c, y: u } = Ce(n[l]);
    !Number.isFinite(c) || !Number.isFinite(u) || (c < i && (i = c), c > r && (r = c), u < s && (s = u), u > o && (o = u));
  }
  return i === r && (r = i + 1), s === o && (o = s + 1), { xMin: i, xMax: r, yMin: s, yMax: o };
}, Gc = (t, n) => {
  if (n.length === 0) return t;
  let e = (t == null ? void 0 : t.xMin) ?? Number.POSITIVE_INFINITY, i = (t == null ? void 0 : t.xMax) ?? Number.NEGATIVE_INFINITY, r = (t == null ? void 0 : t.yMin) ?? Number.POSITIVE_INFINITY, s = (t == null ? void 0 : t.yMax) ?? Number.NEGATIVE_INFINITY;
  for (let o = 0; o < n.length; o++) {
    const l = n[o], c = he(l) ? l[0] : l.timestamp, u = he(l) ? l[3] : l.low, p = he(l) ? l[4] : l.high;
    !Number.isFinite(c) || !Number.isFinite(u) || !Number.isFinite(p) || (c < e && (e = c), c > i && (i = c), u < r && (r = u), p > s && (s = p));
  }
  return !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r) || !Number.isFinite(s) ? t : (e === i && (i = e + 1), r === s && (s = r + 1), { xMin: e, xMax: i, yMin: r, yMax: s });
}, Gs = (t, n) => {
  let e = Number.POSITIVE_INFINITY, i = Number.NEGATIVE_INFINITY, r = Number.POSITIVE_INFINITY, s = Number.NEGATIVE_INFINITY;
  for (let o = 0; o < t.length; o++) {
    const l = t[o];
    if (l.type === "pie") continue;
    const c = (n == null ? void 0 : n[o]) ?? null;
    if (c) {
      const f = c;
      if (Number.isFinite(f.xMin) && Number.isFinite(f.xMax) && Number.isFinite(f.yMin) && Number.isFinite(f.yMax)) {
        f.xMin < e && (e = f.xMin), f.xMax > i && (i = f.xMax), f.yMin < r && (r = f.yMin), f.yMax > s && (s = f.yMax);
        continue;
      }
    }
    const u = l.rawBounds;
    if (u) {
      const f = u;
      if (Number.isFinite(f.xMin) && Number.isFinite(f.xMax) && Number.isFinite(f.yMin) && Number.isFinite(f.yMax)) {
        f.xMin < e && (e = f.xMin), f.xMax > i && (i = f.xMax), f.yMin < r && (r = f.yMin), f.yMax > s && (s = f.yMax);
        continue;
      }
    }
    if (l.type === "candlestick") {
      const f = l.rawData ?? l.data;
      for (let a = 0; a < f.length; a++) {
        const w = f[a];
        if (he(w)) {
          const M = w[0], P = w[3], N = w[4];
          if (!Number.isFinite(M) || !Number.isFinite(P) || !Number.isFinite(N)) continue;
          const F = Math.min(P, N), b = Math.max(P, N);
          M < e && (e = M), M > i && (i = M), F < r && (r = F), b > s && (s = b);
        } else {
          const M = w.timestamp, P = w.low, N = w.high;
          if (!Number.isFinite(M) || !Number.isFinite(P) || !Number.isFinite(N)) continue;
          const F = Math.min(P, N), b = Math.max(P, N);
          M < e && (e = M), M > i && (i = M), F < r && (r = F), b > s && (s = b);
        }
      }
      continue;
    }
    const p = l.data;
    for (let f = 0; f < p.length; f++) {
      const { x: a, y: w } = Ce(p[f]);
      !Number.isFinite(a) || !Number.isFinite(w) || (a < e && (e = a), a > i && (i = a), w < r && (r = w), w > s && (s = w));
    }
  }
  return !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r) || !Number.isFinite(s) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (e === i && (i = e + 1), r === s && (s = r + 1), { xMin: e, xMax: i, yMin: r, yMax: s });
}, li = (t, n) => {
  let e = t, i = n;
  if ((!Number.isFinite(e) || !Number.isFinite(i)) && (e = 0, i = 1), e === i)
    i = e + 1;
  else if (e > i) {
    const r = e;
    e = i, i = r;
  }
  return { min: e, max: i };
}, ss = (t, n) => {
  const e = t.canvas;
  if (!e) throw new Error("RenderCoordinator: gpuContext.canvas is required.");
  const i = t.devicePixelRatio ?? 1, r = Number.isFinite(i) && i > 0 ? i : 1, s = e.width, o = e.height;
  if (!Number.isFinite(s) || !Number.isFinite(o))
    throw new Error(
      `RenderCoordinator: Invalid canvas dimensions: width=${s}, height=${o}. Canvas must be initialized with finite dimensions before rendering.`
    );
  const l = Math.max(1, Math.floor(s)), c = Math.max(1, Math.floor(o)), u = Number.isFinite(n.grid.left) ? n.grid.left : 0, p = Number.isFinite(n.grid.right) ? n.grid.right : 0, f = Number.isFinite(n.grid.top) ? n.grid.top : 0, a = Number.isFinite(n.grid.bottom) ? n.grid.bottom : 0, w = Math.max(0, u), M = Math.max(0, p), P = Math.max(0, f), N = Math.max(0, a);
  return {
    left: w,
    right: M,
    top: P,
    bottom: N,
    canvasWidth: l,
    // Device pixels (clamped above)
    canvasHeight: c,
    // Device pixels (clamped above)
    devicePixelRatio: r
    // Explicit DPR for worker compatibility (validated above)
  };
}, Oc = (t) => {
  const n = Math.max(0, Math.min(255, Math.round(t[0] * 255))), e = Math.max(0, Math.min(255, Math.round(t[1] * 255))), i = Math.max(0, Math.min(255, Math.round(t[2] * 255))), r = Math.max(0, Math.min(1, t[3]));
  return `rgba(${n},${e},${i},${r})`;
}, os = (t, n) => {
  const e = Qt(t);
  if (!e) return t;
  const i = Math.max(0, Math.min(1, e[3] * n));
  return Oc([e[0], e[1], e[2], i]);
}, Wc = (t, n) => {
  if (t.length === 0) return 0;
  const e = t.reduce((i, r) => Math.max(i, r.text.length), 0);
  return Math.ceil(e * n * 0.6);
}, Vc = (t) => {
  const { left: n, right: e, top: i, bottom: r, canvasWidth: s, canvasHeight: o, devicePixelRatio: l } = t, c = n * l, u = s - e * l, p = i * l, f = o - r * l, a = c / s * 2 - 1, w = u / s * 2 - 1, M = 1 - p / o * 2, P = 1 - f / o * 2;
  return {
    left: a,
    right: w,
    top: M,
    bottom: P
  };
}, Ne = (t) => Math.min(1, Math.max(0, t)), Ie = (t, n, e) => Math.min(e, Math.max(n, t | 0)), oi = (t, n, e) => t + (n - t) * Ne(e), $n = (t, n, e) => li(oi(t.min, n.min, e), oi(t.max, n.max, e)), as = (t) => {
  const { canvasWidth: n, canvasHeight: e, devicePixelRatio: i } = t, r = t.left * i, s = n - t.right * i, o = t.top * i, l = e - t.bottom * i, c = Ie(Math.floor(r), 0, Math.max(0, n)), u = Ie(Math.floor(o), 0, Math.max(0, e)), p = Ie(Math.ceil(s), 0, Math.max(0, n)), f = Ie(Math.ceil(l), 0, Math.max(0, e)), a = Math.max(0, p - c), w = Math.max(0, f - u);
  return { x: c, y: u, w: a, h: w };
}, Qn = (t, n) => (t + 1) / 2 * n, Oi = (t, n) => (1 - t) / 2 * n, $c = (t) => Array.isArray(t), Os = (t) => t.length > 0 && $c(t[0]), Ye = /* @__PURE__ */ new WeakMap(), Ws = (t, n) => {
  const e = Ye.get(t);
  if (e !== void 0) return e;
  let i = Number.NEGATIVE_INFINITY;
  if (n) {
    const s = t;
    for (let o = 0; o < s.length; o++) {
      const l = s[o][0];
      if (!Number.isFinite(l) || l < i)
        return Ye.set(t, !1), !1;
      i = l;
    }
    return Ye.set(t, !0), !0;
  }
  const r = t;
  for (let s = 0; s < r.length; s++) {
    const o = r[s].x;
    if (!Number.isFinite(o) || o < i)
      return Ye.set(t, !1), !1;
    i = o;
  }
  return Ye.set(t, !0), !0;
}, Vs = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r][0] < n ? e = r + 1 : i = r;
  }
  return e;
}, $s = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r][0] <= n ? e = r + 1 : i = r;
  }
  return e;
}, zs = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r].x < n ? e = r + 1 : i = r;
  }
  return e;
}, ks = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r].x <= n ? e = r + 1 : i = r;
  }
  return e;
}, zn = (t, n, e) => {
  const i = t.length;
  if (i === 0 || !Number.isFinite(n) || !Number.isFinite(e)) return t;
  const r = Os(t);
  if (Ws(t, r)) {
    const l = r ? Vs(t, n) : zs(t, n), c = r ? $s(t, e) : ks(t, e);
    return l <= 0 && c >= i ? t : c <= l ? [] : t.slice(l, c);
  }
  const o = [];
  for (let l = 0; l < i; l++) {
    const c = t[l], { x: u } = Ce(c);
    Number.isFinite(u) && u >= n && u <= e && o.push(c);
  }
  return o;
}, zc = (t, n, e) => {
  const i = t.length;
  if (i === 0) return { start: 0, end: 0 };
  if (!Number.isFinite(n) || !Number.isFinite(e)) return { start: 0, end: i };
  const r = Os(t);
  if (!Ws(t, r))
    return { start: 0, end: i };
  const o = r ? Vs(t, n) : zs(t, n), l = r ? $s(t, e) : ks(t, e), c = Ie(o, 0, i), u = Ie(l, 0, i);
  return u <= c ? { start: c, end: c } : { start: c, end: u };
};
function he(t) {
  return Array.isArray(t);
}
const kn = /* @__PURE__ */ new WeakMap(), kc = (t) => {
  const n = kn.get(t);
  if (n !== void 0) return n;
  let e = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < t.length; i++) {
    const r = t[i], s = he(r) ? r[0] : r.timestamp;
    if (!Number.isFinite(s) || s < e)
      return kn.set(t, !1), !1;
    e = s;
  }
  return kn.set(t, !0), !0;
}, Xc = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r][0] < n ? e = r + 1 : i = r;
  }
  return e;
}, Hc = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r][0] <= n ? e = r + 1 : i = r;
  }
  return e;
}, Yc = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r].timestamp < n ? e = r + 1 : i = r;
  }
  return e;
}, qc = (t, n) => {
  let e = 0, i = t.length;
  for (; e < i; ) {
    const r = e + i >>> 1;
    t[r].timestamp <= n ? e = r + 1 : i = r;
  }
  return e;
}, Xn = (t, n, e) => {
  const i = t.length;
  if (i === 0 || !Number.isFinite(n) || !Number.isFinite(e)) return t;
  const r = kc(t), s = i > 0 && he(t[0]);
  if (r) {
    const l = s ? Xc(t, n) : Yc(t, n), c = s ? Hc(t, e) : qc(t, e);
    return l <= 0 && c >= i ? t : c <= l ? [] : t.slice(l, c);
  }
  const o = [];
  for (let l = 0; l < i; l++) {
    const c = t[l], u = he(c) ? c[0] : c.timestamp;
    Number.isFinite(u) && u >= n && u <= e && o.push(c);
  }
  return o;
}, Nn = (t, n) => {
  if (typeof t == "number") return Number.isFinite(t) ? t : null;
  if (typeof t != "string") return null;
  const e = t.trim();
  if (e.length === 0) return null;
  if (e.endsWith("%")) {
    const r = Number.parseFloat(e.slice(0, -1));
    return Number.isFinite(r) ? r / 100 * n : null;
  }
  const i = Number.parseFloat(e);
  return Number.isFinite(i) ? i : null;
}, jc = (t, n, e) => {
  const i = (t == null ? void 0 : t[0]) ?? "50%", r = (t == null ? void 0 : t[1]) ?? "50%", s = Nn(i, n), o = Nn(r, e);
  return {
    x: Number.isFinite(s) ? s : n * 0.5,
    y: Number.isFinite(o) ? o : e * 0.5
  };
}, Zc = (t) => Array.isArray(t), ls = (t, n) => {
  if (t == null) return { inner: 0, outer: n * 0.7 };
  if (Zc(t)) {
    const r = Nn(t[0], n), s = Nn(t[1], n), o = Math.max(0, Number.isFinite(r) ? r : 0), l = Math.max(o, Number.isFinite(s) ? s : n * 0.7);
    return { inner: o, outer: Math.min(n, l) };
  }
  const e = Nn(t, n), i = Math.max(0, Number.isFinite(e) ? e : n * 0.7);
  return { inner: 0, outer: Math.min(n, i) };
}, Kc = 6, Jc = (t, n = Kc) => {
  const e = Math.abs(t);
  if (!Number.isFinite(e) || e === 0) return 0;
  for (let i = 0; i <= n; i++) {
    const r = e * 10 ** i, s = Math.round(r), o = Math.abs(r - s), l = 1e-9 * Math.max(1, Math.abs(r));
    if (o <= l) return i;
  }
  return Math.max(0, Math.min(n, Math.ceil(-Math.log10(e)) + 1));
}, cs = (t) => {
  const n = Jc(t);
  return new Intl.NumberFormat(void 0, { maximumFractionDigits: n });
}, us = (t, n) => {
  if (!Number.isFinite(n)) return null;
  const e = Math.abs(n) < 1e-12 ? 0 : n, i = t.format(e);
  return i === "NaN" ? null : i;
}, me = (t) => String(Math.trunc(t)).padStart(2, "0"), Qc = [
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
], Xs = (t, n) => {
  if (!Number.isFinite(t)) return null;
  (!Number.isFinite(n) || n < 0) && (n = 0);
  const e = new Date(t);
  if (!Number.isFinite(e.getTime())) return null;
  const i = e.getFullYear(), r = e.getMonth() + 1, s = e.getDate(), o = e.getHours(), l = e.getMinutes();
  return n < ri ? `${me(o)}:${me(l)}` : n <= 7 * ri ? `${me(r)}/${me(s)} ${me(o)}:${me(l)}` : n < 3 * Rc ? `${me(r)}/${me(s)}` : n <= Dc ? `${Qc[e.getMonth()] ?? me(r)} ${me(s)}` : `${i}/${me(r)}`;
}, ti = (t, n, e) => {
  const i = Math.max(1, Math.floor(e)), r = new Array(i);
  for (let s = 0; s < i; s++) {
    const o = i === 1 ? 0.5 : s / (i - 1);
    r[s] = t + o * (n - t);
  }
  return r;
}, tu = (t) => {
  const {
    axisMin: n,
    axisMax: e,
    xScale: i,
    plotClipLeft: r,
    plotClipRight: s,
    canvasCssWidth: o,
    visibleRangeMs: l,
    measureCtx: c,
    measureCache: u,
    fontSize: p,
    fontFamily: f
  } = t, a = si(n) ?? i.invert(r), w = si(e) ?? i.invert(s);
  if (!c || o <= 0)
    return { tickCount: vn, tickValues: ti(a, w, vn) };
  c.font = `${p}px ${f}`, u && u.size > 2e3 && u.clear();
  const M = u ? `${p}px ${f}@@` : null;
  for (let P = Ec; P >= _i; P--) {
    const N = ti(a, w, P);
    let F = Number.NEGATIVE_INFINITY, b = !0;
    for (let x = 0; x < N.length; x++) {
      const g = N[x], m = Xs(g, l);
      if (m == null) continue;
      const d = (() => {
        if (!M) return c.measureText(m).width;
        const I = M + m, R = u.get(I);
        if (R != null) return R;
        const U = c.measureText(m).width;
        return u.set(I, U), U;
      })(), v = i.scale(g), y = Qn(v, o), C = P === 1 ? "middle" : x === 0 ? "start" : x === N.length - 1 ? "end" : "middle", B = C === "start" ? y : C === "end" ? y - d : y - d * 0.5, T = C === "start" ? y + d : C === "end" ? y : y + d * 0.5;
      if (B < F + Uc) {
        b = !1;
        break;
      }
      F = T;
    }
    if (b)
      return { tickCount: P, tickValues: N };
  }
  return { tickCount: _i, tickValues: ti(a, w, _i) };
}, qe = (t, n) => {
  const e = Gs(t.series, n), i = Se(t.xAxis.min) ?? e.xMin, r = Se(t.xAxis.max) ?? e.xMax;
  return li(i, r);
}, Wi = (t, n) => {
  const e = Gs(t.series, n), i = Se(t.yAxis.min) ?? e.yMin, r = Se(t.yAxis.max) ?? e.yMax;
  return li(i, r);
}, je = (t, n) => {
  if (!n) return { ...t, spanFraction: 1 };
  const e = t.max - t.min;
  if (!Number.isFinite(e) || e === 0) return { ...t, spanFraction: 1 };
  const i = n.start, r = n.end, s = t.min + i / 100 * e, o = t.min + r / 100 * e, l = li(s, o), c = (r - i) / 100, u = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 1;
  return { min: l.min, max: l.max, spanFraction: u };
}, Hs = (t) => {
  if (t === !1 || t == null) return null;
  const n = t === !0 ? {} : t;
  if (!n) return null;
  const e = n.duration ?? 300, i = n.delay ?? 0, r = Number.isFinite(e) ? Math.max(0, e) : 300, s = Number.isFinite(i) ? Math.max(0, i) : 0;
  return {
    durationMs: r,
    delayMs: s,
    easing: Ic(n.easing)
  };
}, eu = (t) => Hs(t), nu = (t) => Hs(t), Vi = (t, n, e, i, r) => {
  const s = t.point, o = he(s) ? s[0] : s.timestamp, l = he(s) ? s[1] : s.open, c = he(s) ? s[2] : s.close;
  if (!Number.isFinite(o) || !Number.isFinite(l) || !Number.isFinite(c))
    return null;
  const u = (l + c) / 2, p = n.scale(o), f = e.scale(u);
  if (!Number.isFinite(p) || !Number.isFinite(f))
    return null;
  const a = i.left + p, w = i.top + f, M = Zt(r) ? r.offsetLeft + a : a, P = Zt(r) ? r.offsetTop + w : w;
  return !Number.isFinite(M) || !Number.isFinite(P) ? null : { x: M, y: P };
}, fs = (t) => {
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < t.length; i++) {
    const r = t[i].data;
    for (let s = 0; s < r.length; s++) {
      const { y: o } = Ce(r[s]);
      Number.isFinite(o) && (o < n && (n = o), o > e && (e = o));
    }
  }
  return !Number.isFinite(n) || !Number.isFinite(e) || n <= 0 && 0 <= e ? 0 : Math.abs(n) < Math.abs(e) ? n : e;
}, iu = (t, n, e) => {
  const i = n.invert(e.bottom), r = n.invert(e.top), s = Math.min(i, r), o = Math.max(i, r);
  return !Number.isFinite(s) || !Number.isFinite(o) ? fs(t) : s <= 0 && 0 <= o ? 0 : s > 0 ? s : o < 0 ? o : fs(t);
}, ru = (t, n, e, i) => {
  const r = Ne(i);
  if (r >= 1) return t;
  const s = iu(e, t, n), o = t.scale(s), l = {
    domain(c, u) {
      return t.domain(c, u), l;
    },
    range(c, u) {
      return t.range(c, u), l;
    },
    scale(c) {
      const u = t.scale(c);
      return !Number.isFinite(u) || !Number.isFinite(o) ? u : o + (u - o) * r;
    },
    invert(c) {
      return t.invert(c);
    }
  };
  return l;
};
function Ou(t, n, e) {
  var sr;
  if (!t.initialized)
    throw new Error("RenderCoordinator: gpuContext must be initialized.");
  const i = t.device;
  if (!i)
    throw new Error("RenderCoordinator: gpuContext.device is required.");
  if (!t.canvas)
    throw new Error("RenderCoordinator: gpuContext.canvas is required.");
  if (!t.canvasContext)
    throw new Error("RenderCoordinator: gpuContext.canvasContext is required.");
  i.lost.then((h) => {
    var A;
    (A = e == null ? void 0 : e.onDeviceLost) == null || A.call(e, h.message || h.reason || "unknown");
  }).catch(() => {
  });
  const r = t.preferredFormat ?? Pc, s = (e == null ? void 0 : e.domOverlays) !== !1, o = s && Zt(t.canvas) ? t.canvas.parentElement : null, l = o ? pc(o) : null, c = o ? xc(o, "right") : null, u = (() => {
    if (typeof document > "u")
      return null;
    try {
      return document.createElement("canvas").getContext("2d");
    } catch {
      return null;
    }
  })(), p = u ? /* @__PURE__ */ new Map() : null;
  let f = !1, a = n, w = n.series.length, M = "pending", P = 0;
  const N = es();
  let F = null, b = !1;
  const x = es();
  let g = null, m = 1, d = null;
  const v = {
    cartesianDataBySeriesIndex: [],
    pieDataBySeriesIndex: []
  }, y = () => {
    v.cartesianDataBySeriesIndex.length = 0, v.pieDataBySeriesIndex.length = 0;
  }, C = (h, A, S, D) => {
    if (h.length !== A.length) return null;
    const O = A.length;
    if (O === 0) return D ?? [];
    const V = D && D.length === O ? D : (() => {
      const q = new Array(O);
      for (let $ = 0; $ < O; $++) {
        const H = A[$], { x: J } = Ce(H), Z = Jn(H) ? H[2] : H == null ? void 0 : H.size;
        q[$] = Jn(H) ? Z == null ? [J, 0] : [J, 0, Z] : Z == null ? { x: J, y: 0 } : { x: J, y: 0, size: Z };
      }
      return q;
    })(), W = Ne(S);
    for (let q = 0; q < O; q++) {
      const $ = Ce(h[q]).y, H = Ce(A[q]).y, J = Number.isFinite($) && Number.isFinite(H) ? oi($, H, W) : H, Z = V[q];
      Jn(Z) ? Z[1] = J : Z.y = J;
    }
    return V;
  }, B = (h, A, S, D) => {
    var H, J;
    const O = h.data, V = A.data;
    if (O.length !== V.length) return A;
    const W = V.length, q = D && D.length === W ? D : (() => {
      const Z = new Array(W);
      for (let ht = 0; ht < W; ht++)
        Z[ht] = { ...V[ht], value: 0 };
      return Z;
    })(), $ = Ne(S);
    for (let Z = 0; Z < W; Z++) {
      const ht = (H = O[Z]) == null ? void 0 : H.value, mt = (J = V[Z]) == null ? void 0 : J.value, Rt = typeof ht == "number" && typeof mt == "number" && Number.isFinite(ht) && Number.isFinite(mt) ? Math.max(0, oi(ht, mt, $)) : typeof mt == "number" && Number.isFinite(mt) ? mt : 0;
      q[Z].value = Rt;
    }
    return { ...A, data: q };
  }, T = (h, A, S, D) => {
    if (h.length !== A.length) return A;
    const O = new Array(A.length);
    for (let V = 0; V < A.length; V++) {
      const W = h[V], q = A[V];
      if (W.type !== q.type) {
        O[V] = q;
        continue;
      }
      if (q.type === "pie") {
        const Rt = (D == null ? void 0 : D.pieDataBySeriesIndex[V]) ?? null, Xt = B(W, q, S, Rt);
        D && (D.pieDataBySeriesIndex[V] = Xt.data), O[V] = Xt;
        continue;
      }
      const $ = W, H = q, J = $.data, Z = H.data;
      if (J.length !== Z.length) {
        O[V] = q;
        continue;
      }
      if (Z.length > Lc) {
        O[V] = q;
        continue;
      }
      const ht = (D == null ? void 0 : D.cartesianDataBySeriesIndex[V]) ?? null, mt = C(J, Z, S, ht);
      if (!mt) {
        O[V] = q;
        continue;
      }
      D && (D.cartesianDataBySeriesIndex[V] = mt), O[V] = { ...q, data: mt };
    }
    return O;
  }, I = (h, A, S) => {
    const D = $n(h.from.xBaseDomain, h.to.xBaseDomain, A), O = je(D, S), V = $n(h.from.yBaseDomain, h.to.yBaseDomain, A), W = T(h.from.series, h.to.series, A, null);
    return {
      xBaseDomain: D,
      xVisibleDomain: { min: O.min, max: O.max },
      yBaseDomain: V,
      series: W
    };
  }, R = /* @__PURE__ */ new Set();
  let U = new Array(n.series.length).fill(null), G = new Array(n.series.length).fill(null), E = a.series, _ = a.series, X = [], j = !1, z = null, rt = null, lt = null, Y = !1;
  const nt = /* @__PURE__ */ new Map();
  let St = new Array(a.series.length).fill("unknown");
  const Ct = /* @__PURE__ */ new Set();
  let ft = o && ((sr = a.tooltip) == null ? void 0 : sr.show) !== !1 ? ts(o) : null, ot = null, wt = null, Ft = null;
  const ut = (h, A, S, D) => {
    if (ft == null || ft.show(h, A, S), !s && (e != null && e.onTooltipUpdate)) {
      const O = Array.isArray(D) ? D : [D];
      e.onTooltipUpdate({ content: S, params: O, x: h, y: A });
    }
  }, st = () => {
    ft == null || ft.hide(), !s && (e != null && e.onTooltipUpdate) && e.onTooltipUpdate(null);
  }, bt = () => {
    ot = null, wt = null, Ft = null, st();
  }, K = (h) => {
    !s && (e != null && e.onCrosshairMove) && e.onCrosshairMove(h);
  }, tt = (h) => {
    !s && (e != null && e.onHoverChange) && e.onHoverChange(h);
  };
  ((h, A) => {
    if (c == null || c.update(h, A), !s && (e != null && e.onLegendUpdate)) {
      const S = h.map((D, O) => ({
        name: D.name ?? "",
        color: D.color ?? "#888",
        seriesIndex: O
      }));
      e.onLegendUpdate(S);
    }
  })(a.series, a.theme);
  let pt = go(i);
  const et = Ho(i, { targetFormat: r }), Bt = wr(i, { targetFormat: r }), vt = wr(i, { targetFormat: r }), At = xl(i, { targetFormat: r });
  At.setVisible(!1);
  const Gt = Sl(i, { targetFormat: r });
  Gt.setVisible(!1);
  const Yt = ss(t, a), Lt = s && Zt(t.canvas) ? Tl(t.canvas, Yt) : null;
  let Nt = {
    source: "mouse",
    x: 0,
    y: 0,
    gridX: 0,
    gridY: 0,
    isInGrid: !1,
    hasPointer: !1
  }, Ot = null, Ut;
  const te = /* @__PURE__ */ new Set();
  let Wt = null;
  const oe = (h, A) => {
    const S = Array.from(te);
    for (const D of S) D(h, A);
  }, Vt = (h, A) => {
    const S = h !== null && Number.isFinite(h) ? h : null;
    Ot === S && Ut === A || (Ot = S, Ut = A, oe(Ot, Ut));
  }, kt = () => {
    var h;
    (h = e == null ? void 0 : e.onRequestRender) == null || h.call(e);
  }, le = (h) => h ? Number.isFinite(h.start) && Number.isFinite(h.end) && h.start <= 0 && h.end >= 100 : !0, qt = () => {
    z !== null && (cancelAnimationFrame(z), z = null), rt !== null && (clearTimeout(rt), rt = null), j = !1;
  }, ie = () => {
    lt !== null && (clearTimeout(lt), lt = null);
  }, Te = () => {
    var q;
    if (nt.size === 0) return !1;
    Ct.clear();
    const h = (it == null ? void 0 : it.getRange()) ?? null, A = le(h), S = a.autoScroll === !0 && it != null && a.xAxis.min == null && a.xAxis.max == null, D = qe(a, G), O = h ? je(D, h) : null;
    let V = !1;
    for (const [$, H] of nt) {
      if (H.length === 0) continue;
      const J = a.series[$];
      if (!(!J || J.type === "pie")) {
        if (V = !0, J.type === "candlestick") {
          let Z = U[$];
          if (!Z) {
            const mt = J.rawData ?? J.data;
            Z = mt.length === 0 ? [] : mt.slice(), U[$] = Z, G[$] = J.rawBounds ?? null;
          }
          const ht = H;
          Z.push(...ht), G[$] = Gc(
            G[$],
            ht
          );
        } else {
          let Z = U[$];
          if (!Z) {
            const mt = J.rawData ?? J.data;
            Z = mt.length === 0 ? [] : mt.slice(), U[$] = Z, G[$] = J.rawBounds ?? Xi(Z);
          }
          const ht = H;
          if (J.type === "line" && J.sampling === "none" && A && St[$] === "fullRawLine")
            try {
              pt.appendSeries($, ht), Ct.add($);
            } catch {
            }
          Z.push(...ht), G[$] = _c(
            G[$],
            ht
          );
        }
        X[$] = null;
      }
    }
    if (nt.clear(), !V) return !1;
    if (it) {
      const $ = fi(), H = it;
      (q = H.setSpanConstraints) == null || q.call(H, $.minSpan, $.maxSpan);
    }
    if (S && h && O) {
      const $ = h;
      if ($.end >= 99.5) {
        const H = $.end - $.start, J = it;
        J.setRangeAnchored ? J.setRangeAnchored(100 - H, 100, "end") : it.setRange(100 - H, 100);
      } else {
        const H = qe(a, G), J = H.max - H.min;
        if (Number.isFinite(J) && J > 0) {
          const Z = (O.min - H.min) / J * 100, ht = (O.max - H.min) / J * 100, mt = Math.max(0, Math.min(100, Z)), Rt = Math.max(0, Math.min(100, ht));
          it.setRange(mt, Rt);
        }
      }
    }
    mi();
    const W = (it == null ? void 0 : it.getRange()) ?? null;
    return (W == null || le(W)) && (_ = E), !0;
  }, Pe = (h) => {
    if (f) return;
    const A = (h == null ? void 0 : h.requestRenderAfter) ?? !0, S = Te(), D = (it == null ? void 0 : it.getRange()) ?? null, O = le(D), V = D != null && !O;
    let W = !1;
    Y ? (Y = !1, ie(), !D || O ? _ = E : In(), W = !0) : S && V && (Y = !1, ie(), In(), W = !0), (S || W) && A && kt();
  }, Ee = (h) => {
    f || j || (z !== null && (cancelAnimationFrame(z), z = null), rt !== null && (clearTimeout(rt), rt = null), j = !0, z = requestAnimationFrame(() => {
      if (z = null, f) {
        qt();
        return;
      }
      rt !== null && (clearTimeout(rt), rt = null), j = !1, Pe();
    }), rt = (typeof self < "u" ? self : window).setTimeout(() => {
      if (f) {
        qt();
        return;
      }
      j && (z !== null && (cancelAnimationFrame(z), z = null), j = !1, rt = null, Pe());
    }, 16));
  }, un = () => {
    f || (ie(), Y = !1, lt = (typeof self < "u" ? self : window).setTimeout(() => {
      lt = null, !f && (Y = !0, Ee());
    }, 100));
  }, Qe = (h, A) => {
    let S, D;
    if (Zt(h)) {
      const W = h.getBoundingClientRect();
      if (!(W.width > 0) || !(W.height > 0)) return null;
      S = W.width, D = W.height;
    } else {
      const W = t.devicePixelRatio ?? 1;
      if (console.log("[getPlotSizeCssPx] OffscreenCanvas dimensions:", {
        canvasWidth: h.width,
        canvasHeight: h.height,
        dpr: W,
        calculatedCssWidth: h.width / W,
        calculatedCssHeight: h.height / W
      }), S = h.width / W, D = h.height / W, !(S > 0) || !(D > 0)) return null;
    }
    const O = S - A.left - A.right, V = D - A.top - A.bottom;
    return !(O > 0) || !(V > 0) ? null : { plotWidthCss: O, plotHeightCss: V };
  }, qs = (h, A) => {
    const S = t.canvas;
    if (!S) return null;
    const D = Qe(S, h);
    if (!D) return null;
    const O = Vn().domain(A.xDomain.min, A.xDomain.max).range(0, D.plotWidthCss), V = Vn().domain(A.yDomain.min, A.yDomain.max).range(D.plotHeightCss, 0), W = { xScale: O, yScale: V, plotWidthCss: D.plotWidthCss, plotHeightCss: D.plotHeightCss };
    return console.log("[computeInteractionScalesGridCssPx] Computed interaction scales:", {
      canvasType: Zt(S) ? "HTMLCanvasElement" : "OffscreenCanvas",
      plotWidthCss: W.plotWidthCss,
      plotHeightCss: W.plotHeightCss,
      xDomain: A.xDomain,
      yDomain: A.yDomain,
      xRange: [0, D.plotWidthCss],
      yRange: [D.plotHeightCss, 0]
    }), W;
  }, Sn = (h, A, S) => {
    const D = a.series[h], { x: O, y: V } = Ce(S);
    return {
      seriesName: (D == null ? void 0 : D.name) ?? "",
      seriesIndex: h,
      dataIndex: A,
      value: [O, V],
      color: (D == null ? void 0 : D.color) ?? "#888"
    };
  }, js = (h, A, S) => {
    const D = a.series[h];
    return he(S) ? {
      seriesName: (D == null ? void 0 : D.name) ?? "",
      seriesIndex: h,
      dataIndex: A,
      value: [S[0], S[1], S[2], S[3], S[4]],
      color: (D == null ? void 0 : D.color) ?? "#888"
    } : {
      seriesName: (D == null ? void 0 : D.name) ?? "",
      seriesIndex: h,
      dataIndex: A,
      value: [S.timestamp, S.open, S.close, S.low, S.high],
      color: (D == null ? void 0 : D.color) ?? "#888"
    };
  }, ci = (h, A, S, D, O) => {
    const V = 0.5 * Math.min(D, O);
    if (!(V > 0)) return null;
    for (let W = a.series.length - 1; W >= 0; W--) {
      const q = h[W];
      if (q.type !== "pie") continue;
      const $ = q, H = jc($.center, D, O), J = ls($.radius, V), Z = mc(A, S, { seriesIndex: W, series: $ }, H, J);
      if (Z) return Z;
    }
    return null;
  }, ui = (h, A, S, D) => {
    for (let O = h.length - 1; O >= 0; O--) {
      const V = h[O];
      if (V.type !== "candlestick") continue;
      const W = V, q = lc(
        W,
        W.data,
        D.xScale,
        D.plotWidthCss
      ), $ = fc(
        [W],
        A,
        S,
        D.xScale,
        D.yScale,
        q
      );
      if (!$) continue;
      return { params: js(O, $.dataIndex, $.point), match: { point: $.point }, seriesIndex: O };
    }
    return null;
  }, Zs = (h) => {
    if (Nt = {
      source: "mouse",
      x: h.x,
      y: h.y,
      gridX: h.gridX,
      gridY: h.gridY,
      isInGrid: h.isInGrid,
      hasPointer: !0
    }, h.isInGrid && Wt) {
      const A = Wt.xScale.invert(h.gridX);
      Vt(Number.isFinite(A) ? A : null, "mouse");
    } else h.isInGrid || Vt(null, "mouse");
    At.setVisible(h.isInGrid), K(h.isInGrid ? h.x : null), tt(h.isInGrid ? h : null), kt();
  }, Ks = (h) => {
    Nt.source === "mouse" && (Nt = { ...Nt, isInGrid: !1, hasPointer: !1 }, At.setVisible(!1), bt(), K(null), tt(null), Vt(null, "mouse"), kt());
  };
  Lt && (Lt.on("mousemove", Zs), Lt.on("mouseleave", Ks));
  let it = null, Kt = null, Be = null, We = null;
  const Cn = /* @__PURE__ */ new Set(), Js = (h) => {
    const A = Array.from(Cn);
    for (const S of A) S(h);
  }, Qs = (h) => {
    var W, q;
    const A = (W = h.dataZoom) == null ? void 0 : W.find(($) => ($ == null ? void 0 : $.type) === "inside"), S = (q = h.dataZoom) == null ? void 0 : q.find(($) => ($ == null ? void 0 : $.type) === "slider"), D = A ?? S;
    if (!D) return null;
    const O = Number.isFinite(D.start) ? D.start : 0, V = Number.isFinite(D.end) ? D.end : 100;
    return { start: O, end: V, hasInside: !!A };
  }, fn = (h) => Math.min(100, Math.max(0, h)), to = (h) => {
    let A = null, S = null;
    const D = h.dataZoom ?? [];
    for (const O of D)
      if (O && !(O.type !== "inside" && O.type !== "slider")) {
        if (Number.isFinite(O.minSpan)) {
          const V = fn(O.minSpan);
          A = A == null ? V : Math.max(A, V);
        }
        if (Number.isFinite(O.maxSpan)) {
          const V = fn(O.maxSpan);
          S = S == null ? V : Math.min(S, V);
        }
      }
    return { minSpan: A ?? void 0, maxSpan: S ?? void 0 };
  }, eo = () => {
    if (a.xAxis.type === "category") return null;
    let h = 0;
    for (let S = 0; S < a.series.length; S++) {
      const D = a.series[S];
      if (D.type === "pie") continue;
      if (D.type === "candlestick") {
        const V = U[S] ?? D.rawData ?? D.data;
        h = Math.max(h, V.length);
        continue;
      }
      const O = U[S] ?? D.rawData ?? D.data;
      h = Math.max(h, O.length);
    }
    if (h < 2) return null;
    const A = 100 / (h - 1);
    return Number.isFinite(A) ? fn(A) : null;
  }, fi = () => {
    const h = to(a), A = eo(), S = Number.isFinite(h.minSpan) ? fn(h.minSpan) : A ?? 0.5, D = Number.isFinite(h.maxSpan) ? fn(h.maxSpan) : 100;
    return { minSpan: S, maxSpan: D };
  }, ji = () => {
    var A;
    const h = Qs(a);
    if (!h) {
      Kt == null || Kt.dispose(), Kt = null, Be == null || Be(), Be = null, it = null, We = null;
      return;
    }
    if (it) {
      const S = fi(), D = it;
      (A = D.setSpanConstraints) == null || A.call(D, S.minSpan, S.maxSpan), (We == null || We.start !== h.start || We.end !== h.end) && (it.setRange(h.start, h.end), We = { start: h.start, end: h.end });
    } else {
      const S = fi();
      it = Gl(h.start, h.end, S), We = { start: h.start, end: h.end }, Be = it.onChange((D) => {
        no(), kt(), un(), Js({ start: D.start, end: D.end });
      });
    }
    h.hasInside && Lt ? Kt || (Kt = El(Lt, it), Kt.enable()) : (Kt == null || Kt.dispose(), Kt = null);
  }, Zi = () => {
    const h = a.series.length;
    U = new Array(h).fill(null), G = new Array(h).fill(null), nt.clear();
    for (let A = 0; A < h; A++) {
      const S = a.series[A];
      if (S.type === "pie") continue;
      if (S.type === "candlestick") {
        const V = S.rawData ?? S.data, W = V.length === 0 ? [] : V.slice();
        U[A] = W, G[A] = S.rawBounds ?? null;
        continue;
      }
      const D = S.rawData ?? S.data, O = D.length === 0 ? [] : D.slice();
      U[A] = O, G[A] = S.rawBounds ?? Xi(O);
    }
  }, mi = () => {
    const h = new Array(a.series.length);
    for (let A = 0; A < a.series.length; A++) {
      const S = a.series[A];
      if (S.type === "pie") {
        h[A] = S;
        continue;
      }
      if (S.type === "candlestick") {
        const W = U[A] ?? S.rawData ?? S.data, q = G[A] ?? S.rawBounds ?? void 0, $ = S.sampling === "ohlc" && W.length > S.samplingThreshold ? ki(W, S.samplingThreshold) : W;
        h[A] = { ...S, rawData: W, rawBounds: q, data: $ };
        continue;
      }
      const D = U[A] ?? S.rawData ?? S.data, O = G[A] ?? S.rawBounds ?? void 0, V = an(D, S.sampling, S.samplingThreshold);
      h[A] = { ...S, rawData: D, rawBounds: O, data: V };
    }
    E = h;
  };
  function no() {
    const h = (it == null ? void 0 : it.getRange()) ?? null, A = qe(a, G), S = je(A, h);
    if (h == null || Number.isFinite(h.start) && Number.isFinite(h.end) && h.start <= 0 && h.end >= 100) {
      _ = E;
      return;
    }
    const O = new Array(E.length);
    for (let V = 0; V < E.length; V++) {
      const W = E[V];
      if (W.type === "pie") {
        O[V] = W;
        continue;
      }
      const q = X[V];
      if (q && S.min >= q.cachedRange.min && S.max <= q.cachedRange.max) {
        W.type === "candlestick" ? O[V] = {
          ...W,
          data: Xn(q.data, S.min, S.max)
        } : O[V] = {
          ...W,
          data: zn(q.data, S.min, S.max)
        };
        continue;
      }
      W.type === "candlestick" ? O[V] = {
        ...W,
        data: Xn(W.data, S.min, S.max)
      } : O[V] = {
        ...W,
        data: zn(W.data, S.min, S.max)
      };
    }
    _ = O;
  }
  function In() {
    const h = (it == null ? void 0 : it.getRange()) ?? null, A = qe(a, G), S = je(A, h), V = (S.max - S.min) * 0.1, W = S.min - V, q = S.max + V, $ = 2, H = 2e5, J = 32, Z = Math.max(1e-3, Math.min(1, S.spanFraction)), ht = new Array(E.length);
    for (let mt = 0; mt < E.length; mt++) {
      const Rt = E[mt];
      if (Rt.type === "pie") {
        ht[mt] = Rt;
        continue;
      }
      if (h == null || Number.isFinite(h.start) && Number.isFinite(h.end) && h.start <= 0 && h.end >= 100) {
        ht[mt] = Rt;
        continue;
      }
      if (Rt.type === "candlestick") {
        const re = U[mt] ?? Rt.rawData ?? Rt.data, ue = Xn(re, W, q), Pt = Rt.sampling, ze = Rt.samplingThreshold, mn = Number.isFinite(ze) ? Math.max(1, ze | 0) : 1, Tn = Math.min(H, Math.max($, mn * J)), dn = Ie(Math.round(mn / Z), $, Tn), pn = Pt === "ohlc" && ue.length > dn ? ki(ue, dn) : ue;
        X[mt] = {
          data: pn,
          cachedRange: { min: W, max: q },
          timestamp: Date.now()
        };
        const Pn = Xn(pn, S.min, S.max);
        ht[mt] = { ...Rt, data: Pn };
        continue;
      }
      const Jt = U[mt] ?? Rt.rawData ?? Rt.data, Q = zn(Jt, W, q), Dt = Rt.sampling, dt = Rt.samplingThreshold, xe = Number.isFinite(dt) ? Math.max(1, dt | 0) : 1, $e = Math.min(H, Math.max($, xe * J)), Ht = Ie(Math.round(xe / Z), $, $e), tn = an(Q, Dt, Ht);
      X[mt] = {
        data: tn,
        cachedRange: { min: W, max: q },
        timestamp: Date.now()
      };
      const en = zn(tn, S.min, S.max);
      ht[mt] = { ...Rt, data: en };
    }
    _ = ht;
  }
  Zi(), mi(), ji(), In(), X = new Array(a.series.length).fill(null);
  const ce = [], ge = [], Ae = [], Ve = [], ye = [], Re = [], di = ga(i, { targetFormat: r }), Ki = (h) => {
    for (; ce.length > h; ) {
      const A = ce.pop();
      A == null || A.dispose();
    }
    for (; ce.length < h; )
      ce.push(Qo(i, { targetFormat: r }));
  }, Ji = (h) => {
    for (; ge.length > h; ) {
      const A = ge.pop();
      A == null || A.dispose();
    }
    for (; ge.length < h; )
      ge.push(oa(i, { targetFormat: r }));
  }, Qi = (h) => {
    for (; Ae.length > h; ) {
      const A = Ae.pop();
      A == null || A.dispose();
    }
    for (; Ae.length < h; )
      Ae.push(Ca(i, { targetFormat: r }));
  }, tr = (h) => {
    for (; Ve.length > h; ) {
      const A = Ve.pop();
      A == null || A.dispose();
    }
    for (; Ve.length < h; )
      Ve.push(_a(i, { targetFormat: r }));
  }, er = (h) => {
    for (; ye.length > h; ) {
      const A = ye.pop();
      A == null || A.dispose();
    }
    for (; ye.length < h; )
      ye.push(Xa(i, { targetFormat: r }));
  }, nr = (h) => {
    for (; Re.length > h; ) {
      const A = Re.pop();
      A == null || A.dispose();
    }
    for (; Re.length < h; )
      Re.push(il(i, { targetFormat: r }));
  };
  Ki(a.series.length), Ji(a.series.length), Qi(a.series.length), tr(a.series.length), er(a.series.length), nr(a.series.length);
  const Ue = () => {
    if (f) throw new Error("RenderCoordinator is disposed.");
  }, ir = () => {
    if (g)
      try {
        x.cancel(g);
      } catch {
      }
    g = null, m = 1, d = null, y();
  }, rr = (h, A) => h.min === A.min && h.max === A.max, io = (h, A) => {
    if (h.length !== A.length) return !0;
    for (let S = 0; S < h.length; S++) {
      const D = h[S], O = A[S];
      if (D.type !== O.type) return !0;
      if (D.type === "pie") {
        const V = D, W = O;
        if (V.data !== W.data || V.data.length !== W.data.length) return !0;
      } else {
        const V = D, W = O, q = V.rawData ?? V.data, $ = W.rawData ?? W.data;
        if (q !== $ || q.length !== $.length) return !0;
      }
    }
    return !1;
  }, ro = (h) => {
    var Jt;
    Ue();
    const A = (it == null ? void 0 : it.getRange()) ?? null, S = (() => {
      if (d && g) {
        try {
          x.update(performance.now());
        } catch {
        }
        return I(d, m, A);
      }
      const Q = qe(a, G), Dt = je(Q, A), dt = Wi(a, G);
      return {
        xBaseDomain: Q,
        xVisibleDomain: { min: Dt.min, max: Dt.max },
        yBaseDomain: dt,
        series: _
      };
    })();
    ir();
    const D = io(a.series, h.series);
    if (a = h, E = h.series, _ = h.series, St = new Array(h.series.length).fill("unknown"), X = new Array(h.series.length).fill(null), c == null || c.update(h.series, h.theme), ie(), Y = !1, qt(), Zi(), mi(), ji(), In(), o) {
      const Q = ((Jt = a.tooltip) == null ? void 0 : Jt.show) !== !1;
      Q && !ft && (ft = ts(o), ot = null, wt = null, Ft = null), !Q && ft && bt();
    } else
      bt();
    const O = h.series.length;
    if (Ki(O), Ji(O), Qi(O), tr(O), er(O), nr(O), O < w)
      for (let Q = O; Q < w; Q++)
        pt.removeSeries(Q);
    if (w = O, a.animation === !1 && M === "running" && (N.cancelAll(), F = null, M = "done", P = 1), a.animation === !1) {
      ir();
      return;
    }
    const V = (it == null ? void 0 : it.getRange()) ?? null, W = qe(a, G), q = je(W, V), $ = Wi(a, G), H = _, J = !rr(S.xBaseDomain, W) || !rr(S.yBaseDomain, $);
    if (!(b && (J || D))) return;
    const ht = nu(a.animation);
    if (!ht) return;
    d = {
      from: {
        xBaseDomain: S.xBaseDomain,
        xVisibleDomain: S.xVisibleDomain,
        yBaseDomain: S.yBaseDomain,
        series: S.series
      },
      to: {
        xBaseDomain: W,
        xVisibleDomain: { min: q.min, max: q.max },
        yBaseDomain: $,
        series: H
      }
    }, y();
    const mt = ht.delayMs + ht.durationMs, Rt = (Q) => {
      const Dt = Ne(Q);
      if (!(mt > 0)) return 1;
      const dt = Dt * mt;
      if (dt <= ht.delayMs) return 0;
      if (!(ht.durationMs > 0)) return 1;
      const xe = (dt - ht.delayMs) / ht.durationMs;
      return ht.easing(xe);
    };
    m = 0;
    const Xt = x.animate(
      0,
      1,
      mt,
      Rt,
      (Q) => {
        f || g !== Xt || (m = Ne(Q), m < 1 && kt());
      },
      () => {
        f || g !== Xt || (m = 1, d = null, g = null, y());
      }
    );
    g = Xt;
  }, so = (h, A) => {
    if (Ue(), !Number.isFinite(h) || h < 0 || h >= a.series.length || !A || A.length === 0) return;
    if (a.series[h].type === "pie") {
      R.has(h) || (R.add(h), console.warn(
        `RenderCoordinator.appendData(${h}, ...): pie series are not supported by streaming append.`
      ));
      return;
    }
    const D = nt.get(h);
    D ? D.push(...A) : nt.set(h, Array.from(A)), Ee();
  }, oo = (h) => {
    switch (h.type) {
      case "area":
        return !0;
      case "line":
        return h.areaStyle != null;
      case "bar":
        return !1;
      case "scatter":
        return !1;
      case "pie":
        return !1;
      case "candlestick":
        return !1;
      default:
        return Gi(h);
    }
  };
  return {
    setOptions: ro,
    appendData: so,
    getInteractionX: () => Ot,
    setInteractionX: (h, A) => {
      Ue();
      const S = h !== null && Number.isFinite(h) ? h : null;
      Nt = { ...Nt, source: S === null ? "mouse" : "sync" }, Vt(S, A), S === null && Nt.hasPointer === !1 && (At.setVisible(!1), Gt.setVisible(!1), st(), K(null)), kt();
    },
    onInteractionXChange: (h) => (Ue(), te.add(h), () => {
      te.delete(h);
    }),
    getZoomRange: () => (it == null ? void 0 : it.getRange()) ?? null,
    setZoomRange: (h, A) => {
      Ue(), it && it.setRange(h, A);
    },
    onZoomRangeChange: (h) => (Ue(), Cn.add(h), () => {
      Cn.delete(h);
    }),
    handlePointerEvent: (h) => {
      if (Ue(), s || !t.canvas || !Number.isFinite(h.x) || !Number.isFinite(h.y) || !Number.isFinite(h.gridX) || !Number.isFinite(h.gridY) || !Number.isFinite(h.plotWidthCss) || !Number.isFinite(h.plotHeightCss))
        return;
      const { type: S, x: D, y: O, gridX: V, gridY: W, plotWidthCss: q, plotHeightCss: $, isInGrid: H } = h;
      if (S === "leave") {
        Nt = { ...Nt, isInGrid: !1, hasPointer: !1 }, At.setVisible(!1), ot = null, wt = null, Ft = null, st(), K(null), tt(null), Vt(null, "mouse"), kt();
        return;
      }
      if (S === "move") {
        Nt = {
          source: "mouse",
          x: D,
          y: O,
          gridX: V,
          gridY: W,
          isInGrid: H,
          hasPointer: !0
        }, kt();
        return;
      }
      if (S === "click") {
        if (!(e != null && e.onClickData)) return;
        let J = null, Z = null, ht = null;
        if (H && Wt) {
          if (Z = ci(
            _,
            V,
            W,
            q,
            $
          ), !Z) {
            const mt = ui(
              _,
              V,
              W,
              Wt
            );
            mt && (ht = {
              seriesIndex: mt.seriesIndex,
              dataIndex: mt.params.dataIndex,
              point: mt.match.point
            });
          }
          !Z && !ht && (J = Ri(
            _,
            V,
            W,
            Wt.xScale,
            Wt.yScale,
            20
            // maxDistance in CSS pixels
          ));
        }
        e.onClickData({
          x: D,
          y: O,
          gridX: V,
          gridY: W,
          isInGrid: H,
          nearest: J,
          pieSlice: Z,
          candlestick: ht
        });
        return;
      }
      if (S === "wheel") {
        if (!H || !it) return;
        const J = h.deltaX ?? 0, Z = h.deltaY ?? 0, ht = h.deltaMode ?? 0, mt = (re, ue) => {
          if (!Number.isFinite(re) || re === 0) return 0;
          switch (ht) {
            case 1:
              return re * 16;
            case 2:
              return re * (Number.isFinite(ue) && ue > 0 ? ue : 800);
            default:
              return re;
          }
        }, Rt = mt(Z, $), Xt = mt(J, q);
        if (Math.abs(Xt) > Math.abs(Rt) && Xt !== 0) {
          const { start: re, end: ue } = it.getRange(), Pt = ue - re;
          if (!Number.isFinite(Pt) || Pt === 0) return;
          const ze = Xt / q * Pt;
          if (!Number.isFinite(ze) || ze === 0) return;
          it.pan(ze);
          return;
        }
        if (Rt === 0) return;
        const Jt = Math.abs(Rt);
        if (!Number.isFinite(Jt) || Jt === 0) return;
        const Q = Math.min(Jt, 200), dt = Math.exp(Q * 2e-3);
        if (!(dt > 1)) return;
        const { start: xe, end: $e } = it.getRange(), Ht = $e - xe;
        if (!Number.isFinite(Ht) || Ht === 0) return;
        const tn = Math.min(1, Math.max(0, V / q)), en = Math.min(100, Math.max(0, xe + tn * Ht));
        Rt < 0 ? it.zoomIn(en, dt) : it.zoomOut(en, dt), kt();
        return;
      }
    },
    render: () => {
      var mn, Tn, dn, pn, Pn, or, ar, lr, cr;
      if (Ue(), !t.canvasContext || !t.canvas) return;
      (nt.size > 0 || Y) && (qt(), Pe({ requestRenderAfter: !1 }));
      const h = a.series.some((L) => L.type !== "pie"), A = _;
      if (M !== "done") {
        const L = eu(a.animation), k = (() => {
          for (let yt = 0; yt < A.length; yt++) {
            const at = A[yt];
            switch (at.type) {
              case "pie": {
                if (at.data.some((ct) => typeof (ct == null ? void 0 : ct.value) == "number" && Number.isFinite(ct.value) && ct.value > 0))
                  return !0;
                break;
              }
              case "line":
              case "area":
              case "bar":
              case "scatter":
              case "candlestick": {
                if (at.data.length > 0) return !0;
                break;
              }
              default:
                Gi(at);
            }
          }
          return !1;
        })();
        if (M === "pending" && L && k) {
          const yt = L.delayMs + L.durationMs, at = (ct) => {
            const Tt = Ne(ct);
            if (!(yt > 0)) return 1;
            const gt = Tt * yt;
            if (gt <= L.delayMs) return 0;
            if (!(L.durationMs > 0)) return 1;
            const xt = (gt - L.delayMs) / L.durationMs;
            return L.easing(xt);
          };
          P = 0, M = "running", F = N.animate(
            0,
            1,
            yt,
            at,
            (ct) => {
              f || M !== "running" || (P = Ne(ct), P < 1 && kt());
            },
            () => {
              f || (M = "done", P = 1, F = null);
            }
          );
        }
        N.update(performance.now());
      }
      d !== null && g && x.update(performance.now());
      const S = ss(t, a);
      Lt == null || Lt.updateGridArea(S);
      const D = (it == null ? void 0 : it.getRange()) ?? null, O = d ? Ne(m) : 1, V = d ? $n(d.from.xBaseDomain, d.to.xBaseDomain, O) : qe(a, G), W = d ? $n(d.from.yBaseDomain, d.to.yBaseDomain, O) : Wi(a, G), q = je(V, D), $ = Vc(S), H = as(S), J = Vn().domain(q.min, q.max).range($.left, $.right), Z = Vn().domain(W.min, W.max).range($.bottom, $.top), ht = S.devicePixelRatio, mt = t.canvas ? is(t.canvas, ht) : 0, Rt = Math.abs(q.max - q.min);
      let Xt = vn, Jt = [];
      if (a.xAxis.type === "time") {
        const L = tu({
          axisMin: si(a.xAxis.min),
          axisMax: si(a.xAxis.max),
          xScale: J,
          plotClipLeft: $.left,
          plotClipRight: $.right,
          canvasCssWidth: mt,
          visibleRangeMs: Rt,
          measureCtx: u,
          measureCache: p ?? void 0,
          fontSize: a.theme.fontSize,
          fontFamily: a.theme.fontFamily || "sans-serif"
        });
        Xt = L.tickCount, Jt = L.tickValues;
      } else {
        const L = Se(a.xAxis.min) ?? J.invert($.left), k = Se(a.xAxis.max) ?? J.invert($.right);
        Jt = ti(L, k, Xt);
      }
      const Q = qs(S, {
        xDomain: { min: q.min, max: q.max },
        yDomain: W
      });
      Wt = Q;
      const Dt = d && O < 1 ? T(d.from.series, d.to.series, O, v) : _;
      if (Nt.source === "mouse" && Nt.hasPointer && Nt.isInGrid && Q) {
        const L = Q.xScale.invert(Nt.gridX);
        Vt(Number.isFinite(L) ? L : null, "mouse");
      }
      let dt = Nt;
      if (Nt.source === "sync")
        if (Ot === null || !Q)
          dt = { ...Nt, hasPointer: !1, isInGrid: !1 };
        else {
          const L = Q.xScale.scale(Ot), k = Q.plotHeightCss * 0.5, yt = Number.isFinite(L) && Number.isFinite(k) && L >= 0 && L <= Q.plotWidthCss && k >= 0 && k <= Q.plotHeightCss;
          dt = {
            source: "sync",
            gridX: Number.isFinite(L) ? L : 0,
            gridY: Number.isFinite(k) ? k : 0,
            // Crosshair/tooltip expect CANVAS-LOCAL CSS px.
            x: S.left + (Number.isFinite(L) ? L : 0),
            y: S.top + (Number.isFinite(k) ? k : 0),
            isInGrid: yt,
            hasPointer: yt
          };
        }
      if (et.prepare(S, { color: a.theme.gridLineColor }), h && (Bt.prepare(
        a.xAxis,
        J,
        "x",
        S,
        a.theme.axisLineColor,
        a.theme.axisTickColor,
        Xt
      ), vt.prepare(
        a.yAxis,
        Z,
        "y",
        S,
        a.theme.axisLineColor,
        a.theme.axisTickColor,
        vn
      )), dt.hasPointer && dt.isInGrid) {
        const L = {
          showX: !0,
          // Sync has no meaningful y, so avoid horizontal line.
          showY: dt.source !== "sync",
          color: os(a.theme.axisLineColor, 0.6),
          lineWidth: Bc
        };
        At.prepare(dt.x, dt.y, S, L), At.setVisible(!0), K(dt.x);
      } else
        At.setVisible(!1), K(null);
      if (dt.source === "mouse" && dt.hasPointer && dt.isInGrid)
        if (Q) {
          const L = Ri(
            Dt,
            dt.gridX,
            dt.gridY,
            Q.xScale,
            Q.yScale
          );
          if (L) {
            const { x: k, y: yt } = Ce(L.point), at = Q.xScale.scale(k), ct = Q.yScale.scale(yt);
            if (Number.isFinite(at) && Number.isFinite(ct)) {
              const Tt = S.left + at, gt = S.top + ct, xt = as(S), Mt = {
                centerDeviceX: Tt * S.devicePixelRatio,
                centerDeviceY: gt * S.devicePixelRatio,
                devicePixelRatio: S.devicePixelRatio,
                canvasWidth: S.canvasWidth,
                canvasHeight: S.canvasHeight,
                scissor: xt
              }, Et = ((mn = a.series[L.seriesIndex]) == null ? void 0 : mn.color) ?? "#888";
              Gt.prepare(Mt, Et, Ac), Gt.setVisible(!0);
            } else
              Gt.setVisible(!1);
          } else
            Gt.setVisible(!1);
        } else
          Gt.setVisible(!1);
      else
        Gt.setVisible(!1);
      if (dt.hasPointer && dt.isInGrid && ((Tn = a.tooltip) == null ? void 0 : Tn.show) !== !1) {
        const L = t.canvas;
        if (console.log("[Tooltip block] State check:", {
          hasInteractionScales: !!Q,
          domOverlaysEnabled: s,
          hasCanvas: !!L,
          canvasType: L ? Zt(L) ? "HTMLCanvasElement" : "OffscreenCanvas" : "null",
          interactionScales: Q ? {
            plotWidthCss: Q.plotWidthCss,
            plotHeightCss: Q.plotHeightCss
          } : null
        }), Q && (!s || L && Zt(L))) {
          const k = (dn = a.tooltip) == null ? void 0 : dn.formatter, yt = ((pn = a.tooltip) == null ? void 0 : pn.trigger) ?? "item", at = Zt(L) ? L.offsetLeft + dt.x : dt.x, ct = Zt(L) ? L.offsetTop + dt.y : dt.y;
          if (dt.source === "sync") {
            const Tt = Kr(Dt, dt.gridX, Q.xScale);
            if (Tt.length === 0)
              bt();
            else if (yt === "axis") {
              const gt = Tt.map((Mt) => Sn(Mt.seriesIndex, Mt.dataIndex, Mt.point)), xt = k ? k(gt) : Ui(gt);
              xt && (xt !== ot || at !== wt || ct !== Ft) ? (ot = xt, wt = at, Ft = ct, ut(at, ct, xt, gt)) : xt || bt();
            } else {
              const gt = Tt[0], xt = Sn(gt.seriesIndex, gt.dataIndex, gt.point), Mt = k ? k(xt) : bn(xt);
              Mt && (Mt !== ot || at !== wt || ct !== Ft) ? (ot = Mt, wt = at, Ft = ct, ut(at, ct, Mt, xt)) : Mt || bt();
            }
          } else if (yt === "axis") {
            const Tt = ci(
              Dt,
              dt.gridX,
              dt.gridY,
              Q.plotWidthCss,
              Q.plotHeightCss
            );
            if (Tt) {
              const gt = {
                seriesName: Tt.slice.name,
                seriesIndex: Tt.seriesIndex,
                dataIndex: Tt.dataIndex,
                value: [0, Tt.slice.value],
                color: Tt.slice.color
              }, xt = k ? k([gt]) : bn(gt);
              xt && (xt !== ot || at !== wt || ct !== Ft) ? (ot = xt, wt = at, Ft = ct, ut(at, ct, xt, [gt])) : xt || bt();
            } else {
              const gt = ui(
                Dt,
                dt.gridX,
                dt.gridY,
                Q
              ), xt = Kr(Dt, dt.gridX, Q.xScale);
              if (xt.length === 0)
                if (gt) {
                  const Mt = [gt.params], Et = k ? k(Mt) : Ui(Mt);
                  if (Et) {
                    const _t = Vi(
                      gt.match,
                      Q.xScale,
                      Q.yScale,
                      S,
                      L
                    ), ee = (_t == null ? void 0 : _t.x) ?? at, fe = (_t == null ? void 0 : _t.y) ?? ct;
                    (Et !== ot || ee !== wt || fe !== Ft) && (ot = Et, wt = ee, Ft = fe, ut(ee, fe, Et, Mt));
                  } else
                    bt();
                } else
                  bt();
              else {
                const Mt = xt.map((_t) => Sn(_t.seriesIndex, _t.dataIndex, _t.point));
                gt && Mt.push(gt.params);
                const Et = k ? k(Mt) : Ui(Mt);
                if (Et) {
                  let _t = at, ee = ct;
                  if (gt) {
                    const fe = Vi(
                      gt.match,
                      Q.xScale,
                      Q.yScale,
                      S,
                      L
                    );
                    fe && (_t = fe.x, ee = fe.y);
                  }
                  (Et !== ot || _t !== wt || ee !== Ft) && (ot = Et, wt = _t, Ft = ee, ut(_t, ee, Et, Mt));
                } else
                  bt();
              }
            }
          } else {
            const Tt = ci(
              Dt,
              dt.gridX,
              dt.gridY,
              Q.plotWidthCss,
              Q.plotHeightCss
            );
            if (Tt) {
              const gt = {
                seriesName: Tt.slice.name,
                seriesIndex: Tt.seriesIndex,
                dataIndex: Tt.dataIndex,
                value: [0, Tt.slice.value],
                color: Tt.slice.color
              }, xt = k ? k(gt) : bn(gt);
              xt && (xt !== ot || at !== wt || ct !== Ft) ? (ot = xt, wt = at, Ft = ct, ut(at, ct, xt, gt)) : xt || bt();
            } else {
              const gt = ui(
                Dt,
                dt.gridX,
                dt.gridY,
                Q
              );
              if (gt) {
                const Mt = k ? k(gt.params) : bn(gt.params);
                if (Mt) {
                  const Et = Vi(
                    gt.match,
                    Q.xScale,
                    Q.yScale,
                    S,
                    L
                  ), _t = (Et == null ? void 0 : Et.x) ?? at, ee = (Et == null ? void 0 : Et.y) ?? ct;
                  (Mt !== ot || _t !== wt || ee !== Ft) && (ot = Mt, wt = _t, Ft = ee, ut(_t, ee, Mt, gt.params));
                } else
                  bt();
                return;
              }
              const xt = Ri(
                Dt,
                dt.gridX,
                dt.gridY,
                Q.xScale,
                Q.yScale
              );
              if (!xt)
                bt();
              else {
                const Mt = Sn(xt.seriesIndex, xt.dataIndex, xt.point), Et = k ? k(Mt) : bn(Mt);
                Et && (Et !== ot || at !== wt || ct !== Ft) ? (ot = Et, wt = at, Ft = ct, ut(at, ct, Et, Mt)) : Et || bt();
              }
            }
          }
        } else
          bt();
      } else
        bt();
      const xe = a.yAxis.min ?? W.min, $e = [], Ht = M === "running" ? Ne(P) : 1;
      for (let L = 0; L < Dt.length; L++) {
        const k = Dt[L];
        switch (k.type) {
          case "area": {
            const yt = k.baseline ?? xe;
            ce[L].prepare(k, k.data, J, Z, yt);
            break;
          }
          case "line": {
            Ct.has(L) || pt.setSeries(L, k.data);
            const yt = pt.getSeriesBuffer(L);
            ge[L].prepare(k, yt, J, Z);
            const at = (it == null ? void 0 : it.getRange()) ?? null;
            if ((at == null || Number.isFinite(at.start) && Number.isFinite(at.end) && at.start <= 0 && at.end >= 100) && k.sampling === "none" ? St[L] = "fullRawLine" : St[L] = "other", k.areaStyle) {
              const Tt = {
                type: "area",
                name: k.name,
                rawData: k.data,
                data: k.data,
                color: k.areaStyle.color,
                areaStyle: k.areaStyle,
                sampling: k.sampling,
                samplingThreshold: k.samplingThreshold
              };
              ce[L].prepare(Tt, Tt.data, J, Z, xe);
            }
            break;
          }
          case "bar": {
            $e.push(k);
            break;
          }
          case "scatter": {
            if (k.mode === "density") {
              const yt = k.rawData ?? k.data, at = zc(yt, q.min, q.max);
              Ct.has(L) || pt.setSeries(L, yt);
              const ct = pt.getSeriesBuffer(L), Tt = pt.getSeriesPointCount(L);
              Ve[L].prepare(
                k,
                ct,
                Tt,
                at.start,
                at.end,
                J,
                Z,
                S,
                k.rawBounds
              ), St[L] = "other";
            } else {
              const yt = Ht < 1 ? { ...k, color: os(k.color, Ht) } : k;
              Ae[L].prepare(yt, k.data, J, Z, S);
            }
            break;
          }
          case "pie": {
            if (Ht < 1) {
              const yt = t.canvas, at = (Q == null ? void 0 : Q.plotWidthCss) ?? (yt && Zt(yt) ? (Pn = Qe(yt, S)) == null ? void 0 : Pn.plotWidthCss : null), ct = (Q == null ? void 0 : Q.plotHeightCss) ?? (yt && Zt(yt) ? (or = Qe(yt, S)) == null ? void 0 : or.plotHeightCss : null), Tt = typeof at == "number" && typeof ct == "number" ? 0.5 * Math.min(at, ct) : 0;
              if (Tt > 0) {
                const gt = ls(k.radius, Tt), xt = Math.max(0, gt.inner) * Ht, Mt = Math.max(xt, gt.outer) * Ht, Et = { ...k, radius: [xt, Mt] };
                ye[L].prepare(Et, S);
                break;
              }
            }
            ye[L].prepare(k, S);
            break;
          }
          case "candlestick": {
            Re[L].prepare(k, k.data, J, Z, S, a.theme.backgroundColor);
            break;
          }
          default:
            Gi(k);
        }
      }
      const tn = Ht < 1 ? ru(Z, $, $e, Ht) : Z;
      di.prepare($e, pt, J, tn, S);
      const en = t.canvasContext.getCurrentTexture().createView(), re = i.createCommandEncoder({ label: "renderCoordinator/commandEncoder" }), ue = Bo(a.theme.backgroundColor, { r: 0, g: 0, b: 0, a: 1 });
      for (let L = 0; L < Dt.length; L++) {
        const k = Dt[L];
        k.type === "scatter" && k.mode === "density" && Ve[L].encodeCompute(re);
      }
      const Pt = re.beginRenderPass({
        label: "renderCoordinator/renderPass",
        colorAttachments: [
          {
            view: en,
            clearValue: ue,
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });
      et.render(Pt);
      for (let L = 0; L < Dt.length; L++)
        Dt[L].type === "pie" && ye[L].render(Pt);
      for (let L = 0; L < Dt.length; L++)
        if (oo(Dt[L]))
          if (Ht < 1) {
            const k = Ie(Math.floor(H.w * Ht), 0, H.w);
            k > 0 && H.h > 0 && (Pt.setScissorRect(H.x, H.y, k, H.h), ce[L].render(Pt), Pt.setScissorRect(0, 0, S.canvasWidth, S.canvasHeight));
          } else
            Pt.setScissorRect(H.x, H.y, H.w, H.h), ce[L].render(Pt), Pt.setScissorRect(0, 0, S.canvasWidth, S.canvasHeight);
      H.w > 0 && H.h > 0 && (Pt.setScissorRect(H.x, H.y, H.w, H.h), di.render(Pt), Pt.setScissorRect(0, 0, S.canvasWidth, S.canvasHeight));
      for (let L = 0; L < Dt.length; L++)
        Dt[L].type === "candlestick" && Re[L].render(Pt);
      for (let L = 0; L < Dt.length; L++) {
        const k = Dt[L];
        k.type === "scatter" && (k.mode === "density" ? Ve[L].render(Pt) : Ae[L].render(Pt));
      }
      for (let L = 0; L < Dt.length; L++)
        if (Dt[L].type === "line")
          if (Ht < 1) {
            const k = Ie(Math.floor(H.w * Ht), 0, H.w);
            k > 0 && H.h > 0 && (Pt.setScissorRect(H.x, H.y, k, H.h), ge[L].render(Pt), Pt.setScissorRect(0, 0, S.canvasWidth, S.canvasHeight));
          } else
            Pt.setScissorRect(H.x, H.y, H.w, H.h), ge[L].render(Pt), Pt.setScissorRect(0, 0, S.canvasWidth, S.canvasHeight);
      if (Gt.render(Pt), h && (Bt.render(Pt), vt.render(Pt)), At.render(Pt), Pt.end(), i.queue.submit([re.finish()]), b = !0, h && (l && o || // DOM mode with overlay
      !s && (e == null ? void 0 : e.onAxisLabelsUpdate))) {
        const L = t.canvas, k = is(L, t.devicePixelRatio ?? 1), yt = Tc(L, t.devicePixelRatio ?? 1);
        if (k <= 0 || yt <= 0) return;
        const at = Zt(L) ? L.offsetLeft : 0, ct = Zt(L) ? L.offsetTop : 0, Tt = Qn($.left, k), gt = Qn($.right, k), xt = Oi($.top, yt), Mt = Oi($.bottom, yt);
        l == null || l.clear();
        const Et = [], _t = [], ee = a.xAxis.tickLength ?? rs, fe = Mt + ee + Li + a.theme.fontSize * 0.5, ur = a.xAxis.type === "time", ao = (() => {
          if (ur) return null;
          const jt = Se(a.xAxis.min) ?? J.invert($.left), ae = Se(a.xAxis.max) ?? J.invert($.right), Le = Xt === 1 ? 0 : (ae - jt) / (Xt - 1);
          return cs(Le);
        })();
        for (let jt = 0; jt < Jt.length; jt++) {
          const ae = Jt[jt], Le = J.scale(ae), _e = Qn(Le, k), we = Jt.length === 1 ? "middle" : jt === 0 ? "start" : jt === Jt.length - 1 ? "end" : "middle", ne = ur ? Xs(ae, Rt) : us(ao, ae);
          if (ne == null) continue;
          const Fe = { axis: "x", text: ne, x: at + _e, y: ct + fe, anchor: we, isTitle: !1 };
          if (Et.push(Fe), l) {
            const ve = l.addLabel(ne, at + _e, ct + fe, {
              fontSize: a.theme.fontSize,
              color: a.theme.textColor,
              anchor: we
            });
            cn(ve, Fe, a.theme);
          }
        }
        const pi = vn, lo = a.yAxis.tickLength ?? rs, hi = Se(a.yAxis.min) ?? Z.invert($.bottom), fr = Se(a.yAxis.max) ?? Z.invert($.top), co = (fr - hi) / (pi - 1), uo = cs(co), bi = Tt - lo - Li, gi = [];
        for (let jt = 0; jt < pi; jt++) {
          const ae = jt / (pi - 1), Le = hi + ae * (fr - hi), _e = Z.scale(Le), we = Oi(_e, yt), ne = us(uo, Le);
          if (ne == null) continue;
          const Fe = { axis: "y", text: ne, x: at + bi, y: ct + we, anchor: "end", isTitle: !1 };
          if (_t.push(Fe), l) {
            const ve = l.addLabel(ne, at + bi, ct + we, {
              fontSize: a.theme.fontSize,
              color: a.theme.textColor,
              anchor: "end"
            });
            cn(ve, Fe, a.theme), gi.push(ve);
          }
        }
        const yi = Rs(a.theme.fontSize), xi = ((ar = a.xAxis.name) == null ? void 0 : ar.trim()) ?? "";
        if (xi.length > 0) {
          const jt = (Tt + gt) / 2, ae = fe + a.theme.fontSize * 0.5, we = ((lr = a.dataZoom) == null ? void 0 : lr.some((ve) => (ve == null ? void 0 : ve.type) === "slider")) ?? !1 ? yt - 32 : yt, ne = (ae + we) / 2, Fe = { axis: "x", text: xi, x: at + jt, y: ct + ne, anchor: "middle", isTitle: !0 };
          if (Et.push(Fe), l) {
            const ve = l.addLabel(xi, at + jt, ct + ne, {
              fontSize: yi,
              color: a.theme.textColor,
              anchor: "middle"
            });
            cn(ve, Fe, a.theme);
          }
        }
        const wi = ((cr = a.yAxis.name) == null ? void 0 : cr.trim()) ?? "";
        if (wi.length > 0) {
          const jt = gi.length === 0 ? Wc(_t, a.theme.fontSize) : gi.reduce((ne, Fe) => Math.max(ne, Fe.getBoundingClientRect().width), 0), ae = (xt + Mt) / 2, _e = bi - jt - Li - yi * 0.5, we = { axis: "y", text: wi, x: at + _e, y: ct + ae, anchor: "middle", rotation: -90, isTitle: !0 };
          if (_t.push(we), l) {
            const ne = l.addLabel(wi, at + _e, ct + ae, {
              fontSize: yi,
              color: a.theme.textColor,
              anchor: "middle",
              rotation: -90
            });
            cn(ne, we, a.theme);
          }
        }
        !s && (e != null && e.onAxisLabelsUpdate) && e.onAxisLabelsUpdate(Et, _t);
      }
    },
    dispose: () => {
      if (!f) {
        f = !0;
        try {
          F && N.cancel(F), N.cancelAll();
        } catch {
        }
        F = null, M = "done", P = 1;
        try {
          g && x.cancel(g), x.cancelAll();
        } catch {
        }
        g = null, m = 1, d = null, qt(), ie(), Y = !1, nt.clear(), Kt == null || Kt.dispose(), Kt = null, Be == null || Be(), Be = null, it = null, We = null, Cn.clear(), Lt == null || Lt.dispose(), At.dispose(), Gt.dispose();
        for (let h = 0; h < ce.length; h++)
          ce[h].dispose();
        ce.length = 0;
        for (let h = 0; h < ge.length; h++)
          ge[h].dispose();
        ge.length = 0;
        for (let h = 0; h < Ae.length; h++)
          Ae[h].dispose();
        Ae.length = 0;
        for (let h = 0; h < ye.length; h++)
          ye[h].dispose();
        ye.length = 0;
        for (let h = 0; h < Re.length; h++)
          Re[h].dispose();
        Re.length = 0, di.dispose(), et.dispose(), Bt.dispose(), vt.dispose(), pt.dispose(), ft == null || ft.dispose(), ft = null, c == null || c.dispose(), l == null || l.dispose();
      }
    }
  };
}
const su = {
  left: 60,
  right: 20,
  top: 40,
  bottom: 40
}, ei = [
  "#5470C6",
  "#91CC75",
  "#FAC858",
  "#EE6666",
  "#73C0DE",
  "#3BA272",
  "#FC8452",
  "#9A60B4",
  "#EA7CCC"
], ms = {
  width: 2,
  opacity: 1
}, ds = {
  opacity: 0.25
}, de = {
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
}, Hn = {
  mode: "points",
  // Bin size in CSS pixels for density mode. Must be > 0.
  binSize: 2,
  densityColormap: "viridis",
  densityNormalization: "log"
}, se = {
  grid: su,
  xAxis: { type: "value" },
  yAxis: { type: "value" },
  autoScroll: !1,
  theme: "dark",
  palette: ei,
  series: []
}, ou = [
  "#00E5FF",
  "#FF2D95",
  "#B026FF",
  "#00F5A0",
  "#FFD300",
  "#FF6B00",
  "#4D5BFF",
  "#FF3D3D"
], au = {
  backgroundColor: "#1a1a2e",
  textColor: "#e0e0e0",
  axisLineColor: "rgba(224,224,224,0.35)",
  axisTickColor: "rgba(224,224,224,0.55)",
  gridLineColor: "rgba(255,255,255,0.1)",
  colorPalette: [...ou],
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  fontSize: 12
}, lu = [
  "#1F77B4",
  "#FF7F0E",
  "#2CA02C",
  "#D62728",
  "#9467BD",
  "#8C564B",
  "#E377C2",
  "#17BECF"
], cu = {
  backgroundColor: "#ffffff",
  textColor: "#333333",
  axisLineColor: "rgba(0,0,0,0.35)",
  axisTickColor: "rgba(0,0,0,0.55)",
  gridLineColor: "rgba(0,0,0,0.1)",
  colorPalette: [...lu],
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  fontSize: 12
};
function $i(t) {
  return t === "dark" ? au : cu;
}
const uu = (t) => {
  if (!Array.isArray(t)) return;
  const n = [];
  for (const e of t) {
    if (e === null || typeof e != "object" || Array.isArray(e)) continue;
    const i = e, r = i.type;
    if (r !== "inside" && r !== "slider") continue;
    const s = i.xAxisIndex, o = i.start, l = i.end, c = i.minSpan, u = i.maxSpan, p = typeof s == "number" && Number.isFinite(s) ? s : void 0, f = typeof o == "number" && Number.isFinite(o) ? o : void 0, a = typeof l == "number" && Number.isFinite(l) ? l : void 0, w = typeof c == "number" && Number.isFinite(c) ? c : void 0, M = typeof u == "number" && Number.isFinite(u) ? u : void 0;
    n.push({ type: r, xAxisIndex: p, start: f, end: a, minSpan: w, maxSpan: M });
  }
  return n;
}, yn = (t) => Array.isArray(t) ? t.filter((n) => typeof n == "string").map((n) => n.trim()).filter((n) => n.length > 0) : [], fu = (t) => {
  const n = $i("dark");
  if (typeof t == "string") {
    const l = t.trim().toLowerCase();
    return $i(l === "light" ? "light" : "dark");
  }
  if (t === null || typeof t != "object" || Array.isArray(t))
    return n;
  const e = t, i = (l) => {
    const c = e[l];
    if (typeof c != "string") return;
    const u = c.trim();
    return u.length > 0 ? u : void 0;
  }, r = e.fontSize, s = typeof r == "number" && Number.isFinite(r) ? r : void 0, o = yn(e.colorPalette);
  return {
    backgroundColor: i("backgroundColor") ?? n.backgroundColor,
    textColor: i("textColor") ?? n.textColor,
    axisLineColor: i("axisLineColor") ?? n.axisLineColor,
    axisTickColor: i("axisTickColor") ?? n.axisTickColor,
    gridLineColor: i("gridLineColor") ?? n.gridLineColor,
    colorPalette: o.length > 0 ? o : Array.from(n.colorPalette),
    fontFamily: i("fontFamily") ?? n.fontFamily,
    fontSize: s ?? n.fontSize
  };
}, De = (t) => {
  if (typeof t != "string") return;
  const n = t.trim();
  return n.length > 0 ? n : void 0;
}, mu = (t) => {
  if (typeof t != "string") return;
  const n = t.trim().toLowerCase();
  return n === "none" || n === "lttb" || n === "average" || n === "max" || n === "min" || n === "ohlc" ? n : void 0;
}, du = (t) => {
  if (typeof t != "string") return;
  const n = t.trim().toLowerCase();
  return n === "points" || n === "density" ? n : void 0;
}, pu = (t) => {
  if (typeof t != "string") return;
  const n = t.trim().toLowerCase();
  return n === "linear" || n === "sqrt" || n === "log" ? n : void 0;
}, hu = (t) => {
  if (typeof t != "number" || !Number.isFinite(t)) return;
  const n = Math.floor(t);
  return n > 0 ? Math.max(1, n) : void 0;
}, bu = (t) => {
  if (typeof t == "string") {
    const i = t.trim().toLowerCase();
    return i === "viridis" || i === "plasma" || i === "inferno" ? i : void 0;
  }
  if (!Array.isArray(t)) return;
  if (t.length > 0 && t.every((i) => typeof i == "string" && i.length > 0 && i === i.trim())) {
    const i = t;
    return Object.isFrozen(i) || Object.freeze(i), i;
  }
  const e = t.filter((i) => typeof i == "string").map((i) => i.trim()).filter((i) => i.length > 0);
  if (e.length !== 0)
    return Object.freeze(e), e;
}, gu = (t) => {
  if (typeof t != "string") return;
  const n = t.trim().toLowerCase();
  return n === "none" || n === "ohlc" ? n : void 0;
}, ps = (t) => {
  if (typeof t != "number" || !Number.isFinite(t)) return;
  const n = Math.floor(t);
  return n > 0 ? n : void 0;
}, hs = (t) => Array.isArray(t), Yn = (t) => {
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < t.length; s++) {
    const o = t[s], l = hs(o) ? o[0] : o.x, c = hs(o) ? o[1] : o.y;
    !Number.isFinite(l) || !Number.isFinite(c) || (l < n && (n = l), l > e && (e = l), c < i && (i = c), c > r && (r = c));
  }
  if (!(!Number.isFinite(n) || !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r)))
    return n === e && (e = n + 1), i === r && (r = i + 1), { xMin: n, xMax: e, yMin: i, yMax: r };
}, yu = (t) => Array.isArray(t), xu = (t) => {
  if (t.length === 0) return;
  let n = Number.POSITIVE_INFINITY, e = Number.NEGATIVE_INFINITY, i = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY;
  if (yu(t[0])) {
    const o = t;
    for (let l = 0; l < o.length; l++) {
      const c = o[l], u = c[0], p = c[3], f = c[4];
      if (!Number.isFinite(u) || !Number.isFinite(p) || !Number.isFinite(f)) continue;
      const a = Math.min(p, f), w = Math.max(p, f);
      u < n && (n = u), u > e && (e = u), a < i && (i = a), w > r && (r = w);
    }
  } else {
    const o = t;
    for (let l = 0; l < o.length; l++) {
      const c = o[l], u = c.timestamp, p = c.low, f = c.high;
      if (!Number.isFinite(u) || !Number.isFinite(p) || !Number.isFinite(f)) continue;
      const a = Math.min(p, f), w = Math.max(p, f);
      u < n && (n = u), u > e && (e = u), a < i && (i = a), w > r && (r = w);
    }
  }
  if (!(!Number.isFinite(n) || !Number.isFinite(e) || !Number.isFinite(i) || !Number.isFinite(r)))
    return n === e && (e = n + 1), i === r && (r = i + 1), { xMin: n, xMax: e, yMin: i, yMax: r };
}, wu = (t) => {
  throw new Error(
    `Unhandled series type: ${(t == null ? void 0 : t.type) ?? "unknown"}`
  );
};
let bs = !1;
const Fu = () => {
  bs || (console.warn(
    "ChartGPU: Candlestick series rendering is not yet implemented. Series will be skipped."
  ), bs = !0);
};
function Ys(t = {}) {
  var F, b, x, g;
  const n = fu(t.theme), e = t.autoScroll, i = typeof e == "boolean" ? e : se.autoScroll, r = t.animation, o = (typeof r == "boolean" || r !== null && typeof r == "object" && !Array.isArray(r) ? r : void 0) ?? !0, l = yn(t.palette), c = l.length > 0 ? { ...n, colorPalette: l } : n, u = yn(c.colorPalette), p = u.length > 0 ? u : yn(se.palette ?? ei).length > 0 ? yn(se.palette ?? ei) : Array.from(ei), f = p.length > 0 ? p : ["#000000"], a = { ...c, colorPalette: f.slice() }, w = {
    left: ((F = t.grid) == null ? void 0 : F.left) ?? se.grid.left,
    right: ((b = t.grid) == null ? void 0 : b.right) ?? se.grid.right,
    top: ((x = t.grid) == null ? void 0 : x.top) ?? se.grid.top,
    bottom: ((g = t.grid) == null ? void 0 : g.bottom) ?? se.grid.bottom
  }, M = t.xAxis ? {
    ...se.xAxis,
    ...t.xAxis,
    // runtime safety for JS callers
    type: t.xAxis.type ?? se.xAxis.type
  } : { ...se.xAxis }, P = t.yAxis ? {
    ...se.yAxis,
    ...t.yAxis,
    // runtime safety for JS callers
    type: t.yAxis.type ?? se.yAxis.type
  } : { ...se.yAxis }, N = (t.series ?? []).map((m, d) => {
    var I, R, U, G, E, _, X, j, z, rt;
    const v = De(m.color), y = a.colorPalette[d % a.colorPalette.length], C = v ?? y, B = mu(m.sampling) ?? "lttb", T = ps(m.samplingThreshold) ?? 5e3;
    switch (m.type) {
      case "area": {
        const Y = De((I = m.areaStyle) == null ? void 0 : I.color) ?? v ?? y, nt = {
          opacity: ((R = m.areaStyle) == null ? void 0 : R.opacity) ?? ds.opacity,
          color: Y
        }, St = Yn(m.data);
        return {
          ...m,
          rawData: m.data,
          data: an(m.data, B, T),
          color: Y,
          areaStyle: nt,
          sampling: B,
          samplingThreshold: T,
          rawBounds: St
        };
      }
      case "line": {
        const Y = De((U = m.lineStyle) == null ? void 0 : U.color) ?? v ?? y, nt = {
          width: ((G = m.lineStyle) == null ? void 0 : G.width) ?? ms.width,
          opacity: ((E = m.lineStyle) == null ? void 0 : E.opacity) ?? ms.opacity,
          color: Y
        }, { areaStyle: St, ...Ct } = m, ft = Yn(m.data), ot = an(m.data, B, T);
        return {
          ...Ct,
          rawData: m.data,
          data: ot,
          color: Y,
          lineStyle: nt,
          ...m.areaStyle ? {
            areaStyle: {
              opacity: m.areaStyle.opacity ?? ds.opacity,
              // Fill color precedence: areaStyle.color → resolved stroke color
              color: De(m.areaStyle.color) ?? Y
            }
          } : {},
          sampling: B,
          samplingThreshold: T,
          rawBounds: ft
        };
      }
      case "bar": {
        const lt = Yn(m.data);
        return {
          ...m,
          rawData: m.data,
          data: an(m.data, B, T),
          color: C,
          sampling: B,
          samplingThreshold: T,
          rawBounds: lt
        };
      }
      case "scatter": {
        const lt = Yn(m.data), Y = du(m.mode) ?? Hn.mode, nt = hu(m.binSize) ?? Hn.binSize, St = bu(m.densityColormap) ?? Hn.densityColormap, Ct = pu(
          m.densityNormalization
        ) ?? Hn.densityNormalization;
        return {
          ...m,
          rawData: m.data,
          data: an(m.data, B, T),
          color: C,
          mode: Y,
          binSize: nt,
          densityColormap: St,
          densityNormalization: Ct,
          sampling: B,
          samplingThreshold: T,
          rawBounds: lt
        };
      }
      case "pie": {
        const { sampling: lt, samplingThreshold: Y, ...nt } = m, St = (m.data ?? []).map((Ct, ft) => {
          const ot = De(Ct == null ? void 0 : Ct.color), wt = a.colorPalette[(d + ft) % a.colorPalette.length];
          return {
            ...Ct,
            color: ot ?? wt
          };
        });
        return { ...nt, color: C, data: St };
      }
      case "candlestick": {
        Fu();
        const lt = gu(m.sampling) ?? de.sampling, Y = ps(m.samplingThreshold) ?? de.samplingThreshold, nt = {
          upColor: De((_ = m.itemStyle) == null ? void 0 : _.upColor) ?? de.itemStyle.upColor,
          downColor: De((X = m.itemStyle) == null ? void 0 : X.downColor) ?? de.itemStyle.downColor,
          upBorderColor: De((j = m.itemStyle) == null ? void 0 : j.upBorderColor) ?? de.itemStyle.upBorderColor,
          downBorderColor: De((z = m.itemStyle) == null ? void 0 : z.downBorderColor) ?? de.itemStyle.downBorderColor,
          borderWidth: typeof ((rt = m.itemStyle) == null ? void 0 : rt.borderWidth) == "number" && Number.isFinite(m.itemStyle.borderWidth) ? m.itemStyle.borderWidth : de.itemStyle.borderWidth
        }, St = xu(m.data), Ct = lt === "ohlc" && m.data.length > Y ? ki(m.data, Y) : m.data;
        return {
          ...m,
          rawData: m.data,
          data: Ct,
          color: C,
          style: m.style ?? de.style,
          itemStyle: nt,
          barWidth: m.barWidth ?? de.barWidth,
          barMinWidth: m.barMinWidth ?? de.barMinWidth,
          barMaxWidth: m.barMaxWidth ?? de.barMaxWidth,
          sampling: lt,
          samplingThreshold: Y,
          rawBounds: St
        };
      }
      default:
        return wu(m);
    }
  });
  return {
    grid: w,
    xAxis: M,
    yAxis: P,
    autoScroll: i,
    dataZoom: uu(t.dataZoom),
    animation: o,
    theme: a,
    palette: a.colorPalette,
    series: N
  };
}
const vu = 32, Nu = 8, Mu = vu + Nu, Su = (t) => {
  var n;
  return ((n = t.dataZoom) == null ? void 0 : n.some((e) => (e == null ? void 0 : e.type) === "slider")) ?? !1;
};
function Wu(t = {}) {
  const n = { ...Ys(t), tooltip: t.tooltip };
  return Su(t) ? {
    ...n,
    grid: {
      ...n.grid,
      bottom: n.grid.bottom + Mu
    }
  } : n;
}
const Vu = { resolve: Ys };
export {
  Gu as A,
  Fs as G,
  Vu as O,
  Vn as a,
  lc as b,
  Ou as c,
  fc as d,
  Ri as e,
  mc as f,
  de as g,
  se as h,
  Ys as i,
  au as j,
  $i as k,
  cu as l,
  _u as m,
  Lu as n,
  ys as o,
  Fi as p,
  Uu as q,
  Wu as r,
  xs as s,
  ws as t,
  mo as u,
  po as v,
  ts as w,
  pc as x,
  xc as y,
  Gl as z
};
//# sourceMappingURL=OptionResolver-R_gJDRSD.js.map
