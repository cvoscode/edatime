import { e as createSignal, f as createMemo, g as uiStore, o as onMount, c as createEffect, a as onCleanup, i as insert, m as memo, b as createRenderEffect, j as setAttribute, s as setStyleProperty, t as template, u as use, r as useNavigate, v as datasetStore, C as scatterStore, h as createComponent, F as For, n as className, S as Show, k as delegateEvents } from './index.DjSmm6wY.js';
import { g as fetchScatterCorrelations, h as fetchScatterPoints } from './api.D--3WP_v.js';
import { g as getColorPalette, s as sampleGradient, d as buildCategoricalColorGroups, e as getCategoryColor } from './colorScale.CLTVXB24.js';
import { L as LabelsDrawer } from './LabelsDrawer.BSE15MTV.js';
import { g as getActivePlotTemplate, i as init, r as registerTheme, t as toEChartsTheme } from './plotTemplate.L9HyQqsu.js';

var _tmpl$$1 = /* @__PURE__ */ template(`<div class=scatter-chart-container style=width:100%;height:100%;position:relative>`), _tmpl$2$1 = /* @__PURE__ */ template(`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted, #888)">Loading chart engine...`), _tmpl$3$1 = /* @__PURE__ */ template(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-text-muted, #888);font-size:14px;gap:8px"><span>Chart engine unavailable</span><small style=font-size:12px;max-width:300px;text-align:center>`);
const CHART_GRID = {
  left: 72,
  right: 72,
  top: 24,
  bottom: 50
};
const ScatterChartView = (props) => {
  let containerRef;
  const [chartStatus, setChartStatus] = createSignal("loading");
  const [engineName, setEngineName] = createSignal("");
  const [webgpuReason, setWebgpuReason] = createSignal("");
  const [themeVersion, setThemeVersion] = createSignal(0);
  let chartInstance = null;
  let resizeObserver = null;
  let chartgpuBlobUrl = null;
  let chartModule = null;
  const activeTemplate = createMemo(() => getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme));
  const echartsThemeName = createMemo(() => `edatime-scatter-${activeTemplate().id}`);
  const registerTheme$1 = () => {
    const tmpl = activeTemplate();
    registerTheme(echartsThemeName(), toEChartsTheme(tmpl));
  };
  const initChart = async () => {
    if (!containerRef) return;
    setChartStatus("loading");
    const template = activeTemplate();
    console.debug("[ScatterChartView] initChart: theme =", template.id);
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
        grid: CHART_GRID,
        xAxis: {
          type: "value",
          name: props.xAxisLabel
        },
        yAxis: {
          type: "value",
          name: props.yAxisLabel
        },
        legend: {
          show: false
        },
        series: [],
        theme: activeTemplate().id
      };
      console.debug("[ScatterChartView] createChart options:", {
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
          grid: CHART_GRID,
          xAxis: {
            type: "value",
            name: props.xAxisLabel
          },
          yAxis: {
            type: "value",
            name: props.yAxisLabel
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
  const buildChartGPUSeries = (options) => {
    const mode = props.renderMode ?? "scatter";
    const isDensity = mode === "density";
    const result = [];
    for (const s of options.series) {
      if (s.visualMap && !isDensity) {
        const colorMin = s.visualMap.min ?? 0;
        const colorMax = s.visualMap.max ?? 1;
        s.visualMap.inRange?.color;
        const scaleName = uiStore.state.colorScale;
        const n = s.data.length;
        const bins = 64;
        const span = colorMax - colorMin || 1;
        const grouped = Array.from({
          length: bins
        }, () => []);
        for (let i = 0; i < n; i++) {
          const pt = s.data[i];
          if (!Array.isArray(pt) || pt.length < 3) continue;
          const cv = pt[2];
          if (typeof cv !== "number" || !Number.isFinite(cv)) continue;
          let b = Math.floor((cv - colorMin) / span * bins);
          if (b < 0) b = 0;
          if (b >= bins) b = bins - 1;
          grouped[b].push(pt);
        }
        const palette = getColorPalette(scaleName, 64);
        for (let b = 0; b < bins; b++) {
          if (grouped[b].length === 0) continue;
          const t = (b + 0.5) / bins;
          result.push({
            type: "scatter",
            name: `${s.name} [${b}]`,
            data: grouped[b],
            mode: "points",
            symbolSize: s.symbolSize ?? 4,
            color: sampleGradient(palette, t),
            sampling: "none"
          });
        }
      } else {
        result.push({
          type: "scatter",
          name: s.name,
          data: s.data,
          mode: isDensity ? "density" : "points",
          binSize: isDensity ? props.binSize ?? 2 : void 0,
          densityColormap: isDensity ? uiStore.state.colorScale : void 0,
          densityNormalization: isDensity ? props.densityNormalization ?? "log" : void 0,
          symbolSize: s.symbolSize ?? 4,
          color: s.color,
          sampling: "none"
        });
      }
    }
    return result;
  };
  const handleUpdateChart = (options) => {
    if (!chartInstance) {
      console.debug("[ScatterChartView] handleUpdateChart: no chartInstance");
      return;
    }
    console.debug("[ScatterChartView] handleUpdateChart: engine =", engineName(), "seriesLen =", options.series?.length);
    const prevVisibility = /* @__PURE__ */ new Map();
    const currentSeries = chartInstance.options?.series;
    if (Array.isArray(currentSeries)) {
      for (const s of currentSeries) {
        const name = typeof s?.name === "string" ? s.name : "";
        if (name) prevVisibility.set(name, s.visible !== false);
      }
    }
    if (engineName() === "ChartGPU") {
      const seriesWithVisibility = options.series.map((s) => ({
        ...s,
        visible: prevVisibility.get(s.name) !== false
      }));
      const opts = {
        grid: CHART_GRID,
        xAxis: {
          type: "value",
          name: props.xAxisLabel
        },
        yAxis: {
          type: "value",
          name: props.yAxisLabel
        },
        series: buildChartGPUSeries({
          series: seriesWithVisibility
        })
      };
      if (options.xMin !== void 0 && options.xMax !== void 0) {
        opts.xAxis = {
          type: "value",
          name: props.xAxisLabel,
          min: options.xMin,
          max: options.xMax
        };
      }
      if (options.yMin !== void 0 && options.yMax !== void 0) {
        opts.yAxis = {
          type: "value",
          name: props.yAxisLabel,
          min: options.yMin,
          max: options.yMax
        };
      }
      chartInstance.setOption(opts);
      chartInstance.resize();
    } else {
      const seriesWithVisibility = options.series.map((s) => ({
        ...s,
        visible: prevVisibility.get(s.name) !== false
      }));
      let visualMapConfig = void 0;
      const echartsSeries = seriesWithVisibility.map((s) => {
        const base = {
          type: "scatter",
          name: s.name,
          data: s.data,
          symbolSize: s.symbolSize ?? 4,
          color: s.color
        };
        if (s.visualMap) {
          visualMapConfig = {
            ...s.visualMap,
            type: "continuous",
            text: [s.visualMap.max?.toFixed(2) ?? "1.00", s.visualMap.min?.toFixed(2) ?? "0.00"],
            textStyle: {
              fontSize: 10
            },
            itemHeight: 120,
            itemWidth: 14
          };
        }
        return base;
      });
      const opts = {
        grid: CHART_GRID,
        xAxis: {
          type: "value",
          name: props.xAxisLabel
        },
        yAxis: {
          type: "value",
          name: props.yAxisLabel
        },
        series: echartsSeries,
        ...visualMapConfig ? {
          visualMap: visualMapConfig
        } : {},
        ...props.chartTitle ? {
          title: {
            text: props.chartTitle,
            left: "center"
          }
        } : {}
      };
      if (options.xMin !== void 0 && options.xMax !== void 0) {
        opts.xAxis = {
          type: "value",
          name: props.xAxisLabel,
          min: options.xMin,
          max: options.xMax
        };
      }
      if (options.yMin !== void 0 && options.yMax !== void 0) {
        opts.yAxis = {
          type: "value",
          name: props.yAxisLabel,
          min: options.yMin,
          max: options.yMax
        };
      }
      chartInstance.setOption(opts);
      chartInstance.resize();
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
    console.debug("[ScatterChartView] themeVersion effect: engine =", currentEngine);
    if (currentEngine === "ECharts") {
      registerTheme$1();
      chartInstance.setOption({
        backgroundColor: activeTemplate().background,
        color: getColorPalette(uiStore.state.colorScale, 8)
      });
    } else if (currentEngine === "ChartGPU") {
      console.debug("[ScatterChartView] recreating ChartGPU for theme change");
      const oldInstance = chartInstance;
      chartInstance = null;
      oldInstance?.dispose?.();
      initChart().then(() => {
        console.debug("[ScatterChartView] ChartGPU recreated, chartStatus =", chartStatus());
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
        type: "value",
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
  createEffect(() => {
    void props.renderMode;
    void props.binSize;
    void props.densityColormap;
    void props.densityNormalization;
    if (chartInstance && chartStatus() === "ready") {
      props.onReady?.(handleUpdateChart);
    }
  });
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
    var _el$ = _tmpl$$1();
    var _ref$ = containerRef;
    typeof _ref$ === "function" ? use(_ref$, _el$) : containerRef = _el$;
    insert(_el$, (() => {
      var _c$ = memo(() => chartStatus() === "loading");
      return () => _c$() && _tmpl$2$1();
    })(), null);
    insert(_el$, (() => {
      var _c$2 = memo(() => chartStatus() === "error");
      return () => _c$2() && (() => {
        var _el$3 = _tmpl$3$1(), _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling;
        insert(_el$5, webgpuReason);
        return _el$3;
      })();
    })(), null);
    createRenderEffect((_p$) => {
      var _v$ = props.containerId ?? "scatter-chart", _v$2 = chartStatus(), _v$3 = activeTemplate().background;
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

const page = "_page_1csek_1";
const toolbar = "_toolbar_1csek_8";
const toolbarLeft = "_toolbarLeft_1csek_18";
const toolbarRight = "_toolbarRight_1csek_19";
const controlGroup = "_controlGroup_1csek_25";
const label = "_label_1csek_31";
const select = "_select_1csek_36";
const viewToggle = "_viewToggle_1csek_46";
const viewBtn = "_viewBtn_1csek_53";
const active = "_active_1csek_66";
const suggestions = "_suggestions_1csek_71";
const suggestionsLabel = "_suggestionsLabel_1csek_81";
const suggestionChip = "_suggestionChip_1csek_87";
const chipName = "_chipName_1csek_104";
const chipCorr = "_chipCorr_1csek_110";
const corrStats = "_corrStats_1csek_116";
const main = "_main_1csek_126";
const emptyState = "_emptyState_1csek_137";
const primaryBtn = "_primaryBtn_1csek_156";
const loadingOverlay = "_loadingOverlay_1csek_172";
const spinner = "_spinner_1csek_185";
const footer = "_footer_1csek_198";
const panelOpenBtn = "_panelOpenBtn_1csek_209";
const toolbarLabel = "_toolbarLabel_1csek_227";
const overlayStack = "_overlayStack_1csek_232";
const colorbarWrap = "_colorbarWrap_1csek_242";
const colorbarName = "_colorbarName_1csek_256";
const colorbar = "_colorbar_1csek_242";
const colorbarVertical = "_colorbarVertical_1csek_283";
const colorbarVName = "_colorbarVName_1csek_291";
const colorbarVTick = "_colorbarVTick_1csek_305";
const categoricalLegend = "_categoricalLegend_1csek_311";
const categoricalItem = "_categoricalItem_1csek_317";
const categoricalSwatch = "_categoricalSwatch_1csek_325";
const styles = {
	page: page,
	toolbar: toolbar,
	toolbarLeft: toolbarLeft,
	toolbarRight: toolbarRight,
	controlGroup: controlGroup,
	label: label,
	select: select,
	viewToggle: viewToggle,
	viewBtn: viewBtn,
	active: active,
	suggestions: suggestions,
	suggestionsLabel: suggestionsLabel,
	suggestionChip: suggestionChip,
	chipName: chipName,
	chipCorr: chipCorr,
	corrStats: corrStats,
	main: main,
	emptyState: emptyState,
	primaryBtn: primaryBtn,
	loadingOverlay: loadingOverlay,
	spinner: spinner,
	footer: footer,
	panelOpenBtn: panelOpenBtn,
	toolbarLabel: toolbarLabel,
	overlayStack: overlayStack,
	colorbarWrap: colorbarWrap,
	colorbarName: colorbarName,
	colorbar: colorbar,
	colorbarVertical: colorbarVertical,
	colorbarVName: colorbarVName,
	colorbarVTick: colorbarVTick,
	categoricalLegend: categoricalLegend,
	categoricalItem: categoricalItem,
	categoricalSwatch: categoricalSwatch
};

var _tmpl$ = /* @__PURE__ */ template(`<div><label>Bin</label><select><option value=2>2px</option><option value=4>4px</option><option value=8>8px</option><option value=16>16px`), _tmpl$2 = /* @__PURE__ */ template(`<div><label>Colormap</label><select><option value=viridis>Viridis</option><option value=plasma>Plasma</option><option value=inferno>Inferno`), _tmpl$3 = /* @__PURE__ */ template(`<div><label>Norm</label><select><option value=linear>Linear</option><option value=sqrt>Sqrt</option><option value=log>Log`), _tmpl$4 = /* @__PURE__ */ template(`<div><span>Suggestions:`), _tmpl$5 = /* @__PURE__ */ template(`<div><span>Pearson: </span><span>Spearman: `), _tmpl$6 = /* @__PURE__ */ template(`<div><strong>No data loaded</strong><span>Upload a dataset to visualize scatter data.</span><button>Upload data`), _tmpl$7 = /* @__PURE__ */ template(`<div><div></div><span>Loading...`), _tmpl$8 = /* @__PURE__ */ template(`<div id=scatter-colorbar-wrap><span></span><div id=scatter-colorbar></div><span></span><span>`), _tmpl$9 = /* @__PURE__ */ template(`<div><span> points`), _tmpl$0 = /* @__PURE__ */ template(`<div><div><div><div><label>X</label><select></select></div><div><label>Y</label><select></select></div><div><label>Color</label><select><option value>None</option></select></div></div><div><div><label>Mode</label><select><option value=scatter>Scatter</option><option value=density>Density</option></select></div><div><button>Plot</button><button>Matrix</button></div><button type=button title="Edit chart title and axis labels"><span>Labels</span></button></div></div><main><div id=scatter-overlays>`), _tmpl$1 = /* @__PURE__ */ template(`<option>`), _tmpl$10 = /* @__PURE__ */ template(`<button><span></span><span>`), _tmpl$11 = /* @__PURE__ */ template(`<div id=scatter-categorical-wrap><span></span><div>`), _tmpl$12 = /* @__PURE__ */ template(`<div><div></div><span>`);
const ScatterPage = () => {
  const navigate = useNavigate();
  let updateChartFn = null;
  let chartEngineName = "ChartGPU";
  const [isLoading, setIsLoading] = createSignal(false);
  const [activeView, setActiveView] = createSignal("plot");
  const [renderMode, setRenderMode] = createSignal("scatter");
  const [showLabelsDrawer, setShowLabelsDrawer] = createSignal(false);
  const [chartTitle, setChartTitle] = createSignal("");
  const [xAxisLabel, setXAxisLabel] = createSignal("");
  const [yAxisLabel, setYAxisLabel] = createSignal("");
  const [binSize, setBinSize] = createSignal(2);
  const [densityColormap, setDensityColormap] = createSignal("plasma");
  const [densityNormalization, setDensityNormalization] = createSignal("log");
  const numericCols = createMemo(() => datasetStore.state.numericCols);
  const xCol = createMemo(() => {
    const stored = sessionStorage.getItem("scatter-x-col");
    if (stored) {
      sessionStorage.removeItem("scatter-x-col");
      scatterStore.setConfig({
        xCol: stored
      });
      return stored;
    }
    return scatterStore.state.config.xCol || numericCols()[0] || "";
  });
  const yCol = createMemo(() => {
    const stored = sessionStorage.getItem("scatter-y-col");
    if (stored) {
      sessionStorage.removeItem("scatter-y-col");
      scatterStore.setConfig({
        yCol: stored
      });
      return stored;
    }
    return scatterStore.state.config.yCol || numericCols()[1] || "";
  });
  const colorCol = createMemo(() => scatterStore.state.config.colorCol || "");
  const correlationForY = createMemo(() => {
    const y = yCol();
    const corrs = scatterStore.state.correlations;
    return corrs[y] ?? null;
  });
  const suggestions = createMemo(() => scatterStore.state.suggestions);
  const totalPoints = createMemo(() => scatterStore.state.totalPoints);
  const scatterPoints = createMemo(() => scatterStore.state.scatterPoints);
  const handleXChange = async (val) => {
    scatterStore.setConfig({
      xCol: val
    });
    await refreshCorrelations(val);
    await fetchPoints();
  };
  const handleYChange = async (val) => {
    scatterStore.setConfig({
      yCol: val
    });
    await fetchPoints();
  };
  const handleColorChange = async (val) => {
    scatterStore.setConfig({
      colorCol: val
    });
    await fetchPoints();
  };
  const handleSuggestionClick = async (col) => {
    scatterStore.setConfig({
      yCol: col
    });
    await fetchPoints();
  };
  const refreshCorrelations = async (base) => {
    if (!base) return;
    try {
      const resp = await fetchScatterCorrelations(base, 0.7);
      const corrMap = {};
      for (const item of resp.correlations) {
        corrMap[item.column] = {
          pearson: item.pearson,
          spearman: item.spearman
        };
      }
      scatterStore.setCorrelations(corrMap);
      scatterStore.setSuggestions(resp.suggestions);
    } catch (e) {
      console.error("Failed to fetch correlations:", e);
    }
  };
  const handleLabelsChange = (title, xLabel, yLabel) => {
    setChartTitle(title);
    setXAxisLabel(xLabel);
    setYAxisLabel(yLabel);
    updateChart();
  };
  const fetchPoints = async () => {
    const x = xCol();
    const y = yCol();
    if (!x || !y) return;
    setIsLoading(true);
    try {
      const color = colorCol() || null;
      const resp = await fetchScatterPoints(x, y, 5e5, color);
      scatterStore.setScatterPoints(resp.points, resp.total_points);
      scatterStore.setColorValues(resp.color_values, resp.color_min, resp.color_max);
      scatterStore.setColorLabels(resp.color_labels);
      updateChart();
    } catch (e) {
      console.error("Failed to fetch scatter points:", e);
    } finally {
      setIsLoading(false);
    }
  };
  const handleEngineReady = (engineName) => {
    chartEngineName = engineName;
  };
  const handleChartReady = (updateFn) => {
    updateChartFn = updateFn;
    updateChart();
  };
  const updateChart = () => {
    if (!updateChartFn) return;
    const points = scatterPoints();
    const colorVals = scatterStore.state.colorValues;
    const colorLabels = scatterStore.state.colorLabels;
    const colorColName = colorCol();
    const mode = renderMode();
    const isDensity = mode === "density";
    const n = points.length;
    if (isDensity || !colorColName || !colorVals && !colorLabels) {
      const series = [{
        type: "scatter",
        name: `${xCol()} vs ${yCol()}`,
        data: points,
        symbolSize: 4
      }];
      updateChartFn({
        series
      });
      return;
    }
    if (colorLabels) {
      const catGroups = buildCategoricalColorGroups(colorLabels);
      if (catGroups) {
        const series = catGroups.categories.map((label) => {
          const data = [];
          for (let i = 0; i < n; i++) {
            const lbl = colorLabels[i];
            const normalized = lbl == null ? "Missing" : String(lbl).trim() || "Missing";
            if (normalized !== label) continue;
            data.push([points[i][0], points[i][1]]);
          }
          return {
            type: "scatter",
            name: label,
            data,
            symbolSize: 4,
            color: catGroups.colorByLabel.get(label) || "#4a9eff"
          };
        }).filter((s) => s.data.length > 0);
        updateChartFn({
          series
        });
        return;
      }
    }
    if (colorVals) {
      const seriesData = [];
      for (let i = 0; i < n; i++) {
        seriesData.push([points[i][0], points[i][1], colorVals[i]]);
      }
      const series = [{
        type: "scatter",
        name: `${xCol()} vs ${yCol()}`,
        data: seriesData,
        symbolSize: 4,
        visualMap: {
          show: true,
          min: scatterStore.state.colorMin ?? 0,
          max: scatterStore.state.colorMax ?? 1,
          dimension: 2,
          inRange: {
            color: getColorPalette(uiStore.state.colorScale, 6)
          }
        }
      }];
      updateChartFn({
        series
      });
    }
  };
  onMount(async () => {
    const x = xCol();
    if (x) {
      await refreshCorrelations(x);
    }
    await fetchPoints();
  });
  createEffect(() => {
    void xCol();
    void yCol();
    void colorCol();
    void renderMode();
    if (updateChartFn) {
      void fetchPoints();
    }
  });
  const hasData = createMemo(() => datasetStore.state.metadata !== null);
  const canShowChart = createMemo(() => hasData() && numericCols().length >= 2);
  return (() => {
    var _el$ = _tmpl$0(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.firstChild, _el$6 = _el$5.nextSibling, _el$7 = _el$4.nextSibling, _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling, _el$0 = _el$7.nextSibling, _el$1 = _el$0.firstChild, _el$10 = _el$1.nextSibling; _el$10.firstChild; var _el$12 = _el$3.nextSibling, _el$22 = _el$12.firstChild, _el$23 = _el$22.firstChild, _el$24 = _el$23.nextSibling, _el$25 = _el$22.nextSibling, _el$26 = _el$25.firstChild, _el$27 = _el$26.nextSibling, _el$28 = _el$25.nextSibling, _el$29 = _el$28.firstChild, _el$37 = _el$2.nextSibling, _el$44 = _el$37.firstChild;
    _el$6.addEventListener("change", (e) => handleXChange(e.currentTarget.value));
    insert(_el$6, createComponent(For, {
      get each() {
        return numericCols();
      },
      children: (col) => (() => {
        var _el$53 = _tmpl$1();
        _el$53.value = col;
        insert(_el$53, col);
        return _el$53;
      })()
    }));
    _el$9.addEventListener("change", (e) => handleYChange(e.currentTarget.value));
    insert(_el$9, createComponent(For, {
      get each() {
        return numericCols();
      },
      children: (col) => (() => {
        var _el$54 = _tmpl$1();
        _el$54.value = col;
        insert(_el$54, col);
        return _el$54;
      })()
    }));
    _el$10.addEventListener("change", (e) => handleColorChange(e.currentTarget.value));
    insert(_el$10, createComponent(For, {
      get each() {
        return numericCols();
      },
      children: (col) => (() => {
        var _el$55 = _tmpl$1();
        _el$55.value = col;
        insert(_el$55, col);
        return _el$55;
      })()
    }), null);
    insert(_el$12, createComponent(Show, {
      get when() {
        return renderMode() === "density";
      },
      get children() {
        return [(() => {
          var _el$13 = _tmpl$(), _el$14 = _el$13.firstChild, _el$15 = _el$14.nextSibling;
          _el$15.addEventListener("change", (e) => setBinSize(Number(e.currentTarget.value)));
          createRenderEffect((_p$) => {
            var _v$ = styles.controlGroup, _v$2 = styles.label, _v$3 = styles.select;
            _v$ !== _p$.e && className(_el$13, _p$.e = _v$);
            _v$2 !== _p$.t && className(_el$14, _p$.t = _v$2);
            _v$3 !== _p$.a && className(_el$15, _p$.a = _v$3);
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0
          });
          createRenderEffect(() => _el$15.value = binSize());
          return _el$13;
        })(), (() => {
          var _el$16 = _tmpl$2(), _el$17 = _el$16.firstChild, _el$18 = _el$17.nextSibling;
          _el$18.addEventListener("change", (e) => setDensityColormap(e.currentTarget.value));
          createRenderEffect((_p$) => {
            var _v$4 = styles.controlGroup, _v$5 = styles.label, _v$6 = styles.select;
            _v$4 !== _p$.e && className(_el$16, _p$.e = _v$4);
            _v$5 !== _p$.t && className(_el$17, _p$.t = _v$5);
            _v$6 !== _p$.a && className(_el$18, _p$.a = _v$6);
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0
          });
          createRenderEffect(() => _el$18.value = densityColormap());
          return _el$16;
        })(), (() => {
          var _el$19 = _tmpl$3(), _el$20 = _el$19.firstChild, _el$21 = _el$20.nextSibling;
          _el$21.addEventListener("change", (e) => setDensityNormalization(e.currentTarget.value));
          createRenderEffect((_p$) => {
            var _v$7 = styles.controlGroup, _v$8 = styles.label, _v$9 = styles.select;
            _v$7 !== _p$.e && className(_el$19, _p$.e = _v$7);
            _v$8 !== _p$.t && className(_el$20, _p$.t = _v$8);
            _v$9 !== _p$.a && className(_el$21, _p$.a = _v$9);
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0
          });
          createRenderEffect(() => _el$21.value = densityNormalization());
          return _el$19;
        })()];
      }
    }), _el$22);
    _el$24.addEventListener("change", (e) => setRenderMode(e.currentTarget.value));
    _el$26.$$click = () => setActiveView("plot");
    _el$27.$$click = () => setActiveView("matrix");
    _el$28.$$click = () => setShowLabelsDrawer(true);
    insert(_el$, createComponent(Show, {
      get when() {
        return suggestions().length > 0;
      },
      get children() {
        var _el$30 = _tmpl$4(), _el$31 = _el$30.firstChild;
        insert(_el$30, createComponent(For, {
          get each() {
            return suggestions();
          },
          children: (item) => (() => {
            var _el$56 = _tmpl$10(), _el$57 = _el$56.firstChild, _el$58 = _el$57.nextSibling;
            _el$56.$$click = () => handleSuggestionClick(item.column);
            insert(_el$57, () => item.column);
            insert(_el$58, () => item.pearson?.toFixed(2) ?? "—");
            createRenderEffect((_p$) => {
              var _v$43 = styles.suggestionChip, _v$44 = styles.chipName, _v$45 = styles.chipCorr;
              _v$43 !== _p$.e && className(_el$56, _p$.e = _v$43);
              _v$44 !== _p$.t && className(_el$57, _p$.t = _v$44);
              _v$45 !== _p$.a && className(_el$58, _p$.a = _v$45);
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0
            });
            return _el$56;
          })()
        }), null);
        createRenderEffect((_p$) => {
          var _v$0 = styles.suggestions, _v$1 = styles.suggestionsLabel;
          _v$0 !== _p$.e && className(_el$30, _p$.e = _v$0);
          _v$1 !== _p$.t && className(_el$31, _p$.t = _v$1);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$30;
      }
    }), _el$37);
    insert(_el$, createComponent(Show, {
      get when() {
        return correlationForY();
      },
      get children() {
        var _el$32 = _tmpl$5(), _el$33 = _el$32.firstChild; _el$33.firstChild; var _el$35 = _el$33.nextSibling; _el$35.firstChild;
        insert(_el$33, () => correlationForY().pearson?.toFixed(4) ?? "—", null);
        insert(_el$35, () => correlationForY().spearman?.toFixed(4) ?? "—", null);
        createRenderEffect(() => className(_el$32, styles.corrStats));
        return _el$32;
      }
    }), _el$37);
    insert(_el$37, createComponent(Show, {
      get when() {
        return canShowChart();
      },
      get children() {
        return createComponent(ScatterChartView, {
          get xAxisLabel() {
            return xAxisLabel() || xCol();
          },
          get yAxisLabel() {
            return yAxisLabel() || yCol();
          },
          get renderMode() {
            return renderMode();
          },
          get binSize() {
            return binSize();
          },
          get densityColormap() {
            return densityColormap();
          },
          get densityNormalization() {
            return densityNormalization();
          },
          onReady: handleChartReady,
          onEngineReady: handleEngineReady
        });
      }
    }), _el$44);
    insert(_el$37, createComponent(Show, {
      get when() {
        return !canShowChart();
      },
      get children() {
        var _el$38 = _tmpl$6(), _el$39 = _el$38.firstChild, _el$40 = _el$39.nextSibling, _el$41 = _el$40.nextSibling;
        _el$41.$$click = () => navigate("/upload");
        createRenderEffect((_p$) => {
          var _v$10 = styles.emptyState, _v$11 = styles.primaryBtn;
          _v$10 !== _p$.e && className(_el$38, _p$.e = _v$10);
          _v$11 !== _p$.t && className(_el$41, _p$.t = _v$11);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$38;
      }
    }), _el$44);
    insert(_el$37, createComponent(Show, {
      get when() {
        return isLoading();
      },
      get children() {
        var _el$42 = _tmpl$7(), _el$43 = _el$42.firstChild;
        createRenderEffect((_p$) => {
          var _v$12 = styles.loadingOverlay, _v$13 = styles.spinner;
          _v$12 !== _p$.e && className(_el$42, _p$.e = _v$12);
          _v$13 !== _p$.t && className(_el$43, _p$.t = _v$13);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$42;
      }
    }), _el$44);
    insert(_el$44, createComponent(Show, {
      get when() {
        return memo(() => !!scatterStore.state.colorLabels)() && colorCol();
      },
      get children() {
        return (() => {
          const catGroups = buildCategoricalColorGroups(scatterStore.state.colorLabels);
          return catGroups ? (() => {
            var _el$59 = _tmpl$11(), _el$60 = _el$59.firstChild, _el$61 = _el$60.nextSibling;
            insert(_el$60, colorCol);
            insert(_el$61, createComponent(For, {
              get each() {
                return catGroups.categories;
              },
              children: (label, idx) => (() => {
                var _el$62 = _tmpl$12(), _el$63 = _el$62.firstChild, _el$64 = _el$63.nextSibling;
                insert(_el$64, label);
                createRenderEffect((_p$) => {
                  var _v$49 = styles.categoricalItem, _v$50 = styles.categoricalSwatch, _v$51 = getCategoryColor(idx());
                  _v$49 !== _p$.e && className(_el$62, _p$.e = _v$49);
                  _v$50 !== _p$.t && className(_el$63, _p$.t = _v$50);
                  _v$51 !== _p$.a && setStyleProperty(_el$63, "background", _p$.a = _v$51);
                  return _p$;
                }, {
                  e: void 0,
                  t: void 0,
                  a: void 0
                });
                return _el$62;
              })()
            }));
            createRenderEffect((_p$) => {
              var _v$46 = styles.colorbarWrap, _v$47 = styles.colorbarName, _v$48 = styles.categoricalLegend;
              _v$46 !== _p$.e && className(_el$59, _p$.e = _v$46);
              _v$47 !== _p$.t && className(_el$60, _p$.t = _v$47);
              _v$48 !== _p$.a && className(_el$61, _p$.a = _v$48);
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0
            });
            return _el$59;
          })() : null;
        })();
      }
    }), null);
    insert(_el$44, createComponent(Show, {
      get when() {
        return memo(() => !!(colorCol() && scatterStore.state.colorValues))() && renderMode() === "scatter";
      },
      get children() {
        var _el$45 = _tmpl$8(), _el$46 = _el$45.firstChild, _el$47 = _el$46.nextSibling, _el$48 = _el$47.nextSibling, _el$49 = _el$48.nextSibling;
        insert(_el$46, () => scatterStore.state.colorMax?.toFixed(2) ?? "1.00");
        insert(_el$48, () => scatterStore.state.colorMin?.toFixed(2) ?? "0.00");
        insert(_el$49, colorCol);
        createRenderEffect((_p$) => {
          var _v$14 = styles.colorbarVertical, _v$15 = styles.colorbarVTick, _v$16 = styles.colorbar, _v$17 = `linear-gradient(to top, ${getColorPalette(uiStore.state.colorScale, 6).join(", ")})`, _v$18 = styles.colorbarVTick, _v$19 = styles.colorbarVName;
          _v$14 !== _p$.e && className(_el$45, _p$.e = _v$14);
          _v$15 !== _p$.t && className(_el$46, _p$.t = _v$15);
          _v$16 !== _p$.a && className(_el$47, _p$.a = _v$16);
          _v$17 !== _p$.o && setStyleProperty(_el$47, "background", _p$.o = _v$17);
          _v$18 !== _p$.i && className(_el$48, _p$.i = _v$18);
          _v$19 !== _p$.n && className(_el$49, _p$.n = _v$19);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0,
          n: void 0
        });
        return _el$45;
      }
    }), null);
    insert(_el$, createComponent(Show, {
      get when() {
        return totalPoints() > 0;
      },
      get children() {
        var _el$50 = _tmpl$9(), _el$51 = _el$50.firstChild, _el$52 = _el$51.firstChild;
        insert(_el$51, () => totalPoints().toLocaleString(), _el$52);
        createRenderEffect(() => className(_el$50, styles.footer));
        return _el$50;
      }
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
      engineName: chartEngineName
    }), null);
    createRenderEffect((_p$) => {
      var _v$20 = styles.page, _v$21 = styles.toolbar, _v$22 = styles.toolbarLeft, _v$23 = styles.controlGroup, _v$24 = styles.label, _v$25 = styles.select, _v$26 = styles.controlGroup, _v$27 = styles.label, _v$28 = styles.select, _v$29 = styles.controlGroup, _v$30 = styles.label, _v$31 = styles.select, _v$32 = styles.toolbarRight, _v$33 = styles.controlGroup, _v$34 = styles.label, _v$35 = styles.select, _v$36 = styles.viewToggle, _v$37 = `${styles.viewBtn} ${activeView() === "plot" ? styles.active : ""}`, _v$38 = `${styles.viewBtn} ${activeView() === "matrix" ? styles.active : ""}`, _v$39 = styles.panelOpenBtn, _v$40 = styles.toolbarLabel, _v$41 = styles.main, _v$42 = styles.overlayStack;
      _v$20 !== _p$.e && className(_el$, _p$.e = _v$20);
      _v$21 !== _p$.t && className(_el$2, _p$.t = _v$21);
      _v$22 !== _p$.a && className(_el$3, _p$.a = _v$22);
      _v$23 !== _p$.o && className(_el$4, _p$.o = _v$23);
      _v$24 !== _p$.i && className(_el$5, _p$.i = _v$24);
      _v$25 !== _p$.n && className(_el$6, _p$.n = _v$25);
      _v$26 !== _p$.s && className(_el$7, _p$.s = _v$26);
      _v$27 !== _p$.h && className(_el$8, _p$.h = _v$27);
      _v$28 !== _p$.r && className(_el$9, _p$.r = _v$28);
      _v$29 !== _p$.d && className(_el$0, _p$.d = _v$29);
      _v$30 !== _p$.l && className(_el$1, _p$.l = _v$30);
      _v$31 !== _p$.u && className(_el$10, _p$.u = _v$31);
      _v$32 !== _p$.c && className(_el$12, _p$.c = _v$32);
      _v$33 !== _p$.w && className(_el$22, _p$.w = _v$33);
      _v$34 !== _p$.m && className(_el$23, _p$.m = _v$34);
      _v$35 !== _p$.f && className(_el$24, _p$.f = _v$35);
      _v$36 !== _p$.y && className(_el$25, _p$.y = _v$36);
      _v$37 !== _p$.g && className(_el$26, _p$.g = _v$37);
      _v$38 !== _p$.p && className(_el$27, _p$.p = _v$38);
      _v$39 !== _p$.b && className(_el$28, _p$.b = _v$39);
      _v$40 !== _p$.T && className(_el$29, _p$.T = _v$40);
      _v$41 !== _p$.A && className(_el$37, _p$.A = _v$41);
      _v$42 !== _p$.O && className(_el$44, _p$.O = _v$42);
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
      O: void 0
    });
    createRenderEffect(() => _el$6.value = xCol());
    createRenderEffect(() => _el$9.value = yCol());
    createRenderEffect(() => _el$10.value = colorCol());
    createRenderEffect(() => _el$24.value = renderMode());
    return _el$;
  })();
};
delegateEvents(["click"]);

export { ScatterPage as default };
//# sourceMappingURL=ScatterPage.DOqmrp4S.js.map
