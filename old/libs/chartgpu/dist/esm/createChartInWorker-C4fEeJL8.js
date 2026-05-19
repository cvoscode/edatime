import { w as X, x as G, y as N, z as q, A as B } from "./OptionResolver-R_gJDRSD.js";
const Z = (f, e, t) => Math.min(t, Math.max(e, f)), Y = (f) => {
  let { start: e, end: t } = f;
  if (e > t) {
    const s = e;
    e = t, t = s;
  }
  return { start: Z(e, 0, 100), end: Z(t, 0, 100) };
};
function Q(f, e, t) {
  const s = (t == null ? void 0 : t.height) ?? 32, i = (t == null ? void 0 : t.marginTop) ?? 8, n = (t == null ? void 0 : t.zIndex) ?? 4, a = (t == null ? void 0 : t.showPreview) ?? !1, r = document.createElement("div");
  r.style.display = "block", r.style.width = "100%", r.style.height = `${s}px`, r.style.marginTop = `${i}px`, r.style.boxSizing = "border-box", r.style.position = "relative", r.style.zIndex = `${n}`, r.style.userSelect = "none", r.style.touchAction = "none";
  const o = document.createElement("div");
  o.style.position = "relative", o.style.height = "100%", o.style.width = "100%", o.style.boxSizing = "border-box", o.style.borderRadius = "8px", o.style.borderStyle = "solid", o.style.borderWidth = "1px", o.style.overflow = "hidden", r.appendChild(o);
  const l = document.createElement("div");
  l.style.position = "absolute", l.style.inset = "0", l.style.pointerEvents = "none", l.style.opacity = "0.4", l.style.display = a ? "block" : "none", o.appendChild(l);
  const d = document.createElement("div");
  d.style.position = "absolute", d.style.top = "0", d.style.bottom = "0", d.style.left = "0%", d.style.width = "100%", d.style.boxSizing = "border-box", d.style.cursor = "grab", o.appendChild(d);
  const p = document.createElement("div");
  p.style.position = "absolute", p.style.left = "0", p.style.top = "0", p.style.bottom = "0", p.style.width = "10px", p.style.cursor = "ew-resize", d.appendChild(p);
  const u = document.createElement("div");
  u.style.position = "absolute", u.style.right = "0", u.style.top = "0", u.style.bottom = "0", u.style.width = "10px", u.style.cursor = "ew-resize", d.appendChild(u);
  const h = document.createElement("div");
  h.style.position = "absolute", h.style.left = "10px", h.style.right = "10px", h.style.top = "0", h.style.bottom = "0", h.style.cursor = "grab", d.appendChild(h), f.appendChild(r);
  let g = !1, m = null;
  const b = (c) => {
    const y = Y(c), R = Z(y.end - y.start, 0, 100);
    d.style.left = `${y.start}%`, d.style.width = `${R}%`;
  }, C = () => {
    const c = o.getBoundingClientRect().width;
    return Number.isFinite(c) && c > 0 ? c : null;
  }, w = (c) => {
    const y = C();
    if (y === null) return null;
    const R = c / y * 100;
    return Number.isFinite(R) ? R : null;
  }, E = (c, y) => {
    try {
      c.setPointerCapture(y);
    } catch {
    }
  }, S = (c, y) => {
    try {
      c.releasePointerCapture(y);
    } catch {
    }
  }, I = (c, y) => {
    if (g || c.button !== 0) return;
    c.preventDefault(), m == null || m(), m = null;
    const R = c.clientX, M = e.getRange(), _ = c.currentTarget instanceof Element ? c.currentTarget : d;
    E(_, c.pointerId), y === "pan-window" && (d.style.cursor = "grabbing", h.style.cursor = "grabbing");
    const z = (P) => {
      if (g || P.pointerId !== c.pointerId) return;
      P.preventDefault();
      const D = w(P.clientX - R);
      if (D !== null)
        switch (y) {
          case "left-handle": {
            const k = Math.min(M.end, M.start + D), L = e;
            L.setRangeAnchored ? L.setRangeAnchored(k, M.end, "end") : e.setRange(k, M.end);
            return;
          }
          case "right-handle": {
            const k = Math.max(M.start, M.end + D), L = e;
            L.setRangeAnchored ? L.setRangeAnchored(M.start, k, "start") : e.setRange(M.start, k);
            return;
          }
          case "pan-window": {
            e.setRange(M.start + D, M.end + D);
            return;
          }
        }
    };
    let W = !1;
    const O = () => {
      W || (W = !0, window.removeEventListener("pointermove", z), window.removeEventListener("pointerup", T), window.removeEventListener("pointercancel", T), y === "pan-window" && (d.style.cursor = "grab", h.style.cursor = "grab"), S(_, c.pointerId), m === O && (m = null));
    }, T = (P) => {
      P.pointerId === c.pointerId && O();
    };
    m = O, window.addEventListener("pointermove", z, { passive: !1 }), window.addEventListener("pointerup", T, { passive: !0 }), window.addEventListener("pointercancel", T, { passive: !0 });
  }, x = (c) => I(c, "left-handle"), U = (c) => I(c, "right-handle"), H = (c) => I(c, "pan-window");
  p.addEventListener("pointerdown", x, { passive: !1 }), u.addEventListener("pointerdown", U, { passive: !1 }), h.addEventListener("pointerdown", H, { passive: !1 });
  const F = e.onChange((c) => {
    g || b(c);
  });
  return b(e.getRange()), { update: (c) => {
    if (g) return;
    o.style.background = c.backgroundColor, o.style.borderColor = c.axisLineColor, l.style.background = c.gridLineColor, d.style.background = c.gridLineColor, d.style.border = `1px solid ${c.axisTickColor}`, d.style.borderRadius = "8px", d.style.boxSizing = "border-box";
    const y = `1px solid ${c.axisLineColor}`;
    p.style.background = c.axisTickColor, p.style.borderRight = y, u.style.background = c.axisTickColor, u.style.borderLeft = y, h.style.background = "transparent", h.style.backgroundImage = "linear-gradient(90deg, rgba(255,255,255,0.0) 0, rgba(255,255,255,0.0) 42%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.18) 46%, rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.0) 54%, rgba(255,255,255,0.18) 54%, rgba(255,255,255,0.18) 58%, rgba(255,255,255,0.0) 58%, rgba(255,255,255,0.0) 100%)", h.style.mixBlendMode = "normal";
  }, dispose: () => {
    if (!g) {
      g = !0, m == null || m(), m = null;
      try {
        F();
      } catch {
      }
      p.removeEventListener("pointerdown", x), u.removeEventListener("pointerdown", U), h.removeEventListener("pointerdown", H), r.remove();
    }
  } };
}
const V = 8, j = 20;
class v extends Error {
  constructor(e, t, s, i) {
    super(e), this.code = t, this.operation = s, this.chartId = i, this.name = "ChartGPUWorkerError";
  }
}
let K = 0;
function J() {
  return `msg_${Date.now()}_${++K}`;
}
function ee() {
  return `chart_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
const $ = 40;
function te(f) {
  if (f.length === 0)
    return [new ArrayBuffer(0), 0];
  const e = f[0];
  if (Array.isArray(e) ? e.length === 5 : "timestamp" in e && "open" in e) {
    const i = new ArrayBuffer(f.length * 20), n = new Float32Array(i);
    for (let a = 0, r = 0; a < f.length; a++, r += 5) {
      const o = f[a];
      if (Array.isArray(o))
        n[r] = o[0], n[r + 1] = o[1], n[r + 2] = o[2], n[r + 3] = o[3], n[r + 4] = o[4];
      else {
        const l = o;
        n[r] = l.timestamp, n[r + 1] = l.open, n[r + 2] = l.close, n[r + 3] = l.low, n[r + 4] = l.high;
      }
    }
    return [i, 20];
  } else {
    const i = new ArrayBuffer(f.length * 8), n = new Float32Array(i);
    for (let a = 0, r = 0; a < f.length; a++, r += 2) {
      const o = f[a];
      if (Array.isArray(o))
        n[r] = o[0], n[r + 1] = o[1];
      else {
        const l = o;
        n[r] = l.x, n[r + 1] = l.y;
      }
    }
    return [i, 8];
  }
}
function A(f, e, t) {
  var b, C, w, E, S;
  const s = e.getBoundingClientRect(), i = f.clientX - s.left, n = f.clientY - s.top, a = ((b = t.grid) == null ? void 0 : b.left) ?? 60, r = ((C = t.grid) == null ? void 0 : C.top) ?? 40, o = ((w = t.grid) == null ? void 0 : w.right) ?? 20;
  let l = ((E = t.grid) == null ? void 0 : E.bottom) ?? 40;
  (((S = t.dataZoom) == null ? void 0 : S.some((I) => (I == null ? void 0 : I.type) === "slider")) ?? !1) && (l += $);
  const p = s.width - a - o, u = s.height - r - l, h = i - a, g = n - r, m = h >= 0 && h <= p && g >= 0 && g <= u;
  return {
    x: i,
    y: n,
    gridX: h,
    gridY: g,
    plotWidthCss: p,
    plotHeightCss: u,
    isInGrid: m,
    timestamp: f.timeStamp
  };
}
class se {
  /**
   * Creates a new worker-based chart proxy.
   * 
   * @param config - Worker configuration
   * @param container - HTML element to attach canvas to
   * @param options - Chart options
   */
  constructor(e, t, s) {
    this.container = t, this.isDisposed = !1, this.isInitialized = !1, this.cachedInteractionX = null, this.cachedZoomRange = null, this.cachedSeriesPointCountsForZoom = [], this.cachedPerformanceMetrics = null, this.cachedPerformanceCapabilities = null, this.performanceUpdateCallbacks = /* @__PURE__ */ new Set(), this.pendingRequests = /* @__PURE__ */ new Map(), this.listeners = /* @__PURE__ */ new Map(), this.tooltip = null, this.legend = null, this.textOverlay = null, this.dataZoomSlider = null, this.dataZoomSliderHost = null, this.zoomState = null, this.pendingOverlayUpdates = {}, this.overlayUpdateRafId = null, this.isProcessingWorkerZoomUpdate = !1, this.boundEventHandlers = {
      pointerdown: null,
      pointermove: null,
      pointerup: null,
      pointerleave: null,
      wheel: null
    }, this.pendingMoveEvent = null, this.moveThrottleRafId = null, this.tapCandidate = null, this.TAP_MAX_DISTANCE_PX = 6, this.TAP_MAX_TIME_MS = 500, this.resizeObserver = null, this.currentDpr = 1, this.dprMediaQuery = null, this.boundDprChangeHandler = null, this.pendingResize = null, this.resizeRafId = null, this.worker = e.worker, this.chartId = e.chartId ?? ee(), this.messageTimeout = e.messageTimeout ?? 3e4, this.cachedOptions = s, this.recomputeCachedSeriesPointCountsForZoom(s), this.listeners.set("click", /* @__PURE__ */ new Set()), this.listeners.set("mouseover", /* @__PURE__ */ new Set()), this.listeners.set("mouseout", /* @__PURE__ */ new Set()), this.listeners.set("crosshairMove", /* @__PURE__ */ new Set()), this.boundMessageHandler = this.handleWorkerMessage.bind(this), this.worker.addEventListener("message", this.boundMessageHandler);
  }
  recomputeCachedSeriesPointCountsForZoom(e) {
    const t = e.series ?? [], s = new Array(t.length);
    for (let i = 0; i < t.length; i++) {
      const n = t[i];
      if (!n || n.type === "pie") {
        s[i] = 0;
        continue;
      }
      const a = n.rawData ?? n.data;
      s[i] = Array.isArray(a) ? a.length : 0;
    }
    this.cachedSeriesPointCountsForZoom = s;
  }
  incrementCachedSeriesPointCountForZoom(e, t) {
    if (!Number.isFinite(t) || t <= 0) return;
    const s = Math.floor(t);
    if (s <= 0) return;
    const i = this.cachedSeriesPointCountsForZoom;
    if (e >= i.length)
      for (let n = i.length; n <= e; n++) i[n] = 0;
    i[e] = (i[e] ?? 0) + s;
  }
  /**
   * Initializes the worker chart instance.
   * Must be called before using the chart.
   * 
   * @returns Promise that resolves when worker is ready
   */
  async init() {
    const e = document.createElement("canvas");
    e.style.display = "block", e.style.width = "100%", e.style.height = "100%", this.container.appendChild(e);
    const t = e.getBoundingClientRect(), s = window.devicePixelRatio || 1, i = Math.max(1, Math.round(t.width * s)), n = Math.max(1, Math.round(t.height * s));
    e.width = i, e.height = n, this.setupEventListeners(e), this.setupResizeObserver(e), this.setupDevicePixelRatioMonitoring(), this.createOverlays();
    const a = e.transferControlToOffscreen();
    await this.sendMessageWithResponse({
      type: "init",
      chartId: this.chartId,
      messageId: J(),
      canvas: a,
      devicePixelRatio: s,
      options: this.cachedOptions
    }, [a]);
  }
  // =============================================================================
  // Event Forwarding to Worker
  // =============================================================================
  /**
   * Sets up pointer and wheel event listeners on the canvas.
   * Forwards events to worker for interaction handling (hover, click, zoom, pan).
   * 
   * @param canvas - Canvas element to attach listeners to
   */
  setupEventListeners(e) {
    this.isDisposed || (this.boundEventHandlers.pointerdown = (t) => {
      this.isDisposed || !this.isInitialized || t.isPrimary && t.button === 0 && (this.tapCandidate = {
        startX: t.clientX,
        startY: t.clientY,
        startTime: t.timeStamp
      });
    }, this.boundEventHandlers.pointermove = (t) => {
      this.isDisposed || !this.isInitialized || (this.pendingMoveEvent = t, this.moveThrottleRafId === null && (this.moveThrottleRafId = requestAnimationFrame(() => {
        if (this.moveThrottleRafId = null, this.isDisposed || !this.isInitialized || !this.pendingMoveEvent) return;
        const s = this.container.querySelector("canvas");
        if (!s) return;
        const i = A(this.pendingMoveEvent, s, this.cachedOptions);
        this.pendingMoveEvent = null, console.log("[ChartGPUWorkerProxy] Sending move event:", {
          gridX: i.gridX,
          gridY: i.gridY,
          isInGrid: i.isInGrid
        }), this.sendMessage({
          type: "forwardPointerEvent",
          chartId: this.chartId,
          event: {
            ...i,
            type: "move"
          }
        });
      })));
    }, this.boundEventHandlers.pointerup = (t) => {
      if (!(this.isDisposed || !this.isInitialized) && t.isPrimary && this.tapCandidate) {
        const s = t.timeStamp - this.tapCandidate.startTime, i = t.clientX - this.tapCandidate.startX, n = t.clientY - this.tapCandidate.startY, a = Math.sqrt(i * i + n * n);
        if (this.tapCandidate = null, s <= this.TAP_MAX_TIME_MS && a <= this.TAP_MAX_DISTANCE_PX) {
          const r = this.container.querySelector("canvas");
          if (!r) return;
          const o = A(t, r, this.cachedOptions);
          console.log("[ChartGPUWorkerProxy] Sending click event:", {
            gridX: o.gridX,
            gridY: o.gridY,
            isInGrid: o.isInGrid
          }), this.sendMessage({
            type: "forwardPointerEvent",
            chartId: this.chartId,
            event: {
              ...o,
              type: "click"
            }
          });
        }
      }
    }, this.boundEventHandlers.pointerleave = (t) => {
      if (this.isDisposed || !this.isInitialized) return;
      this.tapCandidate = null;
      const s = this.container.querySelector("canvas");
      if (!s) return;
      const i = A(t, s, this.cachedOptions);
      this.sendMessage({
        type: "forwardPointerEvent",
        chartId: this.chartId,
        event: {
          ...i,
          type: "leave"
        }
      });
    }, this.boundEventHandlers.wheel = (t) => {
      var C, w, E, S, I;
      if (this.isDisposed || !this.isInitialized) return;
      const s = e.getBoundingClientRect(), i = t.clientX - s.left, n = t.clientY - s.top, a = ((C = this.cachedOptions.grid) == null ? void 0 : C.left) ?? 60, r = ((w = this.cachedOptions.grid) == null ? void 0 : w.top) ?? 40, o = ((E = this.cachedOptions.grid) == null ? void 0 : E.right) ?? 20;
      let l = ((S = this.cachedOptions.grid) == null ? void 0 : S.bottom) ?? 40;
      (((I = this.cachedOptions.dataZoom) == null ? void 0 : I.some((x) => (x == null ? void 0 : x.type) === "slider")) ?? !1) && (l += $);
      const p = s.width - a - o, u = s.height - r - l, h = i - a, g = n - r, m = h >= 0 && h <= p && g >= 0 && g <= u, b = {
        type: "wheel",
        x: i,
        y: n,
        gridX: h,
        gridY: g,
        plotWidthCss: p,
        plotHeightCss: u,
        isInGrid: m,
        timestamp: t.timeStamp,
        deltaX: t.deltaX,
        deltaY: t.deltaY,
        deltaZ: t.deltaZ,
        deltaMode: t.deltaMode
      };
      this.sendMessage({
        type: "forwardPointerEvent",
        chartId: this.chartId,
        event: b
      }), m && t.preventDefault();
    }, e.addEventListener("pointerdown", this.boundEventHandlers.pointerdown), e.addEventListener("pointermove", this.boundEventHandlers.pointermove), e.addEventListener("pointerup", this.boundEventHandlers.pointerup), e.addEventListener("pointerleave", this.boundEventHandlers.pointerleave), e.addEventListener("wheel", this.boundEventHandlers.wheel, { passive: !1 }));
  }
  /**
   * Removes all event listeners from the canvas and cleans up RAF throttling.
   */
  cleanupEventListeners() {
    const e = this.container.querySelector("canvas");
    e && (this.moveThrottleRafId !== null && (cancelAnimationFrame(this.moveThrottleRafId), this.moveThrottleRafId = null), this.pendingMoveEvent = null, this.tapCandidate = null, this.boundEventHandlers.pointerdown && (e.removeEventListener("pointerdown", this.boundEventHandlers.pointerdown), this.boundEventHandlers.pointerdown = null), this.boundEventHandlers.pointermove && (e.removeEventListener("pointermove", this.boundEventHandlers.pointermove), this.boundEventHandlers.pointermove = null), this.boundEventHandlers.pointerup && (e.removeEventListener("pointerup", this.boundEventHandlers.pointerup), this.boundEventHandlers.pointerup = null), this.boundEventHandlers.pointerleave && (e.removeEventListener("pointerleave", this.boundEventHandlers.pointerleave), this.boundEventHandlers.pointerleave = null), this.boundEventHandlers.wheel && (e.removeEventListener("wheel", this.boundEventHandlers.wheel), this.boundEventHandlers.wheel = null));
  }
  // =============================================================================
  // ResizeObserver and Device Pixel Ratio Monitoring
  // =============================================================================
  /**
   * Sets up ResizeObserver to monitor container size changes.
   * Uses RAF batching to throttle rapid resize events (e.g., during window drag-resize).
   * 
   * @param canvas - Canvas element to measure dimensions from
   */
  setupResizeObserver(e) {
    if (this.isDisposed) return;
    let t = e.clientWidth, s = e.clientHeight;
    this.resizeObserver = new ResizeObserver((i) => {
      var o;
      if (this.isDisposed || !i[0]) return;
      const n = (o = i[0].contentBoxSize) == null ? void 0 : o[0];
      if (!n) return;
      const a = n.inlineSize, r = n.blockSize;
      a === t && r === s || (t = a, s = r, this.pendingResize = { width: a, height: r }, this.resizeRafId === null && (this.resizeRafId = requestAnimationFrame(() => {
        if (this.resizeRafId = null, this.isDisposed || !this.pendingResize) return;
        const { width: l, height: d } = this.pendingResize;
        this.pendingResize = null;
        const p = this.currentDpr;
        this.sendMessage({
          type: "resize",
          chartId: this.chartId,
          width: Math.max(1, l),
          // CSS pixels, minimum 1
          height: Math.max(1, d),
          // CSS pixels, minimum 1
          devicePixelRatio: p,
          requestRender: !0
        });
      })));
    }), this.resizeObserver.observe(e);
  }
  /**
   * Sets up device pixel ratio monitoring using matchMedia.
   * Handles window zoom, moving between displays, and OS display scaling changes.
   */
  setupDevicePixelRatioMonitoring() {
    this.isDisposed || (this.currentDpr = window.devicePixelRatio || 1, this.dprMediaQuery = window.matchMedia(`(resolution: ${this.currentDpr}dppx)`), this.boundDprChangeHandler = (e) => {
      if (this.isDisposed) return;
      const t = window.devicePixelRatio || 1;
      if (t === this.currentDpr) return;
      this.currentDpr = t, this.dprMediaQuery && this.boundDprChangeHandler && this.dprMediaQuery.removeEventListener("change", this.boundDprChangeHandler), this.dprMediaQuery = window.matchMedia(`(resolution: ${this.currentDpr}dppx)`), this.boundDprChangeHandler && this.dprMediaQuery.addEventListener("change", this.boundDprChangeHandler);
      const s = this.container.querySelector("canvas");
      if (!s) return;
      const i = s.clientWidth, n = s.clientHeight;
      this.sendMessage({
        type: "resize",
        chartId: this.chartId,
        width: Math.max(1, i),
        // CSS pixels
        height: Math.max(1, n),
        // CSS pixels
        devicePixelRatio: this.currentDpr,
        requestRender: !0
      });
    }, this.dprMediaQuery.addEventListener("change", this.boundDprChangeHandler));
  }
  /**
   * Cleans up ResizeObserver and device pixel ratio monitoring.
   */
  cleanupResizeMonitoring() {
    this.resizeObserver && (this.resizeObserver.disconnect(), this.resizeObserver = null), this.resizeRafId !== null && (cancelAnimationFrame(this.resizeRafId), this.resizeRafId = null), this.pendingResize = null, this.dprMediaQuery && this.boundDprChangeHandler && (this.dprMediaQuery.removeEventListener("change", this.boundDprChangeHandler), this.dprMediaQuery = null, this.boundDprChangeHandler = null);
  }
  // =============================================================================
  // DOM Overlay Management
  // =============================================================================
  /**
   * Creates DOM overlays for tooltip, legend, text labels, and data zoom slider.
   * Called after canvas is appended to container.
   */
  createOverlays() {
    var t, s, i;
    if (this.isDisposed) return;
    if (this.tooltip = X(this.container), this.textOverlay = G(this.container), this.legend = N(this.container, "right"), ((t = this.cachedOptions.dataZoom) == null ? void 0 : t.some((n) => (n == null ? void 0 : n.type) === "slider")) ?? !1) {
      const n = ((s = this.cachedZoomRange) == null ? void 0 : s.start) ?? 0, a = ((i = this.cachedZoomRange) == null ? void 0 : i.end) ?? 100, r = this.computeZoomSpanConstraints(this.cachedOptions);
      this.zoomState = q(n, a, r), this.zoomState.onChange((d) => {
        this.isDisposed || this.isProcessingWorkerZoomUpdate || this.setZoomRange(d.start, d.end);
      }), this.dataZoomSliderHost = this.createDataZoomSliderHost();
      const o = 32;
      this.dataZoomSlider = Q(this.dataZoomSliderHost, this.zoomState, {
        height: o,
        marginTop: 0
        // host provides vertical spacing
      });
      const l = this.resolveThemeConfig();
      this.dataZoomSlider.update(l);
    }
  }
  /**
   * Creates and configures the data zoom slider host element.
   * The host is absolutely positioned at the bottom of the container.
   * 
   * @returns Host element for the data zoom slider
   */
  createDataZoomSliderHost() {
    try {
      window.getComputedStyle(this.container).position === "static" && (this.container.style.position = "relative");
    } catch {
    }
    const e = 32, t = 8, s = e + t, i = document.createElement("div");
    return i.style.position = "absolute", i.style.left = "0", i.style.right = "0", i.style.bottom = "0", i.style.height = `${s}px`, i.style.paddingTop = `${t}px`, i.style.boxSizing = "border-box", i.style.pointerEvents = "auto", i.style.zIndex = "10", this.container.appendChild(i), i;
  }
  /**
   * Computes effective zoom span constraints for the local slider zoomState.
   *
   * This must match the worker coordinator's clamping behavior so that:
   * - slider drags clamp identically to wheel zoom in the worker
   * - UI stays perfectly in sync with worker zoomChange messages
   */
  computeZoomSpanConstraints(e) {
    var l;
    const t = (d) => Math.min(100, Math.max(0, d));
    let s = null, i = null;
    for (const d of e.dataZoom ?? [])
      if (d && !(d.type !== "inside" && d.type !== "slider")) {
        if (Number.isFinite(d.minSpan)) {
          const p = t(d.minSpan);
          s = s == null ? p : Math.max(s, p);
        }
        if (Number.isFinite(d.maxSpan)) {
          const p = t(d.maxSpan);
          i = i == null ? p : Math.min(i, p);
        }
      }
    const n = ((l = e.xAxis) == null ? void 0 : l.type) ?? "value";
    let a = null;
    if (n !== "category") {
      let d = 0;
      const p = e.series ?? [];
      for (let u = 0; u < p.length; u++) {
        const h = p[u];
        if (!h || h.type === "pie") continue;
        const g = this.cachedSeriesPointCountsForZoom[u] ?? 0;
        d = Math.max(d, g);
      }
      if (d >= 2) {
        const u = 100 / (d - 1);
        a = Number.isFinite(u) ? t(u) : null;
      }
    }
    return { minSpan: s ?? a ?? 0.5, maxSpan: i ?? 100 };
  }
  /**
   * Resolves ThemeConfig from options, handling both string presets and custom configs.
   */
  resolveThemeConfig() {
    const e = this.cachedOptions.theme, t = {
      colorPalette: [],
      backgroundColor: "#1a1a2e",
      textColor: "#e0e0e0",
      axisLineColor: "rgba(224,224,224,0.2)",
      axisTickColor: "rgba(224,224,224,0.4)",
      gridLineColor: "rgba(224,224,224,0.1)",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: 12
    };
    return !e || typeof e == "string" ? t : {
      colorPalette: e.colorPalette ?? t.colorPalette,
      backgroundColor: e.backgroundColor ?? t.backgroundColor,
      textColor: e.textColor ?? t.textColor,
      axisLineColor: e.axisLineColor ?? t.axisLineColor,
      axisTickColor: e.axisTickColor ?? t.axisTickColor,
      gridLineColor: e.gridLineColor ?? t.gridLineColor,
      fontFamily: e.fontFamily ?? t.fontFamily,
      fontSize: e.fontSize ?? t.fontSize
    };
  }
  /**
   * Disposes all DOM overlays and cleans up RAF batching.
   */
  disposeOverlays() {
    var e, t, s, i, n;
    this.overlayUpdateRafId !== null && (cancelAnimationFrame(this.overlayUpdateRafId), this.overlayUpdateRafId = null), this.pendingOverlayUpdates = {}, (e = this.tooltip) == null || e.dispose(), this.tooltip = null, (t = this.legend) == null || t.dispose(), this.legend = null, (s = this.textOverlay) == null || s.dispose(), this.textOverlay = null, (i = this.dataZoomSlider) == null || i.dispose(), this.dataZoomSlider = null, (n = this.dataZoomSliderHost) == null || n.remove(), this.dataZoomSliderHost = null, this.zoomState = null;
  }
  /**
   * Schedules overlay updates in the next RAF to batch multiple updates.
   * 
   * **Batching strategy**: Worker can send multiple overlay update messages per frame
   * (tooltip + legend + axis labels). By batching them in RAF, we:
   * 1. Reduce layout thrashing (DOM reads/writes grouped)
   * 2. Ensure visual consistency (all overlays update simultaneously)
   * 3. Prevent redundant style calculations (browser optimizes batched changes)
   * 
   * **Concurrency safety**: Uses overlayUpdateRafId guard to prevent duplicate RAF scheduling.
   * Multiple calls within the same frame will coalesce into a single RAF callback.
   */
  scheduleOverlayUpdates() {
    this.isDisposed || this.overlayUpdateRafId === null && (this.overlayUpdateRafId = requestAnimationFrame(() => {
      this.overlayUpdateRafId = null, !this.isDisposed && this.applyPendingOverlayUpdates();
    }));
  }
  /**
   * Applies all pending overlay updates in a single batch.
   */
  applyPendingOverlayUpdates() {
    const { tooltip: e, legend: t, axisLabels: s } = this.pendingOverlayUpdates;
    if (e && this.tooltip && (e.data ? this.tooltip.show(e.data.x, e.data.y, e.data.content) : this.tooltip.hide()), t && this.legend) {
      const i = t.items.map((a) => ({
        type: "line",
        name: a.name,
        color: a.color,
        data: []
      })), n = this.resolveThemeConfig();
      this.legend.update(i, n);
    }
    if (s && this.textOverlay) {
      const i = this.resolveThemeConfig();
      B(
        this.textOverlay,
        s.xLabels,
        s.yLabels,
        i
      );
    }
    this.pendingOverlayUpdates = {};
  }
  // =============================================================================
  // ChartGPUInstance Interface Implementation
  // =============================================================================
  get options() {
    return this.cachedOptions;
  }
  get disposed() {
    return this.isDisposed;
  }
  setOption(e) {
    var n, a, r;
    if (this.isDisposed)
      throw new v(
        "Cannot setOption on disposed chart",
        "DISPOSED",
        "setOption",
        this.chartId
      );
    const s = ((n = this.cachedOptions.dataZoom) == null ? void 0 : n.some((o) => (o == null ? void 0 : o.type) === "slider")) ?? !1, i = ((a = e.dataZoom) == null ? void 0 : a.some((o) => (o == null ? void 0 : o.type) === "slider")) ?? !1;
    if (this.cachedOptions = e, this.recomputeCachedSeriesPointCountsForZoom(e), s !== i)
      this.disposeOverlays(), this.createOverlays();
    else if (i && this.zoomState) {
      const o = this.computeZoomSpanConstraints(e), l = this.zoomState;
      (r = l.setSpanConstraints) == null || r.call(
        l,
        o.minSpan ?? 0.5,
        o.maxSpan ?? 100
      );
    }
    this.sendMessage({
      type: "setOption",
      chartId: this.chartId,
      options: e
    });
  }
  // Implementation
  appendData(e, t, s) {
    var r, o;
    if (this.isDisposed)
      throw new v(
        "Cannot appendData on disposed chart",
        "DISPOSED",
        "appendData",
        this.chartId
      );
    if (!Number.isInteger(e) || e < 0)
      throw new v(
        `Invalid seriesIndex: ${e}. Must be a non-negative integer.`,
        "INVALID_ARGUMENT",
        "appendData",
        this.chartId
      );
    if (t instanceof Float32Array || t instanceof Float64Array) {
      if (!s)
        throw new v(
          "pointType parameter is required when passing typed arrays",
          "INVALID_ARGUMENT",
          "appendData",
          this.chartId
        );
      const l = t;
      if (l.length === 0)
        return;
      const d = s === "xy" ? 2 : 5, p = l.length / d, u = s === "xy" ? V : j;
      if (l.length % d !== 0)
        throw new v(
          `Invalid typed array length: ${l.length}. Expected multiple of ${d} for '${s}' points.`,
          "INVALID_ARGUMENT",
          "appendData",
          this.chartId
        );
      let h;
      if (l instanceof Float64Array ? h = new Float32Array(l) : h = l, h.buffer.byteLength === 0) {
        console.error(
          "ChartGPU: Cannot transfer detached ArrayBuffer. The buffer may have already been transferred to another context."
        );
        return;
      }
      const g = p * u, m = h.byteLength;
      if (m !== g && console.warn(
        `ChartGPU: Data buffer size mismatch. Expected ${g} bytes (${p} points × ${u} stride), got ${m} bytes.`
      ), h.byteLength % 4 !== 0)
        throw new v(
          `Buffer size (${h.byteLength} bytes) is not 4-byte aligned (WebGPU requirement)`,
          "INVALID_ARGUMENT",
          "appendData",
          this.chartId
        );
      let b;
      if (h.byteOffset === 0 && h.byteLength === h.buffer.byteLength ? b = h.buffer : (b = h.buffer.slice(h.byteOffset, h.byteOffset + h.byteLength), console.warn(
        `ChartGPU: Typed array uses a subarray view (byteOffset=${h.byteOffset}). A buffer copy is required for transfer. For best performance, ensure typed arrays own their entire underlying buffer.`
      )), this.incrementCachedSeriesPointCountForZoom(e, p), this.zoomState) {
        const C = this.computeZoomSpanConstraints(this.cachedOptions), w = this.zoomState;
        (r = w.setSpanConstraints) == null || r.call(
          w,
          C.minSpan ?? 0.5,
          C.maxSpan ?? 100
        );
      }
      this.sendMessage({
        type: "appendData",
        chartId: this.chartId,
        seriesIndex: e,
        data: b,
        pointCount: p,
        stride: u
      }, [b]);
      return;
    }
    const i = t;
    if (!i || i.length === 0)
      return;
    Array.isArray(i) && i.length > 1e4 && console.warn(
      `ChartGPU: appendData called with ${i.length.toLocaleString()} points as array. Consider using Float32Array for better performance:

  import { packDataPoints } from 'chart-gpu';
  const packed = packDataPoints(points);
  chart.appendData(seriesIndex, packed, 'xy');

This can reduce memory usage by 50% and eliminate serialization overhead (~${(i.length * 2e-5).toFixed(2)}ms saved per append).`
    );
    const [n, a] = te(i);
    if (this.incrementCachedSeriesPointCountForZoom(e, i.length), this.zoomState) {
      const l = this.computeZoomSpanConstraints(this.cachedOptions), d = this.zoomState;
      (o = d.setSpanConstraints) == null || o.call(
        d,
        l.minSpan ?? 0.5,
        l.maxSpan ?? 100
      );
    }
    this.sendMessage({
      type: "appendData",
      chartId: this.chartId,
      seriesIndex: e,
      data: n,
      pointCount: i.length,
      stride: a
    }, [n]);
  }
  resize() {
    if (this.isDisposed)
      return;
    const e = this.container.querySelector("canvas");
    if (!e) {
      console.warn("ChartGPUWorkerProxy.resize(): Canvas not found in container");
      return;
    }
    const t = e.getBoundingClientRect(), s = window.devicePixelRatio || 1, i = Math.max(1, t.width), n = Math.max(1, t.height);
    this.sendMessage({
      type: "resize",
      chartId: this.chartId,
      width: i,
      height: n,
      devicePixelRatio: s,
      requestRender: !0
    });
  }
  dispose() {
    if (this.isDisposed)
      return;
    this.isDisposed = !0, this.isInitialized = !1, this.cleanupEventListeners(), this.cleanupResizeMonitoring(), this.disposeOverlays(), this.sendMessage({
      type: "dispose",
      chartId: this.chartId
    });
    for (const t of this.pendingRequests.values())
      clearTimeout(t.timeout), t.reject(new v(
        "Chart disposed before operation completed",
        "DISPOSED",
        t.operation,
        this.chartId
      ));
    this.pendingRequests.clear();
    for (const t of this.listeners.values())
      t.clear();
    this.worker.removeEventListener("message", this.boundMessageHandler);
    const e = this.container.querySelector("canvas");
    e && e.remove();
  }
  on(e, t) {
    if (this.isDisposed)
      return;
    const s = this.listeners.get(e);
    s && s.add(t);
  }
  off(e, t) {
    const s = this.listeners.get(e);
    s && s.delete(t);
  }
  getInteractionX() {
    return this.isDisposed ? null : this.cachedInteractionX;
  }
  setInteractionX(e, t) {
    this.isDisposed || (this.cachedInteractionX = e, this.sendMessage({
      type: "setInteractionX",
      chartId: this.chartId,
      x: e,
      source: t
    }));
  }
  setCrosshairX(e, t) {
    this.setInteractionX(e, t);
  }
  onInteractionXChange(e) {
    const t = (s) => {
      e(s.x, s.source);
    };
    return this.on("crosshairMove", t), () => {
      this.off("crosshairMove", t);
    };
  }
  getZoomRange() {
    return this.isDisposed ? null : this.cachedZoomRange;
  }
  setZoomRange(e, t) {
    if (!this.isDisposed) {
      if (e < 0 || e > 100 || t < 0 || t > 100)
        throw new v(
          `Invalid zoom range: [${e}, ${t}]. Values must be in [0, 100] (percent space).`,
          "INVALID_ARGUMENT",
          "setZoomRange",
          this.chartId
        );
      if (e >= t)
        throw new v(
          `Invalid zoom range: start (${e}) must be less than end (${t}).`,
          "INVALID_ARGUMENT",
          "setZoomRange",
          this.chartId
        );
      this.cachedZoomRange = { start: e, end: t }, this.sendMessage({
        type: "setZoomRange",
        chartId: this.chartId,
        start: e,
        end: t
      });
    }
  }
  /**
   * Gets the latest performance metrics from the worker.
   * Returns cached metrics updated every frame.
   * 
   * @returns Current performance metrics, or null if not available yet
   */
  getPerformanceMetrics() {
    return this.isDisposed ? null : this.cachedPerformanceMetrics;
  }
  /**
   * Gets the performance capabilities of the worker environment.
   * Indicates which performance features are supported.
   * 
   * @returns Performance capabilities, or null if not initialized yet
   */
  getPerformanceCapabilities() {
    return this.isDisposed ? null : this.cachedPerformanceCapabilities;
  }
  /**
   * Registers a callback to be notified of performance metric updates.
   * Callback is invoked every frame with the latest metrics.
   * 
   * @param callback - Function to call with updated metrics
   * @returns Unsubscribe function to remove the callback
   */
  onPerformanceUpdate(e) {
    return this.isDisposed ? () => {
    } : (this.performanceUpdateCallbacks.add(e), () => {
      this.performanceUpdateCallbacks.delete(e);
    });
  }
  /**
   * Enables or disables GPU timing for performance metrics.
   * GPU timing requires the 'timestamp-query' WebGPU feature.
   * 
   * @param enabled - Whether to enable GPU timing
   */
  setGPUTiming(e) {
    this.isDisposed || this.sendMessage({
      type: "setGPUTiming",
      chartId: this.chartId,
      enabled: e
    });
  }
  // =============================================================================
  // Worker Communication
  // =============================================================================
  /**
   * Sends a message to the worker without expecting a response.
   * 
   * @param message - Message to send
   * @param transfer - Optional transferable objects
   */
  sendMessage(e, t) {
    if (!this.isDisposed)
      try {
        t && t.length > 0 ? this.worker.postMessage(e, t) : this.worker.postMessage(e);
      } catch (s) {
        throw new v(
          `Failed to send message to worker: ${s instanceof Error ? s.message : String(s)}`,
          "COMMUNICATION_ERROR",
          e.type,
          this.chartId
        );
      }
  }
  /**
   * Sends a message to the worker and waits for a response.
   * 
   * **Message Correlation**: Uses unique messageId to match request/response pairs.
   * The worker MUST echo the messageId in its response for correlation to work.
   * 
   * **Timeout Behavior**: 
   * - Default timeout: 30 seconds (configurable via WorkerConfig.messageTimeout)
   * - On timeout: Promise rejects with TIMEOUT error and pending request is cleaned up
   * - Prevents indefinite promise accumulation if worker hangs or message is lost
   * - Timeout starts when message is sent (not when promise is created)
   * 
   * **Error Handling**:
   * - Send failure: Immediately rejects and cleans up timeout
   * - Worker error: Rejects with error from ErrorMessage (matched by messageId)
   * - Disposal: All pending requests rejected with DISPOSED error
   * 
   * **Concurrency Safety**: Multiple concurrent requests are supported via Map-based tracking.
   * Each request has a unique messageId, preventing response cross-contamination.
   * 
   * @param message - Message to send (must have messageId)
   * @param transfer - Optional transferable objects (e.g., OffscreenCanvas, ArrayBuffer)
   * @returns Promise that resolves with the response or rejects on timeout/error
   */
  sendMessageWithResponse(e, t) {
    return new Promise((s, i) => {
      const { messageId: n } = e, a = setTimeout(() => {
        this.pendingRequests.delete(n), i(new v(
          `Operation "${e.type}" timed out after ${this.messageTimeout}ms. Worker may be unresponsive or message was lost.`,
          "TIMEOUT",
          e.type,
          this.chartId
        ));
      }, this.messageTimeout);
      this.pendingRequests.set(n, {
        resolve: s,
        reject: i,
        timeout: a,
        operation: e.type
      });
      try {
        this.sendMessage(e, t);
      } catch (r) {
        clearTimeout(a), this.pendingRequests.delete(n), i(r);
      }
    });
  }
  /**
   * Handles incoming messages from the worker.
   * Routes messages to appropriate handlers based on type.
   * 
   * @param event - Message event from worker
   */
  handleWorkerMessage(e) {
    const t = e.data;
    if (t.chartId === this.chartId)
      switch (t.type) {
        case "ready":
          this.handleReadyMessage(t);
          break;
        case "rendered":
          break;
        case "performance-update":
          this.handlePerformanceUpdateMessage(t);
          break;
        case "tooltipUpdate":
          this.handleTooltipUpdateMessage(t);
          break;
        case "legendUpdate":
          this.handleLegendUpdateMessage(t);
          break;
        case "axisLabelsUpdate":
          this.handleAxisLabelsUpdateMessage(t);
          break;
        case "hoverChange":
          this.handleHoverChangeMessage(t);
          break;
        case "click":
          this.handleClickMessage(t);
          break;
        case "crosshairMove":
          this.handleCrosshairMoveMessage(t);
          break;
        case "zoomChange":
          this.handleZoomChangeMessage(t);
          break;
        case "deviceLost":
          this.handleDeviceLostMessage(t);
          break;
        case "disposed":
          break;
        case "error":
          this.handleErrorMessage(t);
          break;
        default:
          console.warn("ChartGPUWorkerProxy: Unknown message type:", t.type);
      }
  }
  /**
   * Handles ready message from worker.
   * Resolves the pending init request and caches performance capabilities.
   */
  handleReadyMessage(e) {
    if (this.isInitialized = !0, this.cachedPerformanceCapabilities = e.performanceCapabilities, e.initialZoomRange && (this.cachedZoomRange = { start: e.initialZoomRange.start, end: e.initialZoomRange.end }, this.zoomState)) {
      const s = this.zoomState.getRange();
      if (s.start === 0 && s.end === 100 && (e.initialZoomRange.start !== 0 || e.initialZoomRange.end !== 100)) {
        this.isProcessingWorkerZoomUpdate = !0;
        try {
          this.zoomState.setRange(e.initialZoomRange.start, e.initialZoomRange.end);
        } finally {
          this.isProcessingWorkerZoomUpdate = !1;
        }
      }
    }
    const t = this.pendingRequests.get(e.messageId);
    t && (clearTimeout(t.timeout), this.pendingRequests.delete(e.messageId), t.resolve(e));
  }
  /**
   * Handles hover change messages from worker.
   * Emits mouseover/mouseout events to registered listeners.
   */
  handleHoverChangeMessage(e) {
    if (e.payload) {
      const t = {
        seriesIndex: e.payload.seriesIndex,
        dataIndex: e.payload.dataIndex,
        value: e.payload.value,
        seriesName: null,
        // Worker doesn't send series name
        event: this.createSyntheticPointerEvent(e.payload.x, e.payload.y)
      };
      this.emit("mouseover", t);
    } else {
      const t = {
        seriesIndex: null,
        dataIndex: null,
        value: null,
        seriesName: null,
        event: this.createSyntheticPointerEvent(0, 0)
      };
      this.emit("mouseout", t);
    }
  }
  /**
   * Handles click messages from worker.
   * Emits click events to registered listeners.
   */
  handleClickMessage(e) {
    const t = {
      seriesIndex: e.payload.seriesIndex,
      dataIndex: e.payload.dataIndex,
      value: e.payload.value,
      seriesName: null,
      // Worker doesn't send series name
      event: this.createSyntheticPointerEvent(e.payload.x, e.payload.y)
    };
    this.emit("click", t);
  }
  /**
   * Handles crosshair move messages from worker.
   * Updates cached interaction X and emits crosshairMove events.
   */
  handleCrosshairMoveMessage(e) {
    this.cachedInteractionX = e.x;
    const t = {
      x: e.x,
      source: e.source
    };
    this.emit("crosshairMove", t);
  }
  /**
   * Handles zoom change messages from worker.
   * Updates cached zoom range and zoom state with echo loop prevention.
   * 
   * CRITICAL: Echo suppression strategy
   * - Sets isProcessingWorkerZoomUpdate flag before calling setRange
   * - The onChange callback checks this flag and skips sending message back to worker
   * - This prevents zoom changes originated in the worker from echoing back
   * - UI-originated changes (slider drag) still propagate normally to worker
   */
  handleZoomChangeMessage(e) {
    if (this.cachedZoomRange = { start: e.start, end: e.end }, this.zoomState) {
      const t = this.zoomState.getRange();
      if (t.start !== e.start || t.end !== e.end) {
        this.isProcessingWorkerZoomUpdate = !0;
        try {
          this.zoomState.setRange(e.start, e.end);
        } finally {
          this.isProcessingWorkerZoomUpdate = !1;
        }
      }
    }
  }
  /**
   * Handles device lost messages from worker.
   * Marks chart as disposed and cleans up resources.
   */
  handleDeviceLostMessage(e) {
    console.error(
      `ChartGPU: WebGPU device lost for chart "${this.chartId}".`,
      `Reason: ${e.reason}`,
      e.message ? `Message: ${e.message}` : ""
    ), this.dispose();
  }
  /**
   * Handles error messages from worker.
   * Rejects pending requests or logs errors.
   */
  handleErrorMessage(e) {
    const t = new v(
      e.message,
      e.code,
      e.operation,
      this.chartId
    );
    if (e.messageId) {
      const s = this.pendingRequests.get(e.messageId);
      if (s) {
        clearTimeout(s.timeout), this.pendingRequests.delete(e.messageId), s.reject(t);
        return;
      }
    }
    console.error("ChartGPUWorkerProxy: Worker error:", t);
  }
  /**
   * Handles tooltip update messages from worker.
   * Batches updates via RAF to prevent layout thrashing.
   */
  handleTooltipUpdateMessage(e) {
    this.pendingOverlayUpdates.tooltip = e, this.scheduleOverlayUpdates();
  }
  /**
   * Handles legend update messages from worker.
   * Batches updates via RAF to prevent layout thrashing.
   */
  handleLegendUpdateMessage(e) {
    this.pendingOverlayUpdates.legend = e, this.scheduleOverlayUpdates();
  }
  /**
   * Handles axis labels update messages from worker.
   * Batches updates via RAF to prevent layout thrashing.
   */
  handleAxisLabelsUpdateMessage(e) {
    this.pendingOverlayUpdates.axisLabels = e, this.scheduleOverlayUpdates();
  }
  /**
   * Handles performance update messages from worker.
   * Updates cached metrics and notifies subscribers.
   */
  handlePerformanceUpdateMessage(e) {
    this.cachedPerformanceMetrics = e.metrics;
    for (const t of this.performanceUpdateCallbacks)
      try {
        t(e.metrics);
      } catch (s) {
        console.error("Error in performance update callback:", s);
      }
  }
  /**
   * Emits an event to all registered listeners.
   * 
   * @param eventName - Event name
   * @param payload - Event payload
   */
  emit(e, t) {
    const s = this.listeners.get(e);
    if (s)
      for (const i of s)
        try {
          i(t);
        } catch (n) {
          console.error(`Error in ${e} event handler:`, n);
        }
  }
  /**
   * Creates a synthetic PointerEvent for event payloads.
   * Worker can't transfer real PointerEvents, so we create a minimal synthetic one.
   * 
   * @param x - Canvas-local CSS pixel x coordinate
   * @param y - Canvas-local CSS pixel y coordinate
   * @returns Synthetic PointerEvent
   */
  createSyntheticPointerEvent(e, t) {
    const s = this.container.querySelector("canvas"), i = (s == null ? void 0 : s.getBoundingClientRect()) || { left: 0, top: 0 };
    return new PointerEvent("pointermove", {
      bubbles: !1,
      cancelable: !1,
      clientX: i.left + e,
      clientY: i.top + t,
      pointerId: -1,
      // Synthetic event marker
      pointerType: "mouse",
      isPrimary: !0
    });
  }
}
const ie = 3e4;
async function ae(f, e, t) {
  if (!f || !(f instanceof HTMLElement))
    throw new v(
      "Invalid container: must be an HTMLElement",
      "INVALID_ARGUMENT",
      "createChartInWorker",
      "unknown"
    );
  let s = null, i = !1;
  const n = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  try {
    if (t instanceof Worker)
      s = t, i = !1;
    else if (typeof t == "string" || t instanceof URL)
      try {
        s = new Worker(t, { type: "module" }), i = !0;
      } catch (r) {
        throw new v(
          `Failed to create worker from URL: ${r instanceof Error ? r.message : String(r)}`,
          "WEBGPU_INIT_FAILED",
          "createChartInWorker",
          n
        );
      }
    else
      try {
        s = new Worker(new URL(
          /* @vite-ignore */
          "/assets/worker-entry-Wg897auv.js",
          import.meta.url
        ), { type: "module" }), i = !0;
      } catch (r) {
        throw new v(
          `Failed to create built-in worker: ${r instanceof Error ? r.message : String(r)}`,
          "WEBGPU_INIT_FAILED",
          "createChartInWorker",
          n
        );
      }
    const a = new se(
      {
        worker: s,
        chartId: n,
        messageTimeout: ie
      },
      f,
      e
    );
    try {
      await a.init();
    } catch (r) {
      throw a.dispose(), r;
    }
    return a;
  } catch (a) {
    if (s && i)
      try {
        s.terminate();
      } catch {
      }
    throw a instanceof v ? a : new v(
      `Failed to create worker chart: ${a instanceof Error ? a.message : String(a)}`,
      "UNKNOWN",
      "createChartInWorker",
      n
    );
  }
}
export {
  se as C,
  j as O,
  V as X,
  ae as a,
  v as b,
  Q as c
};
//# sourceMappingURL=createChartInWorker-C4fEeJL8.js.map
