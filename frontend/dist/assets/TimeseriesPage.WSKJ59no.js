import { c as createEffect, o as onMount, a as onCleanup, b as createRenderEffect, s as setStyleProperty, t as template, u as use, d as chartStore, e as createSignal, f as createMemo, g as uiStore, i as insert, m as memo, h as createComponent, j as setAttribute, k as delegateEvents, l as addEventListener, n as className, F as For, S as Show, p as style, q as analyticsStore, r as useNavigate, v as datasetStore } from './index.C65iRSEf.js';
import { g as getActivePlotTemplate, i as init, r as registerTheme, t as toEChartsTheme } from './plotTemplate.L9HyQqsu.js';
import { g as getColorPalette } from './colorScale.CLTVXB24.js';
import { C as ColumnChips } from './ColumnChips.Bi6Jm6lU.js';
import { M as Modal, S as SwitchToggle } from './Dropdown.r_zpDvuI.js';
import { L as LabelsDrawer } from './LabelsDrawer.CpiSVMUc.js';
import { t as tableFromIPC } from './serialization.B92cbl4P.js';
import { f as fetchAnomalies, a as fetchRollingBands } from './api.CIKlHxkp.js';

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
  let chartgpuBlobUrl = null;
  let chartModule = null;
  const activeTemplate = createMemo(() => getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme));
  const echartsThemeName = createMemo(() => `edatime-${activeTemplate().id}`);
  const registerTheme$1 = () => {
    const tmpl = activeTemplate();
    registerTheme(echartsThemeName(), toEChartsTheme(tmpl));
  };
  const initChart = async () => {
    if (!containerRef) return;
    setChartStatus("loading");
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
    if (chartgpuBlobUrl) {
      URL.revokeObjectURL(chartgpuBlobUrl);
      chartgpuBlobUrl = null;
    }
    registerTheme$1();
    try {
      const isDev = false;
      const chartgpuUrl = isDev ? "/frontend/libs/chartgpu/index.js" : "/frontend/libs/chartgpu/index.js";
      if (!chartModule) {
        const resp = await fetch(chartgpuUrl);
        if (!resp.ok) throw new Error(`ChartGPU fetch failed: ${resp.status}`);
        const code = await resp.text();
        const blob = new Blob([code], {
          type: "application/javascript"
        });
        chartgpuBlobUrl = URL.createObjectURL(blob);
        chartModule = await import(
          /* @vite-ignore */
          chartgpuBlobUrl
        );
      }
      const {
        checkWebGPUSupport
      } = chartModule;
      if (checkWebGPUSupport) {
        const result = await checkWebGPUSupport();
        if (!result.supported) {
          throw new Error(`WebGPU unavailable: ${result.reason ?? "unknown reason"}`);
        }
      }
      const createChart = chartModule.createChart ?? chartModule.default?.createChart;
      if (!createChart) throw new Error("createChart not found");
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
      chartInstance = await createChart(containerRef, chartOpts);
      setEngineName("ChartGPU");
      props.onEngineReady?.("ChartGPU");
      setChartStatus("ready");
    } catch (e) {
      console.warn("ChartGPU not available, falling back to ECharts:", e);
      try {
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
        echartsInstance.on("dataZoom", (params) => {
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
    if (chartgpuBlobUrl) {
      URL.revokeObjectURL(chartgpuBlobUrl);
      chartgpuBlobUrl = null;
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
  return {
    xValues,
    series,
    returnedRows: table.numRows,
    downsampled: res.headers.get("x-edatime-downsampled") === "1",
    colorByColumn
  };
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

const page = "_page_1uhv1_1";
const toolbarSeries = "_toolbarSeries_1uhv1_8";
const toolbarGroup = "_toolbarGroup_1uhv1_18";
const toolbarGroupSep = "_toolbarGroupSep_1uhv1_24";
const toolbarGroupPush = "_toolbarGroupPush_1uhv1_29";
const toolbarLabel = "_toolbarLabel_1uhv1_33";
const toolbarTools = "_toolbarTools_1uhv1_40";
const columnFilterInput = "_columnFilterInput_1uhv1_50";
const collapseBtn = "_collapseBtn_1uhv1_60";
const drawSelect = "_drawSelect_1uhv1_76";
const ghostBtn = "_ghostBtn_1uhv1_105";
const panelOpenBtn = "_panelOpenBtn_1uhv1_122";
const disclosureValue = "_disclosureValue_1uhv1_139";
const toolbarKbd = "_toolbarKbd_1uhv1_148";
const zoomRangeBadge = "_zoomRangeBadge_1uhv1_157";
const main = "_main_1uhv1_163";
const emptyState = "_emptyState_1uhv1_185";
const emptyIllustration = "_emptyIllustration_1uhv1_198";
const emptyTitle = "_emptyTitle_1uhv1_203";
const emptyMessage = "_emptyMessage_1uhv1_209";
const emptyActions = "_emptyActions_1uhv1_216";
const primaryBtn = "_primaryBtn_1uhv1_222";
const loadingOverlay = "_loadingOverlay_1uhv1_254";
const loadingSpinner = "_loadingSpinner_1uhv1_267";
const loadingLabel = "_loadingLabel_1uhv1_280";
const overlayStack = "_overlayStack_1uhv1_285";
const colorbarWrap = "_colorbarWrap_1uhv1_295";
const colorbarName = "_colorbarName_1uhv1_303";
const colorbarScale = "_colorbarScale_1uhv1_311";
const colorbarBound = "_colorbarBound_1uhv1_317";
const colorbar = "_colorbar_1uhv1_295";
const distributionLegend = "_distributionLegend_1uhv1_330";
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

var _tmpl$ = /* @__PURE__ */ template(`<option value disabled>Time columns`), _tmpl$2 = /* @__PURE__ */ template(`<option value disabled>Numeric columns`), _tmpl$3 = /* @__PURE__ */ template(`<div data-empty-reason=no-data><div aria-hidden=true><svg viewBox="0 0 80 48"width=120 height=72 fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><rect x=1 y=1 width=78 height=46 rx=8 opacity=0.12></rect><path d="M12 34 L26 22 L36 28 L50 16 L68 32"></path><circle cx=12 cy=34 r=2 fill=currentColor></circle><circle cx=26 cy=22 r=2 fill=currentColor></circle><circle cx=36 cy=28 r=2 fill=currentColor></circle><circle cx=50 cy=16 r=2 fill=currentColor></circle><circle cx=68 cy=32 r=2 fill=currentColor></circle></svg></div><strong>No data loaded</strong><span>Upload a dataset to visualize timeseries data.</span><div><button id=timeseries-empty-upload-btn type=button aria-label="Open upload page">Upload data`), _tmpl$4 = /* @__PURE__ */ template(`<div role=status aria-live=polite aria-label="Chart loading indicator"><div></div><span>Loading data…`), _tmpl$5 = /* @__PURE__ */ template(`<div><div><div role=group aria-label="Series selection tools"><span>X-axis</span><select id=x-axis-select aria-label="Select x-axis column"></select><span>Traces</span><input type=text id=column-filter-input placeholder="Filter columns…"aria-label="Filter columns"><button id=collapse-series-btn type=button title="Collapse series list"><svg viewBox="0 0 16 16"width=12 height=12 fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="4,6 8,10 12,6"></polyline></svg></button></div></div><div><div role=group aria-label="Drawing tools"><span>Draw</span><select id=draw-tool aria-label="Draw tool"><option value=none>None (Pan)</option><option value=zoom>Zoom (drag)</option><option value=arrow>Arrow</option><option value=box>Box</option></select><input type=color id=draw-color title=Color aria-label="Draw color"><input type=number id=draw-width min=1 max=10 title=Thickness aria-label="Draw thickness"><button id=draw-clear-btn type=button title="Clear drawings">Clear Drawings</button></div><div role=group aria-label="Chart label controls"><button type=button title="Edit chart title and axis labels"><span>Labels</span><span>Title + axes</span></button></div><div role=group aria-label="Note and annotation tools"><button type=button title="Open annotation tools"><span>Notes</span><span>Annotations</span></button></div><div role=group aria-label="Export chart and data options"><button id=export-png-btn type=button title="Export chart as PNG (P)">PNG <kbd>P</kbd></button><button id=export-csv-btn type=button title="Export filtered data as CSV (E)">CSV <kbd>E</kbd></button><button type=button title="More export options"><span>More</span><span>SVG, JSON, Parquet</span></button></div><div role=group aria-label="Analytics controls"><button type=button title="Open analytics controls"><span>Analytics</span><span>Bands, anomalies, cleanup</span></button></div><div role=group aria-label="Zoom controls"><button id=zoom-out-btn type=button title="Zoom out">−</button><span id=zoom-range-badge></span><button id=zoom-reset-btn type=button title="Reset zoom to initial view">↺</button></div></div><main id=main><div id=timeseries-overlays><div id=timeseries-colorbar-wrap hidden role=group aria-label="Numeric color column scale"><span id=timeseries-colorbar-name>Color</span><div><span id=timeseries-colorbar-min>0</span><div id=timeseries-colorbar></div><span id=timeseries-colorbar-max>1</span></div></div><div id=timeseries-categorical-wrap hidden role=group aria-label="Categorical color legend"><span id=timeseries-categorical-name>Category</span><div id=timeseries-categorical-legend style=margin-top:8px>`), _tmpl$6 = /* @__PURE__ */ template(`<option>`);
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
      chartStore.setViewport({
        xMin: timeRange[0],
        xMax: timeRange[1],
        yMin: chartStore.state.viewport.yMin,
        yMax: chartStore.state.viewport.yMax
      });
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
    var _el$ = _tmpl$5(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$8 = _el$5.nextSibling, _el$9 = _el$8.nextSibling, _el$0 = _el$9.nextSibling, _el$1 = _el$2.nextSibling, _el$10 = _el$1.firstChild, _el$11 = _el$10.firstChild, _el$12 = _el$11.nextSibling, _el$13 = _el$12.nextSibling, _el$14 = _el$13.nextSibling, _el$15 = _el$14.nextSibling, _el$16 = _el$10.nextSibling, _el$17 = _el$16.firstChild, _el$18 = _el$17.firstChild, _el$19 = _el$18.nextSibling, _el$20 = _el$16.nextSibling, _el$21 = _el$20.firstChild, _el$22 = _el$21.firstChild, _el$23 = _el$22.nextSibling, _el$24 = _el$20.nextSibling, _el$25 = _el$24.firstChild, _el$26 = _el$25.firstChild, _el$27 = _el$26.nextSibling, _el$28 = _el$25.nextSibling, _el$29 = _el$28.firstChild, _el$30 = _el$29.nextSibling, _el$31 = _el$28.nextSibling, _el$32 = _el$31.firstChild, _el$33 = _el$32.nextSibling, _el$34 = _el$24.nextSibling, _el$35 = _el$34.firstChild, _el$36 = _el$35.firstChild, _el$37 = _el$36.nextSibling, _el$38 = _el$34.nextSibling, _el$39 = _el$38.firstChild, _el$40 = _el$39.nextSibling, _el$41 = _el$40.nextSibling, _el$42 = _el$1.nextSibling, _el$52 = _el$42.firstChild, _el$53 = _el$52.firstChild, _el$54 = _el$53.firstChild, _el$55 = _el$54.nextSibling, _el$56 = _el$55.firstChild, _el$57 = _el$56.nextSibling, _el$58 = _el$57.nextSibling, _el$59 = _el$53.nextSibling, _el$60 = _el$59.firstChild, _el$61 = _el$60.nextSibling;
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
            var _el$62 = _tmpl$6();
            _el$62.value = col;
            insert(_el$62, col);
            return _el$62;
          })()
        }), _tmpl$2()];
      }
    }), null);
    insert(_el$5, createComponent(For, {
      get each() {
        return numericCols();
      },
      children: (col) => (() => {
        var _el$63 = _tmpl$6();
        _el$63.value = col;
        insert(_el$63, col);
        return _el$63;
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
          onChange: (cols) => uiStore.setSelectedColumns(cols),
          onColorChange: (col, color) => uiStore.setColumnColor(col, color)
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
    insert(_el$40, zoomBadgeText);
    _el$41.$$click = () => chartStore.resetZoom();
    insert(_el$42, createComponent(ChartView, {
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
    }), _el$52);
    insert(_el$42, createComponent(Show, {
      get when() {
        return !canShowChart();
      },
      get children() {
        var _el$43 = _tmpl$3(), _el$44 = _el$43.firstChild, _el$45 = _el$44.nextSibling, _el$46 = _el$45.nextSibling, _el$47 = _el$46.nextSibling, _el$48 = _el$47.firstChild;
        _el$48.$$click = () => navigate("/upload");
        createRenderEffect((_p$) => {
          var _v$ = styles.emptyState, _v$2 = styles.emptyIllustration, _v$3 = styles.emptyTitle, _v$4 = styles.emptyMessage, _v$5 = styles.emptyActions, _v$6 = styles.primaryBtn;
          _v$ !== _p$.e && className(_el$43, _p$.e = _v$);
          _v$2 !== _p$.t && className(_el$44, _p$.t = _v$2);
          _v$3 !== _p$.a && className(_el$45, _p$.a = _v$3);
          _v$4 !== _p$.o && className(_el$46, _p$.o = _v$4);
          _v$5 !== _p$.i && className(_el$47, _p$.i = _v$5);
          _v$6 !== _p$.n && className(_el$48, _p$.n = _v$6);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0,
          n: void 0
        });
        return _el$43;
      }
    }), _el$52);
    insert(_el$42, createComponent(Show, {
      get when() {
        return isLoading();
      },
      get children() {
        var _el$49 = _tmpl$4(), _el$50 = _el$49.firstChild, _el$51 = _el$50.nextSibling;
        createRenderEffect((_p$) => {
          var _v$7 = styles.loadingOverlay, _v$8 = styles.loadingSpinner, _v$9 = styles.loadingLabel;
          _v$7 !== _p$.e && className(_el$49, _p$.e = _v$7);
          _v$8 !== _p$.t && className(_el$50, _p$.t = _v$8);
          _v$9 !== _p$.a && className(_el$51, _p$.a = _v$9);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$49;
      }
    }), _el$52);
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
      var _v$0 = styles.page, _v$1 = styles.toolbarSeries, _v$10 = styles.toolbarGroup, _v$11 = styles.toolbarLabel, _v$12 = styles.xAxisSelect, _v$13 = styles.toolbarLabel, _v$14 = styles.columnFilterInput, _v$15 = styles.collapseBtn, _v$16 = styles.toolbarTools, _v$17 = styles.toolbarGroup, _v$18 = styles.toolbarLabel, _v$19 = styles.drawSelect, _v$20 = styles.ghostBtn, _v$21 = `${styles.toolbarGroup} ${styles.toolbarGroupSep}`, _v$22 = styles.panelOpenBtn, _v$23 = styles.toolbarLabel, _v$24 = styles.disclosureValue, _v$25 = `${styles.toolbarGroup} ${styles.toolbarGroupSep}`, _v$26 = styles.panelOpenBtn, _v$27 = styles.toolbarLabel, _v$28 = styles.disclosureValue, _v$29 = `${styles.toolbarGroup} ${styles.toolbarGroupPush}`, _v$30 = styles.ghostBtn, _v$31 = styles.toolbarKbd, _v$32 = styles.ghostBtn, _v$33 = styles.toolbarKbd, _v$34 = styles.panelOpenBtn, _v$35 = styles.toolbarLabel, _v$36 = styles.disclosureValue, _v$37 = `${styles.toolbarGroup} ${styles.toolbarGroupSep} ${styles.toolbarGroupPush}`, _v$38 = styles.panelOpenBtn, _v$39 = styles.toolbarLabel, _v$40 = styles.disclosureValue, _v$41 = styles.toolbarGroup, _v$42 = styles.ghostBtn, _v$43 = styles.zoomRangeBadge, _v$44 = styles.ghostBtn, _v$45 = styles.main, _v$46 = styles.overlayStack, _v$47 = styles.colorbarWrap, _v$48 = styles.colorbarName, _v$49 = styles.colorbarScale, _v$50 = styles.colorbarBound, _v$51 = styles.colorbar, _v$52 = styles.colorbarBound, _v$53 = styles.colorbarWrap, _v$54 = styles.colorbarName, _v$55 = styles.distributionLegend;
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
      _v$43 !== _p$.H && className(_el$40, _p$.H = _v$43);
      _v$44 !== _p$.F && className(_el$41, _p$.F = _v$44);
      _v$45 !== _p$.M && className(_el$42, _p$.M = _v$45);
      _v$46 !== _p$.D && className(_el$52, _p$.D = _v$46);
      _v$47 !== _p$.R && className(_el$53, _p$.R = _v$47);
      _v$48 !== _p$.E && className(_el$54, _p$.E = _v$48);
      _v$49 !== _p$.L && className(_el$55, _p$.L = _v$49);
      _v$50 !== _p$.N && className(_el$56, _p$.N = _v$50);
      _v$51 !== _p$.G && className(_el$57, _p$.G = _v$51);
      _v$52 !== _p$.U && className(_el$58, _p$.U = _v$52);
      _v$53 !== _p$.K && className(_el$59, _p$.K = _v$53);
      _v$54 !== _p$.V && className(_el$60, _p$.V = _v$54);
      _v$55 !== _p$.Y && className(_el$61, _p$.Y = _v$55);
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
      Y: void 0
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
//# sourceMappingURL=TimeseriesPage.WSKJ59no.js.map
