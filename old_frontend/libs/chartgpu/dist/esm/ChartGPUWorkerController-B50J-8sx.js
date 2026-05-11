import { o as D, s as $, r as b, c as M, v as k } from "./OptionResolver-R_gJDRSD.js";
const u = 120, F = 1e3 / 60, O = 1.5;
function N(d, e) {
  if (!Number.isInteger(d) || d < 0)
    throw new Error(`Invalid seriesIndex ${e}: ${d}. Must be a non-negative integer.`);
}
function R(d, e) {
  if (!Number.isInteger(d) || d < 0)
    throw new Error(`Invalid pointCount ${e}: ${d}. Must be a non-negative integer.`);
}
function m(d) {
  return d instanceof Error ? [d.message, d.stack] : [String(d), void 0];
}
class L {
  constructor() {
    this.charts = /* @__PURE__ */ new Map(), this.messageHandler = null;
  }
  /**
   * Registers a message handler to send outbound messages to the main thread.
   * 
   * @param handler - Function to call when emitting messages to main thread
   */
  onMessage(e) {
    this.messageHandler = e;
  }
  /**
   * Main entry point for handling inbound messages from the main thread.
   * Routes messages to appropriate handlers with exhaustive type checking.
   * 
   * @param msg - Inbound message from main thread
   */
  async handleMessage(e) {
    try {
      switch (e.type) {
        case "init":
          await this.initChart(e);
          break;
        case "setOption":
          this.handleSetOption(e.chartId, e.options);
          break;
        case "appendData":
          this.handleAppendData(e.chartId, e.seriesIndex, e.data, e.pointCount, e.stride);
          break;
        case "appendDataBatch":
          this.handleAppendDataBatch(e.chartId, e.items);
          break;
        case "resize":
          this.handleResize(e.chartId, e);
          break;
        case "forwardPointerEvent":
          this.handlePointerEvent(e.chartId, e.event);
          break;
        case "setZoomRange":
          this.handleSetZoomRange(e.chartId, e.start, e.end);
          break;
        case "setInteractionX":
          this.handleSetInteractionX(e.chartId, e.x, e.source);
          break;
        case "setAnimation":
          this.handleSetAnimation(e.chartId, e.enabled, e.config);
          break;
        case "setGPUTiming":
          this.handleSetGPUTiming(e.chartId, e.enabled);
          break;
        case "dispose":
          this.disposeChart(e.chartId);
          break;
        default:
          const t = e;
          this.emitError(
            "",
            // No chartId available for unknown message
            "UNKNOWN",
            `Unknown message type: ${t.type}`,
            "handleMessage"
          );
      }
    } catch (t) {
      const r = "chartId" in e ? e.chartId : "", [a, s] = m(t);
      this.emitError(r, "UNKNOWN", a, "handleMessage", s);
    }
  }
  /**
   * Initializes a new chart instance with WebGPU context and render coordinator.
   * 
   * @param msg - Init message containing canvas, options, and configuration
   */
  async initChart(e) {
    var r, a;
    let t = null;
    try {
      if (this.charts.has(e.chartId)) {
        this.emitError(
          e.chartId,
          "UNKNOWN",
          `Chart with ID "${e.chartId}" already exists`,
          "init",
          void 0,
          e.messageId
        );
        return;
      }
      if (e.devicePixelRatio <= 0)
        throw new Error(`Invalid devicePixelRatio: ${e.devicePixelRatio}. Must be positive.`);
      const s = {
        devicePixelRatio: e.devicePixelRatio,
        powerPreference: (r = e.gpuOptions) == null ? void 0 : r.powerPreference
      }, i = D(e.canvas, s);
      let o = await $(i);
      const c = b(e.options);
      t = new MessageChannel();
      const l = {
        renderPending: !1,
        disposed: !1,
        deviceLost: !1,
        performance: {
          frameTimestamps: new Float64Array(u),
          frameTimestampIndex: 0,
          frameTimestampCount: 0,
          totalFrames: 0,
          totalDroppedFrames: 0,
          consecutiveDroppedFrames: 0,
          lastDropTimestamp: 0,
          startTime: performance.now(),
          lastFrameTime: 0,
          gpuTimingEnabled: !1,
          lastCPUTime: 0,
          lastGPUTime: 0
        }
      };
      o.device && (o.device.lost.then((n) => {
        l.deviceLost = !0, this.emit({
          type: "deviceLost",
          chartId: e.chartId,
          reason: n.reason === "destroyed" ? "destroyed" : "unknown",
          message: n.message || n.reason || "Device lost during initialization"
        });
      }).catch(() => {
      }), o.device.addEventListener("uncapturederror", (n) => {
        const g = n.error instanceof GPUValidationError ? `WebGPU Validation Error: ${n.error.message}` : n.error instanceof GPUOutOfMemoryError ? `WebGPU Out of Memory: ${n.error.message}` : `WebGPU Error: ${n.error.message}`;
        this.emitError(e.chartId, "RENDER_ERROR", g, "uncaptured_gpu_error");
      }));
      const I = M(
        o,
        c,
        {
          // CRITICAL: Disable DOM overlays for worker mode
          domOverlays: !1,
          // Request render via MessageChannel for efficient scheduling
          // PERFORMANCE: Use closure-captured state instead of Map lookup (critical for 60fps)
          // CRITICAL: Post to port2, listen on port1 (MessageChannel requires opposite ends)
          onRequestRender: () => {
            !l.renderPending && !l.disposed && t && (l.renderPending = !0, t.port2.postMessage(null));
          },
          // Emit tooltip updates to main thread for DOM rendering
          onTooltipUpdate: (n) => {
            if (this.emit({
              type: "tooltipUpdate",
              chartId: e.chartId,
              data: n
            }), n && n.params.length > 0) {
              const g = n.params[0];
              this.emit({
                type: "hoverChange",
                chartId: e.chartId,
                payload: {
                  seriesIndex: g.seriesIndex,
                  dataIndex: g.dataIndex,
                  value: g.value,
                  x: n.x,
                  y: n.y
                }
              });
            } else
              this.emit({
                type: "hoverChange",
                chartId: e.chartId,
                payload: null
              });
          },
          // Emit legend updates to main thread
          onLegendUpdate: (n) => {
            this.emit({
              type: "legendUpdate",
              chartId: e.chartId,
              items: n
            });
          },
          // Emit axis label updates to main thread
          onAxisLabelsUpdate: (n, g) => {
            this.emit({
              type: "axisLabelsUpdate",
              chartId: e.chartId,
              xLabels: n,
              yLabels: g
            });
          },
          // Emit crosshair position to main thread
          onCrosshairMove: (n) => {
            n !== null && this.emit({
              type: "crosshairMove",
              chartId: e.chartId,
              x: n
            });
          },
          // Emit click events to main thread
          onClickData: (n) => {
            if (!(!n.nearest && !n.pieSlice && !n.candlestick)) {
              if (n.nearest) {
                this.emit({
                  type: "click",
                  chartId: e.chartId,
                  payload: {
                    seriesIndex: n.nearest.seriesIndex,
                    dataIndex: n.nearest.dataIndex,
                    value: n.nearest.point,
                    x: n.x,
                    y: n.y
                  }
                });
                return;
              }
              if (n.pieSlice) {
                this.emit({
                  type: "click",
                  chartId: e.chartId,
                  payload: {
                    seriesIndex: n.pieSlice.seriesIndex,
                    dataIndex: n.pieSlice.dataIndex,
                    value: [n.pieSlice.slice.value, 0],
                    x: n.x,
                    y: n.y
                  }
                });
                return;
              }
              n.candlestick && this.emit({
                type: "click",
                chartId: e.chartId,
                payload: {
                  seriesIndex: n.candlestick.seriesIndex,
                  dataIndex: n.candlestick.dataIndex,
                  value: n.candlestick.point,
                  x: n.x,
                  y: n.y
                }
              });
            }
          },
          // Emit device lost events to main thread
          onDeviceLost: (n) => {
            l.deviceLost = !0, this.emit({
              type: "deviceLost",
              chartId: e.chartId,
              reason: n === "destroyed" ? "destroyed" : "unknown",
              message: n
            });
          }
        }
      );
      I.onZoomRangeChange((n) => {
        this.emit({
          type: "zoomChange",
          chartId: e.chartId,
          start: n.start,
          end: n.end
        });
      });
      const w = {
        chartId: e.chartId,
        gpuContext: o,
        coordinator: I,
        canvas: e.canvas,
        renderChannel: t,
        state: l
        // Shared state object (captured in coordinator callbacks)
      };
      this.charts.set(e.chartId, w);
      const f = I.getZoomRange();
      if (t) {
        const n = e.chartId, g = I, x = l;
        t.port1.onmessage = () => {
          if (!x.disposed && !x.deviceLost) {
            x.renderPending = !1;
            const p = x.performance, y = performance.now();
            try {
              p.frameTimestamps[p.frameTimestampIndex] = y, p.frameTimestampIndex = (p.frameTimestampIndex + 1) % u, p.frameTimestampCount < u && p.frameTimestampCount++, p.totalFrames++, p.lastFrameTime > 0 && (y - p.lastFrameTime > F * O ? (p.totalDroppedFrames++, p.consecutiveDroppedFrames++, p.lastDropTimestamp = y) : p.consecutiveDroppedFrames = 0), p.lastFrameTime = y, g.render();
              const P = performance.now() - y;
              p.lastCPUTime = P;
              const T = this.calculatePerformanceMetrics(p);
              this.emit({
                type: "performance-update",
                chartId: n,
                metrics: T
              });
            } catch (C) {
              const [P, T] = m(C);
              this.emitError(n, "RENDER_ERROR", P, "render", T);
            }
          } else x.deviceLost && (x.renderPending = !1);
        };
      }
      const E = o.adapter ? {
        adapter: "WebGPU Adapter",
        features: o.adapter.features ? [...o.adapter.features] : []
      } : void 0, v = {
        gpuTimingSupported: ((a = o.adapter) == null ? void 0 : a.features.has("timestamp-query")) ?? !1,
        highResTimerSupported: typeof performance < "u" && typeof performance.now == "function",
        performanceMetricsSupported: !0
        // Always supported in worker
      };
      this.emit({
        type: "ready",
        chartId: e.chartId,
        messageId: e.messageId,
        capabilities: E,
        performanceCapabilities: v,
        initialZoomRange: f
      }), !l.renderPending && !l.disposed && t && (l.renderPending = !0, t.port2.postMessage(null));
    } catch (s) {
      if (t)
        try {
          t.port1.close(), t.port2.close();
        } catch {
        }
      const [i, o] = m(s), c = i.includes("WebGPU") ? "WEBGPU_INIT_FAILED" : "UNKNOWN";
      this.emitError(e.chartId, c, i, "init", o, e.messageId);
    }
  }
  /**
   * Updates chart options for an existing instance.
   * 
   * @param chartId - Chart instance identifier
   * @param options - New chart options to apply
   */
  handleSetOption(e, t) {
    try {
      const r = this.getChartInstance(e, "setOption"), a = b(t);
      r.coordinator.setOptions(a);
    } catch (r) {
      const [a, s] = m(r);
      this.emitError(e, "UNKNOWN", a, "setOption", s);
    }
  }
  /**
   * Appends data points to a specific series.
   * 
   * Performance: Uses shared validation helpers to reduce code size and improve performance.
   * 
   * @param chartId - Chart instance identifier
   * @param seriesIndex - Index of the series to append to
   * @param data - ArrayBuffer containing interleaved Float32 point data
   * @param pointCount - Number of points in the buffer
   * @param stride - Bytes per point (8 for DataPoint, 20 for OHLCDataPoint)
   */
  handleAppendData(e, t, r, a, s) {
    try {
      N(t, "in appendData"), R(a, "in appendData");
      const i = this.getChartInstance(e, "appendData"), o = U(r, a, s);
      i.coordinator.appendData(t, o);
    } catch (i) {
      const [o, c] = m(i);
      this.emitError(e, "DATA_ERROR", o, "appendData", c);
    }
  }
  /**
   * Batch appends data to multiple series in a single operation.
   * 
   * Performance optimizations:
   * - Validates all items upfront before processing (fail fast)
   * - Caches instance lookup outside loop
   * - Uses shared validation helpers
   * - Defers render request until all appends complete (batching)
   * 
   * @param chartId - Chart instance identifier
   * @param items - Array of append operations to perform
   */
  handleAppendDataBatch(e, t) {
    try {
      const r = this.getChartInstance(e, "appendDataBatch"), a = t.length;
      for (let s = 0; s < a; s++) {
        const i = t[s];
        N(i.seriesIndex, `at batch index ${s}`), R(i.pointCount, `at batch index ${s}`);
      }
      for (let s = 0; s < a; s++) {
        const i = t[s], o = U(i.data, i.pointCount, i.stride);
        r.coordinator.appendData(i.seriesIndex, o);
      }
    } catch (r) {
      const [a, s] = m(r);
      this.emitError(e, "DATA_ERROR", a, "appendDataBatch", s);
    }
  }
  /**
   * Handles canvas resize events.
   * 
   * @param chartId - Chart instance identifier
   * @param msg - Resize message with new dimensions
   */
  handleResize(e, t) {
    try {
      const r = this.getChartInstance(e, "resize");
      if (r.state.deviceLost)
        throw new Error("Cannot resize: GPU device is lost");
      const { width: a, height: s, devicePixelRatio: i } = t;
      if (a <= 0 || s <= 0)
        throw new Error(`Invalid dimensions: width=${a}, height=${s}. Must be positive.`);
      if (i <= 0)
        throw new Error(`Invalid devicePixelRatio: ${i}. Must be positive.`);
      const o = Math.floor(a * i), c = Math.floor(s * i);
      if (o === 0 || c === 0)
        throw new Error(
          `Computed canvas dimensions are zero: ${o}x${c}. CSS dimensions (${a}x${s}px) are too small for device pixel ratio ${i}. Minimum canvas size is 1px in CSS space.`
        );
      const h = r.gpuContext.device;
      if (!h)
        throw new Error("GPU device is not available");
      const l = h.limits.maxTextureDimension2D, I = Math.max(1, Math.min(o, l)), w = Math.max(1, Math.min(c, l));
      r.canvas.width = I, r.canvas.height = w;
      const f = r.gpuContext.canvasContext, E = r.gpuContext.preferredFormat;
      if (!f)
        throw new Error("Canvas context is not available");
      if (!E)
        throw new Error("Preferred texture format is not available");
      try {
        f.configure({
          device: h,
          format: E,
          alphaMode: r.gpuContext.alphaMode
        });
      } catch (v) {
        throw new Error(
          `Failed to reconfigure canvas context: ${v instanceof Error ? v.message : String(v)}`
        );
      }
      t.requestRender && !r.state.renderPending && !r.state.disposed && (r.state.renderPending = !0, r.renderChannel.port2.postMessage(null));
    } catch (r) {
      const [a, s] = m(r);
      this.emitError(e, "RENDER_ERROR", a, "resize", s);
    }
  }
  /**
   * Forwards a pointer event to the coordinator for interaction handling.
   * 
   * @param chartId - Chart instance identifier
   * @param event - Pre-computed pointer event data from main thread
   */
  handlePointerEvent(e, t) {
    try {
      console.log("[ChartGPUWorkerController] Received pointer event:", {
        type: t.type,
        gridX: t.gridX,
        gridY: t.gridY,
        isInGrid: t.isInGrid
      }), this.getChartInstance(e, "forwardPointerEvent").coordinator.handlePointerEvent(t);
    } catch (r) {
      const [a, s] = m(r);
      this.emitError(e, "UNKNOWN", a, "forwardPointerEvent", s);
    }
  }
  /**
   * Sets the zoom range programmatically.
   * 
   * @param chartId - Chart instance identifier
   * @param start - Start position in percent space [0, 100]
   * @param end - End position in percent space [0, 100]
   */
  handleSetZoomRange(e, t, r) {
    try {
      if (t < 0 || t > 100 || r < 0 || r > 100)
        throw new Error(`Invalid zoom range: [${t}, ${r}]. Values must be in [0, 100] (percent space).`);
      if (t >= r)
        throw new Error(`Invalid zoom range: start (${t}) must be less than end (${r}).`);
      this.getChartInstance(e, "setZoomRange").coordinator.setZoomRange(t, r);
    } catch (a) {
      const [s, i] = m(a);
      this.emitError(e, "UNKNOWN", s, "setZoomRange", i);
    }
  }
  /**
   * Sets the interaction X coordinate for synchronized crosshair display.
   * 
   * @param chartId - Chart instance identifier
   * @param x - X coordinate in CSS pixels, or null to clear
   * @param source - Optional source identifier to prevent echo
   */
  handleSetInteractionX(e, t, r) {
    try {
      this.getChartInstance(e, "setInteractionX").coordinator.setInteractionX(t, r);
    } catch (a) {
      const [s, i] = m(a);
      this.emitError(e, "UNKNOWN", s, "setInteractionX", i);
    }
  }
  /**
   * Enables or disables animation, optionally updating animation configuration.
   * 
   * @param chartId - Chart instance identifier
   * @param enabled - Whether animation should be enabled
   * @param config - Optional animation configuration
   */
  handleSetAnimation(e, t, r) {
    try {
      const a = this.getChartInstance(e, "setAnimation");
      t && !a.state.renderPending && !a.state.disposed && (a.state.renderPending = !0, a.renderChannel.port2.postMessage(null));
    } catch (a) {
      const [s, i] = m(a);
      this.emitError(e, "UNKNOWN", s, "setAnimation", i);
    }
  }
  /**
   * Enables or disables GPU timing for performance metrics.
   * 
   * @param chartId - Chart instance identifier
   * @param enabled - Whether GPU timing should be enabled
   */
  handleSetGPUTiming(e, t) {
    try {
      const r = this.getChartInstance(e, "setGPUTiming");
      r.state.performance.gpuTimingEnabled = t;
    } catch (r) {
      const [a, s] = m(r);
      this.emitError(e, "UNKNOWN", a, "setGPUTiming", s);
    }
  }
  /**
   * Calculates performance metrics from performance tracking state.
   * 
   * @param perfState - Performance tracking state
   * @returns Complete performance metrics
   */
  calculatePerformanceMetrics(e) {
    const t = this.calculateExactFPS(e), r = this.calculateFrameTimeStats(e), a = {
      enabled: e.gpuTimingEnabled,
      cpuTime: e.lastCPUTime,
      gpuTime: e.lastGPUTime
    }, s = {
      used: 0,
      peak: 0,
      allocated: 0
    }, i = {
      totalDrops: e.totalDroppedFrames,
      consecutiveDrops: e.consecutiveDroppedFrames,
      lastDropTimestamp: e.lastDropTimestamp
    }, o = performance.now() - e.startTime;
    return {
      fps: t,
      frameTimeStats: r,
      gpuTiming: a,
      memory: s,
      frameDrops: i,
      totalFrames: e.totalFrames,
      elapsedTime: o
    };
  }
  /**
   * Calculates exact FPS from frame timestamp deltas.
   * 
   * @param perfState - Performance tracking state
   * @returns Exact FPS measurement
   */
  calculateExactFPS(e) {
    const t = e.frameTimestampCount;
    if (t < 2)
      return 0;
    const r = e.frameTimestamps, a = (e.frameTimestampIndex - t + u) % u;
    let s = 0;
    for (let c = 1; c < t; c++) {
      const h = (a + c - 1) % u, l = (a + c) % u, I = r[l] - r[h];
      s += I;
    }
    const i = s / (t - 1);
    return i > 0 ? 1e3 / i : 0;
  }
  /**
   * Calculates frame time statistics.
   * 
   * @param perfState - Performance tracking state
   * @returns Frame time statistics
   */
  calculateFrameTimeStats(e) {
    const t = e.frameTimestampCount;
    if (t < 2)
      return {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    const r = e.frameTimestamps, a = (e.frameTimestampIndex - t + u) % u, s = new Array(t - 1);
    let i = Number.POSITIVE_INFINITY, o = Number.NEGATIVE_INFINITY, c = 0;
    for (let f = 1; f < t; f++) {
      const E = (a + f - 1) % u, v = (a + f) % u, n = r[v] - r[E];
      s[f - 1] = n, n < i && (i = n), n > o && (o = n), c += n;
    }
    const h = c / s.length;
    s.sort((f, E) => f - E);
    const l = Math.floor(s.length * 0.5), I = Math.floor(s.length * 0.95), w = Math.floor(s.length * 0.99);
    return {
      min: i,
      max: o,
      avg: h,
      p50: s[l],
      p95: s[I],
      p99: s[w]
    };
  }
  /**
   * Disposes a chart instance and cleans up all resources.
   * 
   * @param chartId - Chart instance identifier
   */
  disposeChart(e) {
    const t = [];
    try {
      const r = this.charts.get(e);
      if (!r) {
        this.emitError(e, "UNKNOWN", `Chart "${e}" not found`, "dispose");
        return;
      }
      if (r.state.disposed) {
        this.emitError(e, "UNKNOWN", `Chart "${e}" is already disposed`, "dispose");
        return;
      }
      r.state.disposed = !0;
      try {
        r.renderChannel.port1.close(), r.renderChannel.port2.close();
      } catch (a) {
        t.push(`Failed to close render channel: ${a}`);
      }
      try {
        r.coordinator.dispose();
      } catch (a) {
        t.push(`Failed to dispose coordinator: ${a}`);
      }
      try {
        r.gpuContext = k(r.gpuContext);
      } catch (a) {
        t.push(`Failed to destroy GPU context: ${a}`);
      }
      this.charts.delete(e), this.emit({
        type: "disposed",
        chartId: e,
        cleanupErrors: t.length > 0 ? t : void 0
      });
    } catch (r) {
      const [a, s] = m(r);
      this.emitError(e, "UNKNOWN", a, "dispose", s);
    }
  }
  /**
   * Disposes all chart instances and cleans up controller resources.
   * Should be called when the worker is being terminated.
   * 
   * Performance: Uses spread operator instead of Array.from() for slight efficiency gain.
   */
  dispose() {
    const e = [...this.charts.keys()];
    for (const t of e)
      this.disposeChart(t);
    this.messageHandler = null;
  }
  /**
   * Gets a chart instance by ID, throwing if not found, disposed, or device lost.
   * 
   * @param chartId - Chart instance identifier
   * @param operation - Operation name for error reporting
   * @returns Chart instance
   * @throws {Error} If chart not found, disposed, or device lost
   */
  getChartInstance(e, t) {
    const r = this.charts.get(e);
    if (!r)
      throw new Error(`Chart "${e}" not found for operation "${t}"`);
    if (r.state.disposed)
      throw new Error(`Chart "${e}" is disposed and cannot perform "${t}"`);
    if (r.state.deviceLost)
      throw new Error(`Chart "${e}" GPU device is lost and cannot perform "${t}". Re-initialize the chart.`);
    return r;
  }
  /**
   * Emits an outbound message to the main thread.
   * 
   * @param msg - Outbound message to send
   */
  emit(e) {
    this.messageHandler ? this.messageHandler(e) : console.warn("No message handler registered, dropping message:", e);
  }
  /**
   * Emits an error message to the main thread.
   * 
   * @param chartId - Chart instance identifier
   * @param code - Error code for categorization
   * @param message - Error message
   * @param operation - Operation that failed
   * @param stack - Optional stack trace
   * @param messageId - Optional message ID for correlation
   */
  emitError(e, t, r, a, s, i) {
    const o = {
      type: "error",
      chartId: e,
      code: t,
      message: r,
      operation: a,
      stack: s,
      messageId: i
    };
    this.emit(o);
  }
}
function U(d, e, t) {
  if (!d)
    throw new Error("Buffer is null or undefined");
  if (!Number.isInteger(e) || e < 0)
    throw new Error(`Invalid pointCount: ${e}. Must be a non-negative integer.`);
  if (!Number.isInteger(t) || t <= 0)
    throw new Error(`Invalid stride: ${t}. Must be a positive integer.`);
  if (d.byteLength === 0 && e > 0)
    throw new Error(
      "Buffer is detached (byteLength = 0). The ArrayBuffer may have been transferred multiple times. Each ArrayBuffer can only be transferred once via postMessage."
    );
  if (d.byteLength % 4 !== 0)
    throw new Error(
      `Buffer size (${d.byteLength} bytes) is not 4-byte aligned. WebGPU requires all buffer sizes to be multiples of 4 bytes.`
    );
  if (t % 4 !== 0)
    throw new Error(
      `Stride (${t} bytes) is not 4-byte aligned. Float32 data requires stride to be a multiple of 4 bytes.`
    );
  const r = e * t;
  if (d.byteLength !== r)
    throw new Error(
      `Buffer size mismatch: expected ${r} bytes (${e} points × ${t} bytes), got ${d.byteLength} bytes. Difference: ${d.byteLength - r} bytes.`
    );
  const a = new Float32Array(d), s = t / 4, i = e * s;
  if (a.length !== i)
    throw new Error(
      `Float32Array length mismatch: expected ${i} elements, got ${a.length} elements`
    );
  if (t === 8) {
    const o = new Array(e);
    for (let c = 0, h = 0; c < e; c++, h += 2)
      o[c] = [a[h], a[h + 1]];
    return o;
  } else if (t === 20) {
    const o = new Array(e);
    for (let c = 0, h = 0; c < e; c++, h += 5)
      o[c] = [
        a[h],
        // timestamp (index 0 → 0)
        a[h + 1],
        // open     (index 1 → 1)
        a[h + 4],
        // close    (index 4 → 2) ← reordered
        a[h + 3],
        // low      (index 3 → 3)
        a[h + 2]
        // high     (index 2 → 4) ← reordered
      ];
    return o;
  } else
    throw new Error(
      `Invalid stride: ${t} bytes. Expected 8 (DataPoint) or 20 (OHLCDataPoint). Received stride corresponds to ${t / 4} floats per point.`
    );
}
export {
  L as C
};
//# sourceMappingURL=ChartGPUWorkerController-B50J-8sx.js.map
