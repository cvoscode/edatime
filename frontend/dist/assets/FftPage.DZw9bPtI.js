import { e as createSignal, f as createMemo, v as datasetStore, E as fftStore, g as uiStore, o as onMount, c as createEffect, a as onCleanup, i as insert, h as createComponent, b as createRenderEffect, n as className, S as Show, F as For, t as template, u as use, k as delegateEvents } from './index.DjSmm6wY.js';
import { g as getActivePlotTemplate, i as init, r as registerTheme, t as toEChartsTheme } from './plotTemplate.L9HyQqsu.js';
import { i as fetchSpectrogram, j as fetchFft } from './api.D--3WP_v.js';
import { g as getColorPalette } from './colorScale.CLTVXB24.js';
import { C as ColumnChips } from './ColumnChips.CpJiRzVj.js';

const SPECTRAL_PRESETS = [
  { windowSize: 64, label: "64" },
  { windowSize: 256, label: "256" },
  { windowSize: 512, label: "512" },
  { windowSize: 1024, label: "1024" },
  { windowSize: 2048, label: "2048" }
];

const page = "_page_b2klm_1";
const toolbar = "_toolbar_b2klm_8";
const tabs = "_tabs_b2klm_18";
const tab = "_tab_b2klm_18";
const active = "_active_b2klm_39";
const toolbarRight = "_toolbarRight_b2klm_44";
const controlGroup = "_controlGroup_b2klm_50";
const label = "_label_b2klm_56";
const select = "_select_b2klm_61";
const checkboxLabel = "_checkboxLabel_b2klm_71";
const chipsBar = "_chipsBar_b2klm_84";
const spectrogramControls = "_spectrogramControls_b2klm_150";
const computeBtn = "_computeBtn_b2klm_159";
const chartContainer = "_chartContainer_b2klm_174";
const chart = "_chart_b2klm_174";
const loadingOverlay = "_loadingOverlay_b2klm_185";
const spinner = "_spinner_b2klm_199";
const footer = "_footer_b2klm_212";
const status = "_status_b2klm_221";
const exportButtons = "_exportButtons_b2klm_226";
const exportBtn = "_exportBtn_b2klm_231";
const styles = {
	page: page,
	toolbar: toolbar,
	tabs: tabs,
	tab: tab,
	active: active,
	toolbarRight: toolbarRight,
	controlGroup: controlGroup,
	label: label,
	select: select,
	checkboxLabel: checkboxLabel,
	chipsBar: chipsBar,
	spectrogramControls: spectrogramControls,
	computeBtn: computeBtn,
	chartContainer: chartContainer,
	chart: chart,
	loadingOverlay: loadingOverlay,
	spinner: spinner,
	footer: footer,
	status: status,
	exportButtons: exportButtons,
	exportBtn: exportBtn
};

