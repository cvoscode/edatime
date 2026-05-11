import { c as createSignal, o as onMount, a as onCleanup, i as insert, m as memo, b as createRenderEffect, s as setAttribute, t as template, u as use, d as createMemo, e as createComponent, f as className, g as setStyleProperty, F as For, h as delegateEvents, j as createEffect, k as addEventListener, S as Show, l as style, n as useNavigate, p as datasetStore, q as uiStore, r as chartStore } from './index.ejaTb3X2.js';
import { M as Modal } from './Dropdown.zvInWQuU.js';
import { S as SwitchToggle } from './SwitchToggle.DmpyzbKN.js';

var _tmpl$$4 = /* @__PURE__ */ template(`<div class=chart-container style=width:100%;height:100%;position:relative>`), _tmpl$2$3 = /* @__PURE__ */ template(`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted, #888)">Loading chart engine...`), _tmpl$3$2 = /* @__PURE__ */ template(`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted, #888);font-size:14px">Chart engine unavailable`);
const ChartView = (props) => {
  let containerRef;
  const [status, setStatus] = createSignal("loading");
  let chartInstance = null;
  onMount(async () => {
    if (!containerRef) return;
    try {
      const isDev = false;
      const chartgpuUrl = isDev ? "/frontend/libs/chartgpu/index.js" : "/frontend/libs/chartgpu/index.js";
      const resp = await fetch(chartgpuUrl);
      if (!resp.ok) throw new Error(`ChartGPU fetch failed: ${resp.status}`);
      const code = await resp.text();
      const blob = new Blob([code], {
        type: "application/javascript"
      });
      const objectUrl = URL.createObjectURL(blob);
      const mod = await import(
        /* @vite-ignore */
        objectUrl
      );
      const createChart = mod.createChart ?? mod.default?.createChart;
      if (!createChart) throw new Error("createChart not found");
      const chartOptions = {
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
        series: []
      };
      chartInstance = await createChart(containerRef, chartOptions);
      setStatus("ready");
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.warn("ChartGPU not available:", e);
      setStatus("error");
    }
  });
  onCleanup(() => {
    if (chartInstance) {
      try {
        chartInstance.dispose?.();
      } catch (_) {
      }
      chartInstance = null;
    }
  });
  return (() => {
    var _el$ = _tmpl$$4();
    var _ref$ = containerRef;
    typeof _ref$ === "function" ? use(_ref$, _el$) : containerRef = _el$;
    insert(_el$, (() => {
      var _c$ = memo(() => status() === "loading");
      return () => _c$() && _tmpl$2$3();
    })(), null);
    insert(_el$, (() => {
      var _c$2 = memo(() => status() === "error");
      return () => _c$2() && _tmpl$3$2();
    })(), null);
    createRenderEffect((_p$) => {
      var _v$ = props.containerId ?? "main-chart", _v$2 = status();
      _v$ !== _p$.e && setAttribute(_el$, "id", _p$.e = _v$);
      _v$2 !== _p$.t && setAttribute(_el$, "data-status", _p$.t = _v$2);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$;
  })();
};

const chips = "_chips_1bvwe_1";
const chip = "_chip_1bvwe_1";
const selected = "_selected_1bvwe_28";
const label$1 = "_label_1bvwe_35";
const checkbox = "_checkbox_1bvwe_39";
const colorPicker = "_colorPicker_1bvwe_46";
const menuBtn = "_menuBtn_1bvwe_75";
const styles$3 = {
	chips: chips,
	chip: chip,
	selected: selected,
	label: label$1,
	checkbox: checkbox,
	colorPicker: colorPicker,
	menuBtn: menuBtn
};

var _tmpl$$3 = /* @__PURE__ */ template(`<div>`), _tmpl$2$2 = /* @__PURE__ */ template(`<label><input type=checkbox><input type=color><span></span><button type=button><svg viewBox="0 0 16 16"fill=currentColor><circle cx=8 cy=3 r=1.5></circle><circle cx=8 cy=8 r=1.5></circle><circle cx=8 cy=13 r=1.5>`);
const SERIES_COLORS = ["#00a8ff", "#ff6b6b", "#51cf66", "#ffd43b", "#cc5de8", "#ff922b", "#22b8cf", "#f06595", "#94d82d", "#748ffc"];
const ColumnChips = (props) => {
  const filteredColumns = createMemo(() => {
    if (!props.filter) return props.columns;
    const lower = props.filter.toLowerCase();
    return props.columns.filter((col) => col.toLowerCase().includes(lower));
  });
  const getColor = (col, idx) => {
    if (props.colors?.[col]) return props.colors[col];
    const numericIdx = props.columns.indexOf(col);
    return SERIES_COLORS[numericIdx >= 0 ? numericIdx : idx % SERIES_COLORS.length];
  };
  const isSelected = (col) => props.selected.includes(col);
  const toggle = (col) => {
    if (isSelected(col)) {
      props.onChange(props.selected.filter((c) => c !== col));
    } else {
      props.onChange([...props.selected, col]);
    }
  };
  const handleColorChange = (col, e) => {
    e.stopPropagation();
    const value = e.target.value;
    props.onColorChange?.(col, value);
  };
  const handleColorPointerDown = (e) => {
    e.stopPropagation();
  };
  const handleMenuClick = (col, e) => {
    e.stopPropagation();
    e.preventDefault();
    props.onOpenFilter?.(col);
  };
  return (() => {
    var _el$ = _tmpl$$3();
    insert(_el$, createComponent(For, {
      get each() {
        return filteredColumns();
      },
      children: (col, idx) => (() => {
        var _el$2 = _tmpl$2$2(), _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$4.nextSibling, _el$6 = _el$5.nextSibling;
        _el$3.addEventListener("change", () => toggle(col));
        _el$4.$$input = (e) => handleColorChange(col, e);
        _el$4.$$click = handleColorPointerDown;
        _el$4.$$mousedown = handleColorPointerDown;
        _el$4.$$pointerdown = handleColorPointerDown;
        setAttribute(_el$4, "title", `Color for ${col}`);
        setAttribute(_el$4, "aria-label", `Color for ${col}`);
        insert(_el$5, col);
        _el$6.$$click = (e) => handleMenuClick(col, e);
        setAttribute(_el$6, "title", `Filter range for ${col}`);
        setAttribute(_el$6, "aria-label", `Filter range for ${col}`);
        createRenderEffect((_p$) => {
          var _v$ = `${styles$3.chip} ${isSelected(col) ? styles$3.selected : ""}`, _v$2 = getColor(col, idx()), _v$3 = styles$3.checkbox, _v$4 = styles$3.colorPicker, _v$5 = styles$3.label, _v$6 = styles$3.menuBtn;
          _v$ !== _p$.e && className(_el$2, _p$.e = _v$);
          _v$2 !== _p$.t && setStyleProperty(_el$2, "--chip-color", _p$.t = _v$2);
          _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
          _v$4 !== _p$.o && className(_el$4, _p$.o = _v$4);
          _v$5 !== _p$.i && className(_el$5, _p$.i = _v$5);
          _v$6 !== _p$.n && className(_el$6, _p$.n = _v$6);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0,
          n: void 0
        });
        createRenderEffect(() => _el$3.checked = isSelected(col));
        createRenderEffect(() => _el$4.value = getColor(col, idx()));
        return _el$2;
      })()
    }));
    createRenderEffect(() => className(_el$, styles$3.chips));
    return _el$;
  })();
};
delegateEvents(["pointerdown", "mousedown", "click", "input"]);

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

var _tmpl$$2 = /* @__PURE__ */ template(`<div><button type=button>Clear</button><div><button type=button>Cancel</button><button type=button>Apply`), _tmpl$2$1 = /* @__PURE__ */ template(`<div>`), _tmpl$3$1 = /* @__PURE__ */ template(`<div><label><span>Column</span><select aria-label="Select column"></select></label><div><label><span>Min</span><input type=number step=0.01 aria-label="Minimum value"></label><label><span>Max</span><input type=number step=0.01 aria-label="Maximum value"></label></div><div><span>Range slider</span><div aria-hidden=true><span></span><span></span></div><div><div></div><input type=range step=0.01 aria-label="Minimum range slider"><input type=range step=0.01 aria-label="Maximum range slider"></div><div><span>Min</span><span>Max`), _tmpl$4 = /* @__PURE__ */ template(`<option>`);
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
          var _el$26 = _tmpl$4();
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
        onChange: (e) => setRollingEnabled(e.currentTarget.checked)
      }), _el$9);
      _el$10.addEventListener("change", (e) => setRollingWindow(parseInt(e.currentTarget.value) || 50));
      insert(_el$13, createComponent(SwitchToggle, {
        get checked() {
          return anomalyEnabled();
        },
        onChange: (e) => setAnomalyEnabled(e.currentTarget.checked)
      }), _el$14);
      _el$17.addEventListener("change", (e) => setAnomalyMethod(e.currentTarget.value));
      _el$20.addEventListener("change", (e) => setAnomalyThreshold(parseFloat(e.currentTarget.value) || 3));
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
const btnSm = "_btnSm_1uhv1_238";
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
	btnSm: btnSm,
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

