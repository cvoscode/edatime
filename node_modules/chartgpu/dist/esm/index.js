import { r as $e, G as dt, c as pt, a as je, f as ht, b as gt, d as It, e as yt } from "./OptionResolver-R_gJDRSD.js";
import { O as Jt, g as Kt, u as Qt, m as en, o as tn, q as nn, j as rn, h as sn, v as an, t as on, k as ln, s as cn, l as un, p as mn, n as fn, i as dn } from "./OptionResolver-R_gJDRSD.js";
import { c as xt, a as Mt } from "./createChartInWorker-C4fEeJL8.js";
import { b as hn, C as gn, O as In, X as yn } from "./createChartInWorker-C4fEeJL8.js";
let se = null;
async function bt() {
  return se || (se = (async () => {
    if (typeof window > "u")
      return {
        supported: !1,
        reason: "Not running in a browser environment (window is undefined)."
      };
    if (typeof navigator > "u")
      return {
        supported: !1,
        reason: "Navigator is not available in this environment."
      };
    if (!navigator.gpu)
      return {
        supported: !1,
        reason: "WebGPU API (navigator.gpu) is not available. Your browser does not support WebGPU."
      };
    try {
      let n = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
      });
      return n || (n = await navigator.gpu.requestAdapter()), n ? { supported: !0 } : {
        supported: !1,
        reason: "No compatible WebGPU adapter found. This may occur if: (1) no GPU is available, (2) GPU drivers are outdated or incompatible, (3) running in a VM or headless environment, or (4) WebGPU is disabled in browser settings."
      };
    } catch (n) {
      let s = "Failed to request WebGPU adapter.";
      return n instanceof DOMException ? (s = `Failed to request WebGPU adapter: ${n.name}`, n.message && (s += ` - ${n.message}`)) : n instanceof Error ? s = `Failed to request WebGPU adapter: ${n.message}` : s = `Failed to request WebGPU adapter: ${String(n)}`, { supported: !1, reason: s };
    }
  })(), se);
}
const E = 120, Ft = 1e3 / 60, Tt = 1.5, Nt = 6, St = 500, wt = (n) => Array.isArray(n), ae = (n) => Array.isArray(n), oe = (n) => wt(n) ? { x: n[0], y: n[1] } : { x: n.x, y: n.y }, Je = (n) => ae(n) ? n[0] : n.timestamp, vt = (n) => ae(n) ? n[2] : n.close, Ct = (n) => {
  var s;
  return ((s = n.dataZoom) == null ? void 0 : s.some((l) => (l == null ? void 0 : l.type) === "slider")) ?? !1;
}, ye = (n, s, l) => Math.min(l, Math.max(s, n)), Ke = (n) => {
  let s = Number.POSITIVE_INFINITY, l = Number.NEGATIVE_INFINITY, r = Number.POSITIVE_INFINITY, a = Number.NEGATIVE_INFINITY;
  for (let o = 0; o < n.length; o++) {
    const { x: t, y: u } = oe(n[o]);
    !Number.isFinite(t) || !Number.isFinite(u) || (t < s && (s = t), t > l && (l = t), u < r && (r = u), u > a && (a = u));
  }
  return !Number.isFinite(s) || !Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(a) ? null : (s === l && (l = s + 1), r === a && (a = r + 1), { xMin: s, xMax: l, yMin: r, yMax: a });
}, Pt = (n, s) => {
  if (s.length === 0) return n;
  let l = n;
  if (!l) {
    const u = Ke(s);
    if (!u) return n;
    l = u;
  }
  let r = l.xMin, a = l.xMax, o = l.yMin, t = l.yMax;
  for (let u = 0; u < s.length; u++) {
    const { x: g, y: x } = oe(s[u]);
    !Number.isFinite(g) || !Number.isFinite(x) || (g < r && (r = g), g > a && (a = g), x < o && (o = x), x > t && (t = x));
  }
  return r === a && (a = r + 1), o === t && (t = o + 1), { xMin: r, xMax: a, yMin: o, yMax: t };
}, Et = (n, s) => {
  if (s.length === 0) return n;
  let l = (n == null ? void 0 : n.xMin) ?? Number.POSITIVE_INFINITY, r = (n == null ? void 0 : n.xMax) ?? Number.NEGATIVE_INFINITY, a = (n == null ? void 0 : n.yMin) ?? Number.POSITIVE_INFINITY, o = (n == null ? void 0 : n.yMax) ?? Number.NEGATIVE_INFINITY;
  for (let t = 0; t < s.length; t++) {
    const u = s[t], g = Je(u), x = ae(u) ? u[3] : u.low, F = ae(u) ? u[4] : u.high;
    !Number.isFinite(g) || !Number.isFinite(x) || !Number.isFinite(F) || (g < l && (l = g), g > r && (r = g), x < a && (a = x), F > o && (o = F));
  }
  return !Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(a) || !Number.isFinite(o) ? n : (l === r && (r = l + 1), a === o && (o = a + 1), { xMin: l, xMax: r, yMin: a, yMax: o });
}, xe = (n, s) => {
  let l = Number.POSITIVE_INFINITY, r = Number.NEGATIVE_INFINITY, a = Number.POSITIVE_INFINITY, o = Number.NEGATIVE_INFINITY;
  for (let t = 0; t < n.length; t++) {
    const u = n[t];
    if (u.type === "pie") continue;
    const g = (s == null ? void 0 : s[t]) ?? null;
    if (g) {
      const d = g;
      if (Number.isFinite(d.xMin) && Number.isFinite(d.xMax) && Number.isFinite(d.yMin) && Number.isFinite(d.yMax)) {
        d.xMin < l && (l = d.xMin), d.xMax > r && (r = d.xMax), d.yMin < a && (a = d.yMin), d.yMax > o && (o = d.yMax);
        continue;
      }
    }
    const x = u.rawBounds ?? null;
    if (x) {
      const d = x;
      if (Number.isFinite(d.xMin) && Number.isFinite(d.xMax) && Number.isFinite(d.yMin) && Number.isFinite(d.yMax)) {
        d.xMin < l && (l = d.xMin), d.xMax > r && (r = d.xMax), d.yMin < a && (a = d.yMin), d.yMax > o && (o = d.yMax);
        continue;
      }
    }
    const F = u.data;
    for (let d = 0; d < F.length; d++) {
      const { x: m, y: T } = oe(F[d]);
      !Number.isFinite(m) || !Number.isFinite(T) || (m < l && (l = m), m > r && (r = m), T < a && (a = T), T > o && (o = T));
    }
  }
  return !Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(a) || !Number.isFinite(o) ? { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } : (l === r && (r = l + 1), a === o && (o = a + 1), { xMin: l, xMax: r, yMin: a, yMax: o });
}, Me = (n, s) => {
  let l = n, r = s;
  if ((!Number.isFinite(l) || !Number.isFinite(r)) && (l = 0, r = 1), l === r)
    r = l + 1;
  else if (l > r) {
    const a = l;
    l = r, r = a;
  }
  return { min: l, max: r };
}, te = (n, s) => {
  if (typeof n == "number") return Number.isFinite(n) ? n : null;
  if (typeof n != "string") return null;
  const l = n.trim();
  if (l.length === 0) return null;
  if (l.endsWith("%")) {
    const a = Number.parseFloat(l.slice(0, -1));
    return Number.isFinite(a) ? a / 100 * s : null;
  }
  const r = Number.parseFloat(l);
  return Number.isFinite(r) ? r : null;
}, Rt = (n, s, l) => {
  const r = (n == null ? void 0 : n[0]) ?? "50%", a = (n == null ? void 0 : n[1]) ?? "50%", o = te(r, s), t = te(a, l);
  return {
    x: Number.isFinite(o) ? o : s * 0.5,
    y: Number.isFinite(t) ? t : l * 0.5
  };
}, Dt = (n) => Array.isArray(n), _t = (n, s) => {
  if (n == null) return { inner: 0, outer: s * 0.7 };
  if (Dt(n)) {
    const a = te(n[0], s), o = te(n[1], s), t = Math.max(0, Number.isFinite(a) ? a : 0), u = Math.max(t, Number.isFinite(o) ? o : s * 0.7);
    return { inner: t, outer: Math.min(s, u) };
  }
  const l = te(n, s), r = Math.max(0, Number.isFinite(l) ? l : s * 0.7);
  return { inner: 0, outer: Math.min(s, r) };
};
async function At(n, s) {
  var Ve;
  const l = await bt();
  if (!l.supported) {
    const e = l.reason || "Unknown reason";
    throw new Error(
      `ChartGPU: WebGPU is not available.
Reason: ${e}
Browser support: Chrome/Edge 113+, Safari 18+, Firefox not yet supported.
Resources:
  - MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
  - Browser compatibility: https://caniuse.com/webgpu
  - WebGPU specification: https://www.w3.org/TR/webgpu/
  - Check your system: https://webgpureport.org/`
    );
  }
  const r = document.createElement("canvas");
  r.style.display = "block", r.style.width = "100%", r.style.height = "100%", n.appendChild(r);
  let a = !1, o = null, t = null, u = null, g = null, x = null, F = null, d = s, m = $e(d), T = new Array(m.series.length).fill(null).map(() => []), R = new Array(m.series.length).fill(null), X = null;
  const Te = () => {
    T = new Array(m.series.length).fill(null).map(() => []), R = new Array(m.series.length).fill(null), X = null;
    for (let e = 0; e < m.series.length; e++) {
      const i = m.series[e];
      if (i.type !== "pie")
        if (i.type === "candlestick") {
          const c = i.rawData ?? i.data;
          T[e] = c.length === 0 ? [] : c.slice(), R[e] = i.rawBounds ?? null;
        } else {
          const c = i.rawData ?? i.data;
          T[e] = c.length === 0 ? [] : c.slice(), R[e] = i.rawBounds ?? null ?? Ke(c);
        }
    }
  }, et = () => X || (X = m.series.map((e, i) => e.type === "pie" ? e : e.type === "candlestick" ? { ...e, data: T[i] ?? e.data } : { ...e, data: T[i] ?? e.data }), X);
  Te();
  let W = xe(m.series, R), S = null;
  const D = {
    click: /* @__PURE__ */ new Set(),
    mouseover: /* @__PURE__ */ new Set(),
    mouseout: /* @__PURE__ */ new Set(),
    crosshairMove: /* @__PURE__ */ new Set()
  };
  let w = null, z = null, le = null;
  const Ne = /* @__PURE__ */ new Set();
  let Z = null, B = null, ce = !0;
  const $ = new Float64Array(E);
  let j = 0, _ = 0, Se = 0, we = 0, ue = 0, ve = 0;
  const tt = performance.now();
  let me = 0, Ce = 0;
  const fe = /* @__PURE__ */ new Set(), ne = () => D.mouseover.size > 0 || D.mouseout.size > 0, Pe = () => D.click.size > 0, nt = () => {
    Z !== null && (cancelAnimationFrame(Z), Z = null);
  }, J = () => {
    a || (ce = !0, Z === null && (Z = requestAnimationFrame(() => {
      if (Z = null, a) return;
      const e = performance.now();
      $[j] = e, j = (j + 1) % E, _ < E && _++, Se++, me > 0 && (e - me > Ft * Tt ? (we++, ue++, ve = e) : ue = 0), me = e, re(!1), ce && (ce = !1, t == null || t.render()), Ce = performance.now() - e;
      const c = Ue();
      for (const h of fe)
        try {
          h(c);
        } catch (y) {
          console.error("Error in performance update callback:", y);
        }
    })));
  }, de = () => {
    if (g)
      try {
        g();
      } finally {
        g = null;
      }
  }, Ee = () => {
    F == null || F.dispose(), F = null;
  }, rt = () => {
    x == null || x.remove(), x = null;
  }, Re = () => {
    Ee(), rt();
  }, De = 32, _e = 8, it = De + _e, st = () => {
    if (x) return x;
    try {
      window.getComputedStyle(n).position === "static" && (n.style.position = "relative");
    } catch {
    }
    const e = document.createElement("div");
    return e.style.position = "absolute", e.style.left = "0", e.style.right = "0", e.style.bottom = "0", e.style.height = `${it}px`, e.style.paddingTop = `${_e}px`, e.style.boxSizing = "border-box", e.style.pointerEvents = "auto", e.style.zIndex = "5", n.appendChild(e), x = e, e;
  }, Ae = (e, i) => {
    const c = e.end - e.start;
    return !Number.isFinite(c) || c === 0 ? 0.5 : ye((i - e.start) / c, 0, 1);
  }, at = () => ({ getRange: () => (t == null ? void 0 : t.getZoomRange()) ?? { start: 0, end: 100 }, setRange: (f, p) => {
    t == null || t.setZoomRange(f, p);
  }, zoomIn: (f, p) => {
    if (!Number.isFinite(f) || !Number.isFinite(p) || p <= 1) return;
    const M = t == null ? void 0 : t.getZoomRange();
    if (!M) return;
    const I = ye(f, 0, 100), C = Ae(M, I), N = (M.end - M.start) / p, U = I - C * N;
    t == null || t.setZoomRange(U, U + N);
  }, zoomOut: (f, p) => {
    if (!Number.isFinite(f) || !Number.isFinite(p) || p <= 1) return;
    const M = t == null ? void 0 : t.getZoomRange();
    if (!M) return;
    const I = ye(f, 0, 100), C = Ae(M, I), N = (M.end - M.start) * p, U = I - C * N;
    t == null || t.setZoomRange(U, U + N);
  }, pan: (f) => {
    if (!Number.isFinite(f)) return;
    const p = t == null ? void 0 : t.getZoomRange();
    p && (t == null || t.setZoomRange(p.start + f, p.end + f));
  }, onChange: (f) => (t == null ? void 0 : t.onZoomRangeChange(f)) ?? (() => {
  }) }), pe = () => {
    if (!Ct(d)) {
      Re();
      return;
    }
    if (!t || !t.getZoomRange()) return;
    const i = st();
    F || (F = xt(i, at(), {
      height: De,
      marginTop: 0
      // host provides vertical spacing
    })), F.update(m.theme);
  }, ot = () => {
    de(), !a && t && (g = t.onInteractionXChange((e, i) => {
      H("crosshairMove", { x: e, source: i });
    }));
  }, Ge = () => {
    if (a || !o || !o.initialized) return;
    const e = (t == null ? void 0 : t.getZoomRange()) ?? null;
    de(), Ee(), t == null || t.dispose(), t = pt(o, m, { onRequestRender: J }), u = o.preferredFormat, ot(), e && t.setZoomRange(e.start, e.end), pe();
  }, re = (e) => {
    var A;
    if (a) return;
    const i = r.getBoundingClientRect(), c = window.devicePixelRatio || 1, h = ((A = o == null ? void 0 : o.device) == null ? void 0 : A.limits.maxTextureDimension2D) ?? 8192, y = Math.min(h, Math.max(1, Math.round(i.width * c))), b = Math.min(h, Math.max(1, Math.round(i.height * c))), f = r.width !== y || r.height !== b;
    f && (r.width = y, r.height = b);
    const p = o == null ? void 0 : o.device, M = o == null ? void 0 : o.canvasContext, I = o == null ? void 0 : o.preferredFormat;
    let C = !1;
    p && M && I && (f || !B || B.width !== r.width || B.height !== r.height || B.format !== I) && (M.configure({
      device: p,
      format: I,
      alphaMode: "opaque"
    }), B = { width: r.width, height: r.height, format: I }, C = !0, t && u !== I && Ge()), e && (f || C) && J();
  }, lt = () => re(!0), ke = (e) => {
    const i = r.getBoundingClientRect();
    if (!(i.width > 0) || !(i.height > 0)) return { match: null, isInGrid: !1 };
    const c = e.clientX - i.left, h = e.clientY - i.top, y = m.grid.left, b = m.grid.top, f = i.width - m.grid.left - m.grid.right, p = i.height - m.grid.top - m.grid.bottom;
    if (!(f > 0) || !(p > 0)) return { match: null, isInGrid: !1 };
    const M = c - y, I = h - b;
    if (!(M >= 0 && M <= f && I >= 0 && I <= p)) return { match: null, isInGrid: !1 };
    const A = m.xAxis.min ?? W.xMin, N = m.xAxis.max ?? W.xMax, U = m.yAxis.min ?? W.yMin, mt = m.yAxis.max ?? W.yMax, Y = Me(A, N), ge = (t == null ? void 0 : t.getZoomRange()) ?? null, q = (() => {
      if (!ge) return Y;
      const v = Y.max - Y.min;
      if (!Number.isFinite(v) || v === 0) return Y;
      const P = ge.start, G = ge.end, O = Y.min + P / 100 * v, L = Y.min + G / 100 * v;
      return Me(O, L);
    })(), V = Me(U, mt);
    if (!(S !== null && S.rectWidthCss === i.width && S.rectHeightCss === i.height && S.plotWidthCss === f && S.plotHeightCss === p && S.xDomainMin === q.min && S.xDomainMax === q.max && S.yDomainMin === V.min && S.yDomainMax === V.max)) {
      const v = je().domain(q.min, q.max).range(0, f), P = je().domain(V.min, V.max).range(p, 0);
      S = {
        rectWidthCss: i.width,
        rectHeightCss: i.height,
        plotWidthCss: f,
        plotHeightCss: p,
        xDomainMin: q.min,
        xDomainMax: q.max,
        yDomainMin: V.min,
        yDomainMax: V.max,
        xScale: v,
        yScale: P
      };
    }
    const ee = S, ze = (() => {
      const v = 0.5 * Math.min(f, p);
      if (!(v > 0)) return null;
      for (let P = m.series.length - 1; P >= 0; P--) {
        const G = m.series[P];
        if (G.type !== "pie") continue;
        const O = G, L = Rt(O.center, f, p), ft = _t(O.radius, v), ie = ht(M, I, { seriesIndex: P, series: O }, L, ft);
        if (!ie) continue;
        const Ie = ie.slice.value;
        return {
          kind: "pie",
          seriesIndex: ie.seriesIndex,
          dataIndex: ie.dataIndex,
          sliceValue: typeof Ie == "number" && Number.isFinite(Ie) ? Ie : 0
        };
      }
      return null;
    })();
    if (ze) return { match: ze, isInGrid: !0 };
    for (let v = m.series.length - 1; v >= 0; v--) {
      const P = m.series[v];
      if ((P == null ? void 0 : P.type) !== "candlestick") continue;
      const G = P, O = gt(G, G.data, ee.xScale, f), L = It([G], M, I, ee.xScale, ee.yScale, O);
      if (L)
        return {
          match: { kind: "candlestick", seriesIndex: v, dataIndex: L.dataIndex, point: L.point },
          isInGrid: !0
        };
    }
    const Be = yt(
      et(),
      M,
      I,
      ee.xScale,
      ee.yScale
    );
    return {
      match: Be ? { kind: "cartesian", match: Be } : null,
      isInGrid: !0
    };
  }, ct = () => {
    if (_ < 2)
      return 0;
    const e = (j - _ + E) % E;
    let i = 0;
    for (let y = 1; y < _; y++) {
      const b = (e + y - 1) % E, f = (e + y) % E, p = $[f] - $[b];
      i += p;
    }
    const c = i / (_ - 1);
    return c > 0 ? 1e3 / c : 0;
  }, ut = () => {
    if (_ < 2)
      return {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    const e = (j - _ + E) % E, i = new Array(_ - 1);
    let c = Number.POSITIVE_INFINITY, h = Number.NEGATIVE_INFINITY, y = 0;
    for (let I = 1; I < _; I++) {
      const C = (e + I - 1) % E, A = (e + I) % E, N = $[A] - $[C];
      i[I - 1] = N, N < c && (c = N), N > h && (h = N), y += N;
    }
    const b = y / i.length;
    i.sort((I, C) => I - C);
    const f = Math.floor(i.length * 0.5), p = Math.floor(i.length * 0.95), M = Math.floor(i.length * 0.99);
    return {
      min: c,
      max: h,
      avg: b,
      p50: i[f],
      p95: i[p],
      p99: i[M]
    };
  }, Ue = () => {
    const e = ct(), i = ut(), c = {
      enabled: !1,
      // GPU timing not yet implemented for main thread
      cpuTime: Ce,
      gpuTime: 0
    }, h = {
      used: 0,
      peak: 0,
      allocated: 0
    }, y = {
      totalDrops: we,
      consecutiveDrops: ue,
      lastDropTimestamp: ve
    }, b = performance.now() - tt;
    return {
      fps: e,
      frameTimeStats: i,
      gpuTiming: c,
      memory: h,
      frameDrops: y,
      totalFrames: Se,
      elapsedTime: b
    };
  }, K = (e, i) => {
    if (!e)
      return { seriesIndex: null, dataIndex: null, value: null, seriesName: null, event: i };
    const c = e.kind === "cartesian" ? e.match.seriesIndex : e.seriesIndex, h = e.kind === "cartesian" ? e.match.dataIndex : e.dataIndex, y = m.series[c], b = (y == null ? void 0 : y.name) ?? null, f = b && b.trim().length > 0 ? b : null;
    if (e.kind === "pie")
      return {
        seriesIndex: c,
        dataIndex: h,
        value: [0, e.sliceValue],
        seriesName: f,
        event: i
      };
    if (e.kind === "candlestick") {
      const I = Je(e.point), C = vt(e.point);
      return {
        seriesIndex: c,
        dataIndex: h,
        value: [I, C],
        seriesName: f,
        event: i
      };
    }
    const { x: p, y: M } = oe(e.match.point);
    return {
      seriesIndex: c,
      dataIndex: h,
      value: [p, M],
      seriesName: f,
      event: i
    };
  }, H = (e, i) => {
    if (!a)
      for (const c of D[e]) c(i);
  }, Q = (e, i) => {
    const c = le;
    if (le = e, c === null && e === null) return;
    if (c === null && e !== null) {
      H("mouseover", K(e, i));
      return;
    }
    if (c !== null && e === null) {
      H("mouseout", K(c, i));
      return;
    }
    if (c === null || e === null) return;
    const h = c.kind === "cartesian" ? c.match.seriesIndex : c.seriesIndex, y = c.kind === "cartesian" ? c.match.dataIndex : c.dataIndex, b = e.kind === "cartesian" ? e.match.seriesIndex : e.seriesIndex, f = e.kind === "cartesian" ? e.match.dataIndex : e.dataIndex;
    h === b && y === f || (H("mouseout", K(c, i)), H("mouseover", K(e, i)));
  }, he = (e) => {
    w && e.isPrimary && e.pointerId === w.pointerId && (w = null);
  }, Oe = (e) => {
    if (a || !ne()) return;
    const { match: i, isInGrid: c } = ke(e);
    if (!c) {
      Q(null, e);
      return;
    }
    Q(i, e);
  }, Le = (e) => {
    a || !ne() && !w || (he(e), Q(null, e));
  }, Xe = (e) => {
    a || !ne() && !w || (he(e), Q(null, e));
  }, We = (e) => {
    if (!a && !(!ne() && !w && z !== e.pointerId)) {
      if (z === e.pointerId) {
        z = null;
        return;
      }
      he(e), Q(null, e);
    }
  }, Ze = (e) => {
    if (!a && Pe() && e.isPrimary && !(e.pointerType === "mouse" && e.button !== 0)) {
      w = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startTimeMs: e.timeStamp
      };
      try {
        r.setPointerCapture(e.pointerId);
      } catch {
      }
    }
  }, He = (e) => {
    if (a || !Pe() || !e.isPrimary || !w || e.pointerId !== w.pointerId) return;
    const i = e.timeStamp - w.startTimeMs, c = e.clientX - w.startClientX, h = e.clientY - w.startClientY, y = c * c + h * h;
    w = null;
    try {
      r.hasPointerCapture(e.pointerId) && (z = e.pointerId, r.releasePointerCapture(e.pointerId));
    } catch {
    }
    const b = Nt;
    if (!(i <= St && y <= b * b)) return;
    const { match: p } = ke(e);
    H("click", K(p, e));
  };
  r.addEventListener("pointermove", Oe, { passive: !0 }), r.addEventListener("pointerleave", Le, { passive: !0 }), r.addEventListener("pointercancel", Xe, { passive: !0 }), r.addEventListener("lostpointercapture", We, { passive: !0 }), r.addEventListener("pointerdown", Ze, { passive: !0 }), r.addEventListener("pointerup", He, { passive: !0 });
  const Ye = () => {
    if (!a) {
      a = !0;
      try {
        nt(), Re(), de(), t == null || t.dispose(), t = null, u = null, o == null || o.destroy();
      } finally {
        w = null, z = null, le = null, S = null, r.removeEventListener("pointermove", Oe), r.removeEventListener("pointerleave", Le), r.removeEventListener("pointercancel", Xe), r.removeEventListener("lostpointercapture", We), r.removeEventListener("pointerdown", Ze), r.removeEventListener("pointerup", He), D.click.clear(), D.mouseover.clear(), D.mouseout.clear(), D.crosshairMove.clear(), o = null, r.remove();
      }
    }
  }, qe = {
    get options() {
      return d;
    },
    get disposed() {
      return a;
    },
    setOption(e) {
      a || (d = e, m = $e(e), t == null || t.setOptions(m), Te(), W = xe(m.series, R), S = null, pe(), J());
    },
    appendData(e, i) {
      if (a || !Number.isFinite(e) || e < 0 || e >= m.series.length || !i || i.length === 0) return;
      const c = m.series[e];
      if (c.type === "pie") {
        Ne.has(e) || (Ne.add(e), console.warn(
          `ChartGPU.appendData(${e}, ...): pie series are not supported by streaming append. Use setOption(...) to replace pie data.`
        ));
        return;
      }
      if (t == null || t.appendData(e, i), c.type === "candlestick") {
        const h = T[e] ?? [];
        h.push(...i), T[e] = h, R[e] = Et(
          R[e],
          i
        );
      } else {
        const h = T[e] ?? [];
        h.push(...i), T[e] = h, R[e] = Pt(
          R[e],
          i
        );
      }
      W = xe(m.series, R), X = null, S = null, J();
    },
    resize: lt,
    dispose: Ye,
    on(e, i) {
      a || D[e].add(i);
    },
    off(e, i) {
      D[e].delete(i);
    },
    getInteractionX() {
      return a ? null : (t == null ? void 0 : t.getInteractionX()) ?? null;
    },
    setInteractionX(e, i) {
      a || t == null || t.setInteractionX(e, i);
    },
    setCrosshairX(e, i) {
      a || t == null || t.setInteractionX(e, i);
    },
    onInteractionXChange(e) {
      return a ? () => {
      } : (t == null ? void 0 : t.onInteractionXChange(e)) ?? (() => {
      });
    },
    getZoomRange() {
      return a ? null : (t == null ? void 0 : t.getZoomRange()) ?? null;
    },
    setZoomRange(e, i) {
      a || t == null || t.setZoomRange(e, i);
    },
    getPerformanceMetrics() {
      return a ? null : Ue();
    },
    getPerformanceCapabilities() {
      return a ? null : {
        gpuTimingSupported: !1,
        // Not yet implemented for main thread
        highResTimerSupported: typeof performance < "u" && typeof performance.now == "function",
        performanceMetricsSupported: !0
      };
    },
    onPerformanceUpdate(e) {
      return a ? () => {
      } : (fe.add(e), () => {
        fe.delete(e);
      });
    }
  };
  try {
    re(!1);
    try {
      o = await dt.create(r);
    } catch (e) {
      const i = e instanceof Error ? e.message : String(e);
      throw new Error(
        `ChartGPU: WebGPU is not available.
Reason: ${i}
Browser support: Chrome/Edge 113+, Safari 18+, Firefox not yet supported.
Resources:
  - MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
  - Browser compatibility: https://caniuse.com/webgpu
  - WebGPU specification: https://www.w3.org/TR/webgpu/
  - Check your system: https://webgpureport.org/`
      );
    }
    return (Ve = o.device) == null || Ve.lost.then((e) => {
      a || (e.reason !== "destroyed" && console.warn("WebGPU device lost:", e), Ye());
    }), re(!1), Ge(), pe(), J(), qe;
  } catch (e) {
    throw qe.dispose(), e;
  }
}
const Gt = {
  create: At
};
function Yt(n) {
  const s = Symbol("ChartGPU.connectCharts");
  let l = !1;
  const r = [], a = (o, t) => {
    for (const u of n)
      u !== o && (u.disposed || u.setCrosshairX(t, s));
  };
  for (const o of n) {
    if (o.disposed) continue;
    const t = (g) => {
      l || g.source !== s && (o.disposed || a(o, g.x));
    };
    o.on("crosshairMove", t);
    const u = () => o.off("crosshairMove", t);
    r.push(u);
  }
  return () => {
    if (!l) {
      l = !0;
      for (const o of r) o();
      r.length = 0;
      for (const o of n)
        o.disposed || o.setCrosshairX(null, s);
    }
  };
}
const be = 120, kt = 1e3 / 60, Ut = 1.5, k = /* @__PURE__ */ new Map();
function Fe() {
  const n = Symbol("RenderScheduler"), s = {
    id: n,
    running: !1
  };
  return k.set(n, {
    rafId: null,
    callback: null,
    lastFrameTime: 0,
    dirty: !1,
    frameHandler: null,
    // Performance tracking
    frameTimestamps: new Float64Array(be),
    frameTimestampIndex: 0,
    frameTimestampCount: 0,
    totalFrames: 0,
    totalDroppedFrames: 0,
    consecutiveDroppedFrames: 0,
    lastDropTimestamp: 0,
    startTime: performance.now()
  }), s;
}
function Qe(n, s) {
  if (!s)
    throw new Error("Render callback is required");
  const l = k.get(n.id);
  if (!l)
    throw new Error("Invalid scheduler state. Use createRenderScheduler() to create a new state.");
  if (n.running)
    throw new Error("RenderScheduler is already running. Call stopRenderScheduler() before starting again.");
  l.callback = s, l.lastFrameTime = performance.now(), l.dirty = !0;
  const r = n.id, a = (o) => {
    const t = k.get(r);
    if (!t || !t.callback)
      return;
    t.rafId = null;
    const u = performance.now();
    t.frameTimestamps[t.frameTimestampIndex] = u, t.frameTimestampIndex = (t.frameTimestampIndex + 1) % be, t.frameTimestampCount < be && t.frameTimestampCount++, t.totalFrames++;
    let g = o - t.lastFrameTime;
    const x = 100;
    if (g > x && (g = x), t.lastFrameTime > 0 && g > kt * Ut ? (t.totalDroppedFrames++, t.consecutiveDroppedFrames++, t.lastDropTimestamp = u) : t.lastFrameTime > 0 && (t.consecutiveDroppedFrames = 0), t.lastFrameTime = o, t.dirty) {
      t.dirty = !1, t.callback(g);
      const F = k.get(r);
      F && F.callback && F.dirty && (F.rafId = requestAnimationFrame(a));
    }
  };
  return l.frameHandler = a, l.rafId = requestAnimationFrame(a), {
    id: n.id,
    running: !0
  };
}
function Ot(n) {
  const s = k.get(n.id);
  if (!s)
    throw new Error("Invalid scheduler state. Use createRenderScheduler() to create a new state.");
  return s.callback = null, s.frameHandler = null, s.rafId !== null && (cancelAnimationFrame(s.rafId), s.rafId = null), {
    id: n.id,
    running: !1
  };
}
function Lt(n) {
  const s = k.get(n.id);
  if (!s)
    throw new Error("Invalid scheduler state. Use createRenderScheduler() to create a new state.");
  s.dirty = !0, s.callback !== null && s.rafId === null && (s.lastFrameTime = performance.now(), s.frameHandler && (s.rafId = requestAnimationFrame(s.frameHandler)));
}
function Xt(n) {
  const s = k.get(n.id);
  return s && (s.rafId !== null && (cancelAnimationFrame(s.rafId), s.rafId = null), s.callback = null, s.frameHandler = null, k.delete(n.id)), Fe();
}
function qt(n) {
  const s = Fe();
  return Qe(s, n);
}
class Vt {
  /**
   * Checks if the scheduler is currently running.
   */
  get running() {
    return this._state.running;
  }
  /**
   * Creates a new RenderScheduler instance.
   */
  constructor() {
    this._state = Fe();
  }
  /**
   * Starts the render loop.
   * 
   * @param callback - Function to call each frame with delta time
   * @throws {Error} If callback is not provided or scheduler already running
   */
  start(s) {
    this._state = Qe(this._state, s);
  }
  /**
   * Stops the render loop.
   */
  stop() {
    this._state = Ot(this._state);
  }
  /**
   * Marks the current frame as dirty, indicating it needs to be rendered.
   */
  requestRender() {
    Lt(this._state);
  }
  /**
   * Destroys the render scheduler and cleans up resources.
   * After calling destroy(), the scheduler must be recreated before use.
   */
  destroy() {
    this._state = Xt(this._state);
  }
}
const zt = "1.0.0", Bt = {
  ...Gt,
  createInWorker: Mt
};
export {
  Bt as ChartGPU,
  hn as ChartGPUWorkerError,
  gn as ChartGPUWorkerProxy,
  dt as GPUContext,
  In as OHLC_STRIDE,
  Jt as OptionResolver,
  Vt as RenderScheduler,
  yn as XY_STRIDE,
  Kt as candlestickDefaults,
  Qt as clearScreen,
  Yt as connectCharts,
  en as createCategoryScale,
  At as createChart,
  tn as createGPUContext,
  nn as createGPUContextAsync,
  je as createLinearScale,
  Fe as createRenderScheduler,
  qt as createRenderSchedulerAsync,
  rn as darkTheme,
  sn as defaultOptions,
  an as destroyGPUContext,
  Xt as destroyRenderScheduler,
  on as getCanvasTexture,
  ln as getTheme,
  cn as initializeGPUContext,
  un as lightTheme,
  mn as packDataPoints,
  fn as packOHLCDataPoints,
  Lt as requestRender,
  dn as resolveOptions,
  Qe as startRenderScheduler,
  Ot as stopRenderScheduler,
  zt as version
};
//# sourceMappingURL=index.js.map