var _tmpl$ = /* @__PURE__ */ template(`<div><label>Mode</label><select><option value=magnitude>Magnitude</option><option value=psd>PSD`), _tmpl$2 = /* @__PURE__ */ template(`<div><label><input type=checkbox>Log scale`), _tmpl$3 = /* @__PURE__ */ template(`<div>`), _tmpl$4 = /* @__PURE__ */ template(`<div><div><label>Window</label><select></select></div><div><label>Hop</label><select></select></div><button>Compute`), _tmpl$5 = /* @__PURE__ */ template(`<div><div></div><span>`), _tmpl$6 = /* @__PURE__ */ template(`<div><div><div><button>FFT</button><button>Spectrogram</button></div><div></div></div><div><div></div></div><div><div></div><div><button>PNG</button><button>SVG</button><button>CSV`), _tmpl$7 = /* @__PURE__ */ template(`<option>`);
const FftPage = () => {
  let chartContainerRef;
  let chartInstance = null;
  let resizeObserver = null;
  const [activeTab, setActiveTab] = createSignal("fft");
  const [fftMode, setFftMode] = createSignal("magnitude");
  const [logScale, setLogScale] = createSignal(true);
  const [status, setStatus] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [spectrogramWindow, setSpectrogramWindow] = createSignal(256);
  const [spectrogramHop, setSpectrogramHop] = createSignal(128);
  const numericCols = createMemo(() => datasetStore.state.numericCols);
  const fftTraces = createMemo(() => fftStore.state.fftTraces);
  const spectrogramResult = createMemo(() => fftStore.state.spectrogramResult);
  const activeTemplate = createMemo(() => getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme));
  const echartsThemeName = createMemo(() => `edatime-fft-${activeTemplate().id}`);
  const getFftColor = (column, fallbackIdx) => {
    const palette = getColorPalette(uiStore.state.colorScale, numericCols().length);
    const idx = numericCols().indexOf(column);
    return palette[idx >= 0 ? idx : fallbackIdx % palette.length];
  };
  const registerTheme$1 = () => {
    const tmpl = activeTemplate();
    registerTheme(echartsThemeName(), toEChartsTheme(tmpl));
  };
  const buildFftSeries = () => {
    const traces = fftTraces();
    const mode = fftMode();
    const log = logScale();
    return traces.map((trace) => {
      const data = mode === "psd" ? trace.psd.map((v, i) => [trace.frequencies[i], log ? Math.log10(v) : v]) : trace.magnitudes.map((v, i) => [trace.frequencies[i], log ? Math.log10(v) : v]);
      return {
        name: trace.column,
        type: "line",
        data,
        symbol: "none",
        lineStyle: {
          color: trace.color,
          width: 1.5
        }
      };
    });
  };
  const updateFftChart = () => {
    if (!chartInstance) return;
    const series = buildFftSeries();
    const log = logScale();
    chartInstance.setOption({
      grid: {
        left: 80,
        right: 40,
        top: 20,
        bottom: 50
      },
      xAxis: {
        type: "value",
        name: "Frequency (Hz)",
        nameLocation: "middle",
        nameGap: 30,
        scale: true
      },
      yAxis: {
        type: "value",
        name: log ? "Magnitude (log₁₀)" : "Magnitude",
        nameLocation: "middle",
        nameGap: 50,
        scale: true
      },
      series,
      color: getColorPalette(uiStore.state.colorScale, series.length)
    });
    const bins = series[0]?.data.length ?? 0;
    const cols = fftTraces().map((t) => t.column).join(", ");
    setStatus(`${bins} bins · ${cols || "Select columns"}`);
  };
  const updateSpectrogramChart = () => {
    if (!chartInstance) return;
    const result = spectrogramResult();
    if (!result) return;
    const data = [];
    const timeCount = result.time_points.length;
    const freqCount = result.freq_points.length;
    for (let ti = 0; ti < timeCount; ti++) {
      const row = result.power_matrix[ti];
      if (!row) continue;
      for (let fi = 0; fi < freqCount; fi++) {
        const val = row[fi];
        if (Number.isFinite(val)) {
          data.push([ti, fi, val]);
        }
      }
    }
    chartInstance.setOption({
      grid: {
        left: 80,
        right: 40,
        top: 20,
        bottom: 50
      },
      xAxis: {
        type: "value",
        name: "Time",
        nameLocation: "middle",
        nameGap: 30
      },
      yAxis: {
        type: "value",
        name: "Frequency (Hz)",
        nameLocation: "middle",
        nameGap: 50
      },
      visualMap: {
        show: true,
        min: 0,
        max: Math.max(...result.power_matrix.flat().filter(Number.isFinite), 1),
        inRange: {
          color: getColorPalette(uiStore.state.colorScale, 8)
        }
      },
      series: [{
        type: "heatmap",
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10
          }
        }
      }]
    });
  };
  const handleFetchFft = async (column) => {
    const metadata = datasetStore.state.metadata;
    if (!metadata) return;
    const [startMs, endMs] = metadata.timeRange ?? [0, 0];
    if (!startMs || !endMs) return;
    setLoading(true);
    setStatus(`Computing FFT for ${column}...`);
    try {
      const start = new Date(startMs).toISOString();
      const end = new Date(endMs).toISOString();
      const resp = await fetchFft(start, end, column);
      if (resp.results.length > 0) {
        const result = resp.results[0];
        const idx = numericCols().indexOf(column);
        const trace = {
          column: result.column,
          frequencies: result.frequencies,
          magnitudes: result.magnitudes,
          psd: result.psd,
          color: getFftColor(column, idx)
        };
        fftStore.addFftTrace(trace);
        updateFftChart();
      }
    } catch (e) {
      console.error("FFT fetch failed:", e);
      setStatus(`FFT failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };
  const handleFetchSpectrogram = async () => {
    const metadata = datasetStore.state.metadata;
    if (!metadata) return;
    const [startMs, endMs] = metadata.timeRange ?? [0, 0];
    if (!startMs || !endMs) return;
    setLoading(true);
    setStatus(`Computing spectrogram...`);
    try {
      const start = new Date(startMs).toISOString();
      const end = new Date(endMs).toISOString();
      const column = numericCols()[0] || "";
      const resp = await fetchSpectrogram(start, end, column, spectrogramWindow(), spectrogramHop());
      fftStore.setSpectrogramResult({
        time_points: resp.result.times_ms,
        freq_points: resp.result.frequencies,
        power_matrix: resp.result.magnitudes
      });
      updateSpectrogramChart();
    } catch (e) {
      console.error("Spectrogram fetch failed:", e);
      setStatus(`Spectrogram failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };
  const selectedColumns = createMemo(() => fftStore.state.fftTraces.map((t) => t.column));
  const columnColors = createMemo(() => {
    const m = {};
    for (const t of fftStore.state.fftTraces) m[t.column] = t.color;
    return m;
  });
  const handleChipChange = (selected) => {
    const current = new Set(fftStore.state.fftTraces.map((t) => t.column));
    const next = new Set(selected);
    for (const col of current) {
      if (!next.has(col)) fftStore.removeFftTrace(col);
    }
    for (const col of next) {
      if (!current.has(col)) handleFetchFft(col);
    }
  };
  const handleColorChange = (col, color) => {
    fftStore.updateFftTraceColor(col, color);
    updateFftChart();
  };
  const handleOpenFilter = (col) => {
    console.log("Open filter for", col);
  };
  onMount(() => {
    if (!chartContainerRef) return;
    registerTheme$1();
    chartInstance = init(chartContainerRef, echartsThemeName(), {
      renderer: "canvas"
    });
    resizeObserver = new ResizeObserver(() => chartInstance?.resize());
    resizeObserver.observe(chartContainerRef);
    updateFftChart();
  });
  createEffect(() => {
    const tab = activeTab();
    if (tab === "spectrogram" && spectrogramResult()) {
      updateSpectrogramChart();
    } else if (tab === "fft" && fftTraces().length > 0) {
      updateFftChart();
    }
  });
  onCleanup(() => {
    resizeObserver?.disconnect();
    chartInstance?.dispose();
  });
  return (() => {
    var _el$ = _tmpl$6(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$6 = _el$3.nextSibling, _el$20 = _el$2.nextSibling, _el$21 = _el$20.firstChild, _el$25 = _el$20.nextSibling, _el$26 = _el$25.firstChild, _el$27 = _el$26.nextSibling, _el$28 = _el$27.firstChild, _el$29 = _el$28.nextSibling, _el$30 = _el$29.nextSibling;
    _el$4.$$click = () => setActiveTab("fft");
    _el$5.$$click = () => setActiveTab("spectrogram");
    insert(_el$6, createComponent(Show, {
      get when() {
        return activeTab() === "fft";
      },
      get children() {
        return [(() => {
          var _el$7 = _tmpl$(), _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling;
          _el$9.addEventListener("change", (e) => {
            setFftMode(e.currentTarget.value);
            updateFftChart();
          });
          createRenderEffect((_p$) => {
            var _v$ = styles.controlGroup, _v$2 = styles.label, _v$3 = styles.select;
            _v$ !== _p$.e && className(_el$7, _p$.e = _v$);
            _v$2 !== _p$.t && className(_el$8, _p$.t = _v$2);
            _v$3 !== _p$.a && className(_el$9, _p$.a = _v$3);
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0
          });
          createRenderEffect(() => _el$9.value = fftMode());
          return _el$7;
        })(), (() => {
          var _el$0 = _tmpl$2(), _el$1 = _el$0.firstChild, _el$10 = _el$1.firstChild;
          _el$10.addEventListener("change", (e) => {
            setLogScale(e.currentTarget.checked);
            updateFftChart();
          });
          createRenderEffect((_p$) => {
            var _v$4 = styles.controlGroup, _v$5 = styles.checkboxLabel;
            _v$4 !== _p$.e && className(_el$0, _p$.e = _v$4);
            _v$5 !== _p$.t && className(_el$1, _p$.t = _v$5);
            return _p$;
          }, {
            e: void 0,
            t: void 0
          });
          createRenderEffect(() => _el$10.checked = logScale());
          return _el$0;
        })()];
      }
    }));
    insert(_el$, createComponent(Show, {
      get when() {
        return activeTab() === "fft";
      },
      get children() {
        var _el$11 = _tmpl$3();
        insert(_el$11, createComponent(ColumnChips, {
          get columns() {
            return numericCols();
          },
          get selected() {
            return selectedColumns();
          },
          get colors() {
            return columnColors();
          },
          get colorScalePalette() {
            return getColorPalette(uiStore.state.colorScale, numericCols().length);
          },
          onChange: handleChipChange,
          onColorChange: handleColorChange,
          onOpenFilter: handleOpenFilter
        }));
        createRenderEffect(() => className(_el$11, styles.chipsBar));
        return _el$11;
      }
    }), _el$20);
    insert(_el$, createComponent(Show, {
      get when() {
        return activeTab() === "spectrogram";
      },
      get children() {
        var _el$12 = _tmpl$4(), _el$13 = _el$12.firstChild, _el$14 = _el$13.firstChild, _el$15 = _el$14.nextSibling, _el$16 = _el$13.nextSibling, _el$17 = _el$16.firstChild, _el$18 = _el$17.nextSibling, _el$19 = _el$16.nextSibling;
        _el$15.addEventListener("change", (e) => setSpectrogramWindow(parseInt(e.currentTarget.value)));
        insert(_el$15, createComponent(For, {
          each: SPECTRAL_PRESETS,
          children: (preset) => (() => {
            var _el$31 = _tmpl$7();
            insert(_el$31, () => preset.label);
            createRenderEffect(() => _el$31.value = preset.windowSize);
            return _el$31;
          })()
        }));
        _el$18.addEventListener("change", (e) => setSpectrogramHop(parseInt(e.currentTarget.value)));
        insert(_el$18, createComponent(For, {
          get each() {
            return SPECTRAL_PRESETS.filter((p) => p.windowSize <= spectrogramWindow());
          },
          children: (preset) => (() => {
            var _el$32 = _tmpl$7();
            insert(_el$32, () => Math.floor(preset.windowSize / 2));
            createRenderEffect(() => _el$32.value = Math.floor(preset.windowSize / 2));
            return _el$32;
          })()
        }));
        _el$19.$$click = handleFetchSpectrogram;
        createRenderEffect((_p$) => {
          var _v$6 = styles.spectrogramControls, _v$7 = styles.controlGroup, _v$8 = styles.label, _v$9 = styles.select, _v$0 = styles.controlGroup, _v$1 = styles.label, _v$10 = styles.select, _v$11 = styles.computeBtn;
          _v$6 !== _p$.e && className(_el$12, _p$.e = _v$6);
          _v$7 !== _p$.t && className(_el$13, _p$.t = _v$7);
          _v$8 !== _p$.a && className(_el$14, _p$.a = _v$8);
          _v$9 !== _p$.o && className(_el$15, _p$.o = _v$9);
          _v$0 !== _p$.i && className(_el$16, _p$.i = _v$0);
          _v$1 !== _p$.n && className(_el$17, _p$.n = _v$1);
          _v$10 !== _p$.s && className(_el$18, _p$.s = _v$10);
          _v$11 !== _p$.h && className(_el$19, _p$.h = _v$11);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0,
          n: void 0,
          s: void 0,
          h: void 0
        });
        createRenderEffect(() => _el$15.value = spectrogramWindow());
        createRenderEffect(() => _el$18.value = spectrogramHop());
        return _el$12;
      }
    }), _el$20);
    var _ref$ = chartContainerRef;
    typeof _ref$ === "function" ? use(_ref$, _el$21) : chartContainerRef = _el$21;
    insert(_el$20, createComponent(Show, {
      get when() {
        return loading();
      },
      get children() {
        var _el$22 = _tmpl$5(), _el$23 = _el$22.firstChild, _el$24 = _el$23.nextSibling;
        insert(_el$24, status);
        createRenderEffect((_p$) => {
          var _v$12 = styles.loadingOverlay, _v$13 = styles.spinner;
          _v$12 !== _p$.e && className(_el$22, _p$.e = _v$12);
          _v$13 !== _p$.t && className(_el$23, _p$.t = _v$13);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$22;
      }
    }), null);
    insert(_el$26, status);
    _el$28.disabled = !chartInstance;
    _el$29.disabled = !chartInstance;
    _el$30.disabled = !chartInstance;
    createRenderEffect((_p$) => {
      var _v$14 = styles.page, _v$15 = styles.toolbar, _v$16 = styles.tabs, _v$17 = `${styles.tab} ${activeTab() === "fft" ? styles.active : ""}`, _v$18 = `${styles.tab} ${activeTab() === "spectrogram" ? styles.active : ""}`, _v$19 = styles.toolbarRight, _v$20 = styles.chartContainer, _v$21 = styles.chart, _v$22 = styles.footer, _v$23 = styles.status, _v$24 = styles.exportButtons, _v$25 = styles.exportBtn, _v$26 = styles.exportBtn, _v$27 = styles.exportBtn;
      _v$14 !== _p$.e && className(_el$, _p$.e = _v$14);
      _v$15 !== _p$.t && className(_el$2, _p$.t = _v$15);
      _v$16 !== _p$.a && className(_el$3, _p$.a = _v$16);
      _v$17 !== _p$.o && className(_el$4, _p$.o = _v$17);
      _v$18 !== _p$.i && className(_el$5, _p$.i = _v$18);
      _v$19 !== _p$.n && className(_el$6, _p$.n = _v$19);
      _v$20 !== _p$.s && className(_el$20, _p$.s = _v$20);
      _v$21 !== _p$.h && className(_el$21, _p$.h = _v$21);
      _v$22 !== _p$.r && className(_el$25, _p$.r = _v$22);
      _v$23 !== _p$.d && className(_el$26, _p$.d = _v$23);
      _v$24 !== _p$.l && className(_el$27, _p$.l = _v$24);
      _v$25 !== _p$.u && className(_el$28, _p$.u = _v$25);
      _v$26 !== _p$.c && className(_el$29, _p$.c = _v$26);
      _v$27 !== _p$.w && className(_el$30, _p$.w = _v$27);
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
      w: void 0
    });
    return _el$;
  })();
};
delegateEvents(["click"]);

export { FftPage as default };
//# sourceMappingURL=FftPage.DZw9bPtI.js.map