var _tmpl$ = /* @__PURE__ */ template(`<div data-empty-reason=no-columns-selected><div aria-hidden=true><svg viewBox="0 0 80 48"width=120 height=72 fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><rect x=1 y=1 width=78 height=46 rx=8 opacity=0.12></rect><path d="M12 34 L26 22 L36 28 L50 16 L68 32"></path><circle cx=12 cy=34 r=2 fill=currentColor></circle><circle cx=26 cy=22 r=2 fill=currentColor></circle><circle cx=36 cy=28 r=2 fill=currentColor></circle><circle cx=50 cy=16 r=2 fill=currentColor></circle><circle cx=68 cy=32 r=2 fill=currentColor></circle></svg></div><strong>Select one or more series</strong><span>Click a column chip above or use Upload to add dataset series to the chart. Start with 2–3 related columns for a clearer first view.</span><div><button id=timeseries-empty-upload-btn type=button aria-label="Open upload page">Upload data</button><button id=timeseries-reset-range-btn type=button hidden>Reset to dataset range`), _tmpl$2 = /* @__PURE__ */ template(`<div role=status aria-live=polite aria-label="Chart loading indicator"><div></div><span>Loading data…`), _tmpl$3 = /* @__PURE__ */ template(`<div><div><div role=group aria-label="Series selection tools"><span>Series</span><input type=text id=column-filter-input placeholder="Filter columns…"aria-label="Filter columns"><button id=collapse-series-btn type=button title="Collapse series list"><svg viewBox="0 0 16 16"width=12 height=12 fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="4,6 8,10 12,6"></polyline></svg></button></div></div><div><div role=group aria-label="Drawing tools"><span>Draw</span><select id=draw-tool aria-label="Draw tool"><option value=none>None (Pan)</option><option value=arrow>Arrow</option><option value=box>Box</option></select><input type=color id=draw-color title=Color aria-label="Draw color"><input type=number id=draw-width min=1 max=10 title=Thickness aria-label="Draw thickness"><button id=draw-clear-btn type=button title="Clear drawings">Clear Drawings</button></div><div role=group aria-label="Chart label controls"><button type=button title="Edit chart title and axis labels"><span>Labels</span><span>Title + axes</span></button></div><div role=group aria-label="Note and annotation tools"><button type=button title="Open annotation tools"><span>Notes</span><span>Annotations</span></button></div><div role=group aria-label="Export chart and data options"><button id=export-png-btn type=button title="Export chart as PNG (P)">PNG <kbd>P</kbd></button><button id=export-csv-btn type=button title="Export filtered data as CSV (E)">CSV <kbd>E</kbd></button><button type=button title="More export options"><span>More</span><span>SVG, JSON, Parquet</span></button></div><div role=group aria-label="Analytics controls"><button type=button title="Open analytics controls"><span>Analytics</span><span>Bands, anomalies, cleanup</span></button></div><div role=group aria-label="Zoom controls"><button id=zoom-out-btn type=button title="Zoom out">−</button><span id=zoom-range-badge>—</span><button id=zoom-reset-btn type=button title="Reset zoom to initial view">↺</button></div></div><main id=main><div id=timeseries-overlays><div id=timeseries-colorbar-wrap hidden role=group aria-label="Numeric color column scale"><span id=timeseries-colorbar-name>Color</span><div><span id=timeseries-colorbar-min>0</span><div id=timeseries-colorbar></div><span id=timeseries-colorbar-max>1</span></div></div><div id=timeseries-categorical-wrap hidden role=group aria-label="Categorical color legend"><span id=timeseries-categorical-name>Category</span><div id=timeseries-categorical-legend style=margin-top:8px>`);
const TimeseriesPage = () => {
  const navigate = useNavigate();
  const [drawTool, setDrawTool] = createSignal("none");
  const [drawColor, setDrawColor] = createSignal("#ff0055");
  const [drawWidth, setDrawWidth] = createSignal(2);
  const [showAnalytics, setShowAnalytics] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedColorCol, setSelectedColorCol] = createSignal(null);
  const [seriesFilter, setSeriesFilter] = createSignal("");
  const [collapsed, setCollapsed] = createSignal(false);
  const [filterModalOpen, setFilterModalOpen] = createSignal(false);
  const [filterModalColumn, setFilterModalColumn] = createSignal(null);
  const selectedCols = createMemo(() => datasetStore.state.numericCols);
  const selectedColumns = createMemo(() => {
    const s = uiStore.state.selectedColumns;
    if (s.length === 0 && datasetStore.state.numericCols.length > 0) {
      return [datasetStore.state.numericCols[0]];
    }
    return s;
  });
  const columnBounds = createMemo(() => {
    const bounds = {};
    for (const col of datasetStore.state.numericCols) {
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
  const openFilterModal = (col) => {
    setFilterModalColumn(col);
    setFilterModalOpen(true);
  };
  const handleFilterApply = (column, range) => {
    uiStore.setFilter(column, range);
  };
  const handleFilterClear = (column) => {
    uiStore.removeFilter(column);
  };
  const handleKeyDown = (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.altKey && e.key === "2") {
      e.preventDefault();
    } else if (e.shiftKey && e.key === "R") {
      e.preventDefault();
      chartStore.resetZoom();
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
    }
  };
  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
  });
  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });
  return (() => {
    var _el$ = _tmpl$3(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$6 = _el$5.nextSibling, _el$7 = _el$2.nextSibling, _el$8 = _el$7.firstChild, _el$9 = _el$8.firstChild, _el$0 = _el$9.nextSibling, _el$1 = _el$0.nextSibling, _el$10 = _el$1.nextSibling, _el$11 = _el$10.nextSibling, _el$12 = _el$8.nextSibling, _el$13 = _el$12.firstChild, _el$14 = _el$13.firstChild, _el$15 = _el$14.nextSibling, _el$16 = _el$12.nextSibling, _el$17 = _el$16.firstChild, _el$18 = _el$17.firstChild, _el$19 = _el$18.nextSibling, _el$20 = _el$16.nextSibling, _el$21 = _el$20.firstChild, _el$22 = _el$21.firstChild, _el$23 = _el$22.nextSibling, _el$24 = _el$21.nextSibling, _el$25 = _el$24.firstChild, _el$26 = _el$25.nextSibling, _el$27 = _el$24.nextSibling, _el$28 = _el$27.firstChild, _el$29 = _el$28.nextSibling, _el$30 = _el$20.nextSibling, _el$31 = _el$30.firstChild, _el$32 = _el$31.firstChild, _el$33 = _el$32.nextSibling, _el$34 = _el$30.nextSibling, _el$35 = _el$34.firstChild, _el$36 = _el$35.nextSibling, _el$37 = _el$36.nextSibling, _el$38 = _el$7.nextSibling, _el$49 = _el$38.firstChild, _el$50 = _el$49.firstChild, _el$51 = _el$50.firstChild, _el$52 = _el$51.nextSibling, _el$53 = _el$52.firstChild, _el$54 = _el$53.nextSibling, _el$55 = _el$54.nextSibling, _el$56 = _el$50.nextSibling, _el$57 = _el$56.firstChild, _el$58 = _el$57.nextSibling;
    _el$5.$$input = (e) => setSeriesFilter(e.currentTarget.value);
    _el$6.$$click = () => setCollapsed(!collapsed());
    insert(_el$3, createComponent(Show, {
      get when() {
        return !collapsed();
      },
      get children() {
        return createComponent(ColumnChips, {
          get columns() {
            return selectedCols();
          },
          get selected() {
            return selectedColumns();
          },
          get filter() {
            return seriesFilter();
          },
          onChange: (cols) => uiStore.setSelectedColumns(cols),
          get colors() {
            return uiStore.state.colors;
          },
          onColorChange: (col, color) => uiStore.setColumnColor(col, color),
          onOpenFilter: openFilterModal
        });
      }
    }), null);
    _el$0.addEventListener("change", (e) => setDrawTool(e.currentTarget.value));
    _el$1.addEventListener("change", (e) => setDrawColor(e.currentTarget.value));
    _el$10.addEventListener("change", (e) => setDrawWidth(parseInt(e.currentTarget.value) || 2));
    _el$21.$$click = () => {
    };
    _el$24.$$click = () => {
    };
    _el$31.$$click = () => setShowAnalytics(true);
    _el$35.$$click = () => chartStore.zoomOut();
    _el$37.$$click = () => chartStore.resetZoom();
    insert(_el$38, createComponent(ChartView, {
      containerId: "main-chart"
    }), _el$49);
    insert(_el$38, createComponent(Show, {
      get when() {
        return selectedCols().length === 0;
      },
      get children() {
        var _el$39 = _tmpl$(), _el$40 = _el$39.firstChild, _el$41 = _el$40.nextSibling, _el$42 = _el$41.nextSibling, _el$43 = _el$42.nextSibling, _el$44 = _el$43.firstChild, _el$45 = _el$44.nextSibling;
        _el$44.$$click = () => navigate("/upload");
        createRenderEffect((_p$) => {
          var _v$ = styles.emptyState, _v$2 = styles.emptyIllustration, _v$3 = styles.emptyTitle, _v$4 = styles.emptyMessage, _v$5 = styles.emptyActions, _v$6 = styles.primaryBtn, _v$7 = styles.btnSm;
          _v$ !== _p$.e && className(_el$39, _p$.e = _v$);
          _v$2 !== _p$.t && className(_el$40, _p$.t = _v$2);
          _v$3 !== _p$.a && className(_el$41, _p$.a = _v$3);
          _v$4 !== _p$.o && className(_el$42, _p$.o = _v$4);
          _v$5 !== _p$.i && className(_el$43, _p$.i = _v$5);
          _v$6 !== _p$.n && className(_el$44, _p$.n = _v$6);
          _v$7 !== _p$.s && className(_el$45, _p$.s = _v$7);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0,
          n: void 0,
          s: void 0
        });
        return _el$39;
      }
    }), _el$49);
    insert(_el$38, createComponent(Show, {
      get when() {
        return isLoading();
      },
      get children() {
        var _el$46 = _tmpl$2(), _el$47 = _el$46.firstChild, _el$48 = _el$47.nextSibling;
        createRenderEffect((_p$) => {
          var _v$8 = styles.loadingOverlay, _v$9 = styles.loadingSpinner, _v$0 = styles.loadingLabel;
          _v$8 !== _p$.e && className(_el$46, _p$.e = _v$8);
          _v$9 !== _p$.t && className(_el$47, _p$.t = _v$9);
          _v$0 !== _p$.a && className(_el$48, _p$.a = _v$0);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$46;
      }
    }), _el$49);
    insert(_el$, createComponent(AnalyticsDrawer, {
      get open() {
        return showAnalytics();
      },
      onClose: () => setShowAnalytics(false)
    }), null);
    insert(_el$, createComponent(ColumnFilterModal, {
      get open() {
        return filterModalOpen();
      },
      get column() {
        return filterModalColumn();
      },
      get columns() {
        return selectedColumns();
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
      var _v$1 = styles.page, _v$10 = styles.toolbarSeries, _v$11 = styles.toolbarGroup, _v$12 = styles.toolbarLabel, _v$13 = styles.columnFilterInput, _v$14 = styles.collapseBtn, _v$15 = styles.toolbarTools, _v$16 = styles.toolbarGroup, _v$17 = styles.toolbarLabel, _v$18 = styles.drawSelect, _v$19 = styles.ghostBtn, _v$20 = `${styles.toolbarGroup} ${styles.toolbarGroupSep}`, _v$21 = styles.panelOpenBtn, _v$22 = styles.toolbarLabel, _v$23 = styles.disclosureValue, _v$24 = `${styles.toolbarGroup} ${styles.toolbarGroupSep}`, _v$25 = styles.panelOpenBtn, _v$26 = styles.toolbarLabel, _v$27 = styles.disclosureValue, _v$28 = `${styles.toolbarGroup} ${styles.toolbarGroupPush}`, _v$29 = styles.ghostBtn, _v$30 = styles.toolbarKbd, _v$31 = styles.ghostBtn, _v$32 = styles.toolbarKbd, _v$33 = styles.panelOpenBtn, _v$34 = styles.toolbarLabel, _v$35 = styles.disclosureValue, _v$36 = `${styles.toolbarGroup} ${styles.toolbarGroupSep} ${styles.toolbarGroupPush}`, _v$37 = styles.panelOpenBtn, _v$38 = styles.toolbarLabel, _v$39 = styles.disclosureValue, _v$40 = styles.toolbarGroup, _v$41 = styles.ghostBtn, _v$42 = styles.zoomRangeBadge, _v$43 = styles.ghostBtn, _v$44 = styles.main, _v$45 = styles.overlayStack, _v$46 = styles.colorbarWrap, _v$47 = styles.colorbarName, _v$48 = styles.colorbarScale, _v$49 = styles.colorbarBound, _v$50 = styles.colorbar, _v$51 = styles.colorbarBound, _v$52 = styles.colorbarWrap, _v$53 = styles.colorbarName, _v$54 = styles.distributionLegend;
      _v$1 !== _p$.e && className(_el$, _p$.e = _v$1);
      _v$10 !== _p$.t && className(_el$2, _p$.t = _v$10);
      _v$11 !== _p$.a && className(_el$3, _p$.a = _v$11);
      _v$12 !== _p$.o && className(_el$4, _p$.o = _v$12);
      _v$13 !== _p$.i && className(_el$5, _p$.i = _v$13);
      _v$14 !== _p$.n && className(_el$6, _p$.n = _v$14);
      _v$15 !== _p$.s && className(_el$7, _p$.s = _v$15);
      _v$16 !== _p$.h && className(_el$8, _p$.h = _v$16);
      _v$17 !== _p$.r && className(_el$9, _p$.r = _v$17);
      _v$18 !== _p$.d && className(_el$0, _p$.d = _v$18);
      _v$19 !== _p$.l && className(_el$11, _p$.l = _v$19);
      _v$20 !== _p$.u && className(_el$12, _p$.u = _v$20);
      _v$21 !== _p$.c && className(_el$13, _p$.c = _v$21);
      _v$22 !== _p$.w && className(_el$14, _p$.w = _v$22);
      _v$23 !== _p$.m && className(_el$15, _p$.m = _v$23);
      _v$24 !== _p$.f && className(_el$16, _p$.f = _v$24);
      _v$25 !== _p$.y && className(_el$17, _p$.y = _v$25);
      _v$26 !== _p$.g && className(_el$18, _p$.g = _v$26);
      _v$27 !== _p$.p && className(_el$19, _p$.p = _v$27);
      _v$28 !== _p$.b && className(_el$20, _p$.b = _v$28);
      _v$29 !== _p$.T && className(_el$21, _p$.T = _v$29);
      _v$30 !== _p$.A && className(_el$23, _p$.A = _v$30);
      _v$31 !== _p$.O && className(_el$24, _p$.O = _v$31);
      _v$32 !== _p$.I && className(_el$26, _p$.I = _v$32);
      _v$33 !== _p$.S && className(_el$27, _p$.S = _v$33);
      _v$34 !== _p$.W && className(_el$28, _p$.W = _v$34);
      _v$35 !== _p$.C && className(_el$29, _p$.C = _v$35);
      _v$36 !== _p$.B && className(_el$30, _p$.B = _v$36);
      _v$37 !== _p$.v && className(_el$31, _p$.v = _v$37);
      _v$38 !== _p$.k && className(_el$32, _p$.k = _v$38);
      _v$39 !== _p$.x && className(_el$33, _p$.x = _v$39);
      _v$40 !== _p$.j && className(_el$34, _p$.j = _v$40);
      _v$41 !== _p$.q && className(_el$35, _p$.q = _v$41);
      _v$42 !== _p$.z && className(_el$36, _p$.z = _v$42);
      _v$43 !== _p$.P && className(_el$37, _p$.P = _v$43);
      _v$44 !== _p$.H && className(_el$38, _p$.H = _v$44);
      _v$45 !== _p$.F && className(_el$49, _p$.F = _v$45);
      _v$46 !== _p$.M && className(_el$50, _p$.M = _v$46);
      _v$47 !== _p$.D && className(_el$51, _p$.D = _v$47);
      _v$48 !== _p$.R && className(_el$52, _p$.R = _v$48);
      _v$49 !== _p$.E && className(_el$53, _p$.E = _v$49);
      _v$50 !== _p$.L && className(_el$54, _p$.L = _v$50);
      _v$51 !== _p$.N && className(_el$55, _p$.N = _v$51);
      _v$52 !== _p$.G && className(_el$56, _p$.G = _v$52);
      _v$53 !== _p$.U && className(_el$57, _p$.U = _v$53);
      _v$54 !== _p$.K && className(_el$58, _p$.K = _v$54);
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
      K: void 0
    });
    createRenderEffect(() => _el$5.value = seriesFilter());
    createRenderEffect(() => _el$0.value = drawTool());
    createRenderEffect(() => _el$1.value = drawColor());
    createRenderEffect(() => _el$10.value = drawWidth());
    return _el$;
  })();
};
delegateEvents(["input", "click"]);

export { TimeseriesPage as default };
//# sourceMappingURL=TimeseriesPage.DjAdFYoC.js.map
