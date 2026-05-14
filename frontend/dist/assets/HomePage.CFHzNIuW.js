import { r as useNavigate, i as insert, h as createComponent, A, b as createRenderEffect, n as className, t as template, k as delegateEvents } from './index.DjSmm6wY.js';

const page = "_page_5i3qm_1";
const hero = "_hero_5i3qm_10";
const heroIcon = "_heroIcon_5i3qm_20";
const title = "_title_5i3qm_38";
const tagline = "_tagline_5i3qm_45";
const ctaButton = "_ctaButton_5i3qm_52";
const datasets = "_datasets_5i3qm_71";
const sectionTitle = "_sectionTitle_5i3qm_76";
const sectionCopy = "_sectionCopy_5i3qm_83";
const datasetsGrid = "_datasetsGrid_5i3qm_89";
const datasetCard = "_datasetCard_5i3qm_95";
const datasetHeader = "_datasetHeader_5i3qm_114";
const datasetIcon = "_datasetIcon_5i3qm_120";
const datasetInfo = "_datasetInfo_5i3qm_137";
const datasetName = "_datasetName_5i3qm_142";
const datasetMeta = "_datasetMeta_5i3qm_148";
const datasetDesc = "_datasetDesc_5i3qm_153";
const datasetTags = "_datasetTags_5i3qm_159";
const datasetTag = "_datasetTag_5i3qm_159";
const tagRows = "_tagRows_5i3qm_178";
const section = "_section_5i3qm_76";
const grid = "_grid_5i3qm_194";
const gridWorkflow = "_gridWorkflow_5i3qm_201";
const card = "_card_5i3qm_205";
const cardIcon = "_cardIcon_5i3qm_225";
const cardTitle = "_cardTitle_5i3qm_241";
const cardDesc = "_cardDesc_5i3qm_261";
const shortcuts = "_shortcuts_5i3qm_267";
const shortcutsGrid = "_shortcutsGrid_5i3qm_272";
const shortcutGroup = "_shortcutGroup_5i3qm_279";
const shortcutGroupTitle = "_shortcutGroupTitle_5i3qm_285";
const shortcutRow = "_shortcutRow_5i3qm_292";
const styles = {
	page: page,
	hero: hero,
	heroIcon: heroIcon,
	title: title,
	tagline: tagline,
	ctaButton: ctaButton,
	datasets: datasets,
	sectionTitle: sectionTitle,
	sectionCopy: sectionCopy,
	datasetsGrid: datasetsGrid,
	datasetCard: datasetCard,
	datasetHeader: datasetHeader,
	datasetIcon: datasetIcon,
	datasetInfo: datasetInfo,
	datasetName: datasetName,
	datasetMeta: datasetMeta,
	datasetDesc: datasetDesc,
	datasetTags: datasetTags,
	datasetTag: datasetTag,
	tagRows: tagRows,
	section: section,
	grid: grid,
	gridWorkflow: gridWorkflow,
	card: card,
	cardIcon: cardIcon,
	cardTitle: cardTitle,
	cardDesc: cardDesc,
	shortcuts: shortcuts,
	shortcutsGrid: shortcutsGrid,
	shortcutGroup: shortcutGroup,
	shortcutGroupTitle: shortcutGroupTitle,
	shortcutRow: shortcutRow
};

var _tmpl$ = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"></path><polyline points="11 5 8 2 5 5"></polyline><line x1=8 y1=2 x2=8 y2=11>`), _tmpl$2 = /* @__PURE__ */ template(`<h3>Upload <kbd>⌥1`), _tmpl$3 = /* @__PURE__ */ template(`<p>Drag & drop CSV or Parquet files. Preview column profiles before ingesting. Select a column subset and time slice for partial loads.`), _tmpl$4 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,10 4,6 7,12 10,3 13,8 15,7">`), _tmpl$5 = /* @__PURE__ */ template(`<h3>Timeseries <kbd>⌥2`), _tmpl$6 = /* @__PURE__ */ template(`<p>WebGPU-accelerated multi-series chart with zoom, custom colors, rolling bands, anomaly detection, and adaptive line filters.`), _tmpl$7 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=1 y=1 width=4 height=4 rx=0.5></rect><rect x=6 y=1 width=4 height=4 rx=0.5></rect><rect x=11 y=1 width=4 height=4 rx=0.5></rect><rect x=1 y=6 width=4 height=4 rx=0.5></rect><rect x=6 y=6 width=4 height=4 rx=0.5></rect><rect x=11 y=6 width=4 height=4 rx=0.5></rect><rect x=1 y=11 width=4 height=4 rx=0.5></rect><rect x=6 y=11 width=4 height=4 rx=0.5></rect><rect x=11 y=11 width=4 height=4 rx=0.5>`), _tmpl$8 = /* @__PURE__ */ template(`<h3>Correlations <kbd>⌥7`), _tmpl$9 = /* @__PURE__ */ template(`<p>Screen pairs in the correlation heatmap, then jump into the detailed scatter view for the promising relationships.`), _tmpl$0 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><circle cx=4 cy=11 r=1.2></circle><circle cx=8 cy=6 r=1.2></circle><circle cx=12 cy=9 r=1.2></circle><circle cx=6 cy=13 r=1.2></circle><circle cx=11 cy=3 r=1.2>`), _tmpl$1 = /* @__PURE__ */ template(`<h3>Scatter / Density <kbd>⌥3`), _tmpl$10 = /* @__PURE__ */ template(`<p>Inspect the selected pair in detail, color by an extra column, and switch to matrix view with <kbd>⌥4</kbd> for pairwise screening inside the same workspace.`), _tmpl$11 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,8 3,4 5,10 7,2 9,12 11,6 13,8 15,8">`), _tmpl$12 = /* @__PURE__ */ template(`<h3>FFT / PSD <kbd>⌥6`), _tmpl$13 = /* @__PURE__ */ template(`<p>Frequency-domain analysis with magnitude or power spectral density. Log scale, multi-trace overlay, zoom, and PNG/SVG/CSV export.`), _tmpl$14 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=1 y=2 width=2 height=12 rx=0.3></rect><rect x=4 y=4 width=2 height=8 rx=0.3></rect><rect x=7 y=1 width=2 height=14 rx=0.3></rect><rect x=10 y=5 width=2 height=6 rx=0.3></rect><rect x=13 y=3 width=2 height=10 rx=0.3>`), _tmpl$15 = /* @__PURE__ */ template(`<h3>Spectrogram <kbd>⌥8`), _tmpl$16 = /* @__PURE__ */ template(`<p>Time-frequency heatmap using short-time FFT. Adjustable window size, log scale, zoom, and PNG export.`), _tmpl$17 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><circle cx=3 cy=8 r=2></circle><circle cx=13 cy=4 r=2></circle><circle cx=13 cy=12 r=2></circle><line x1=5 y1=7.2 x2=11 y2=4.8></line><line x1=5 y1=8.8 x2=11 y2=11.2>`), _tmpl$18 = /* @__PURE__ */ template(`<h3>Causal Discovery <kbd>⌥9`), _tmpl$19 = /* @__PURE__ */ template(`<p>PCMCI, PCMCI+, FullCI, BivCI, and LPCMCI via Tigramite. Directed graph with edge lag and p-value labels. Export to JSON or torch_geometric.`), _tmpl$20 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=1 y=7 width=3 height=7 rx=0.5></rect><rect x=5 y=4 width=3 height=10 rx=0.5></rect><rect x=9 y=6 width=3 height=8 rx=0.5></rect><rect x=13 y=2 width=2 height=12 rx=0.5></rect><polyline points="1,5 5,2 9,4 13,1"stroke-dasharray="2 1.5">`), _tmpl$21 = /* @__PURE__ */ template(`<h3>Drift Analysis <kbd>⌥0`), _tmpl$22 = /* @__PURE__ */ template(`<p>Compare windows and detect distribution or score shifts once the main workflow has identified the slices worth monitoring.`), _tmpl$23 = /* @__PURE__ */ template(`<div><div><div><svg viewBox="0 0 32 32"fill=none stroke=currentColor stroke-width=1.6 stroke-linecap=round stroke-linejoin=round><polyline points="2,18 7,10 12,22 17,6 22,16 27,12 30,12"></polyline></svg></div><h1>EdaTime</h1><p>Interactive time-series analytics — upload a CSV or Parquet, explore, and export.</p></div><div><div><h2>Try a sample dataset</h2><p>No data on hand? Start exploring with one of these ready-to-load datasets.</p></div><div></div></div><div><h2>Recommended workflow</h2><p>Start with the core path, then branch into advanced analyses only after you know which columns and intervals matter.</p></div><div></div><div><h2>Advanced analyses</h2><p>Use these pages after the workflow above has narrowed the signal, time window, or candidate variables.</p></div><div></div><div><h2>Keyboard shortcuts</h2><div><div><h4>Navigation</h4><div><kbd>⌥1–3, 6–0</kbd><span>Switch major pages</span></div><div><kbd>⌥4</kbd><span>Open scatter matrix view</span></div><div><kbd>Ctrl+K</kbd><span>Command palette</span></div><div><kbd>Ctrl+I</kbd><span>Analysis context panel</span></div></div><div><h4>Chart</h4><div><kbd>Double-click</kbd><span>Reset zoom</span></div><div><kbd>Ctrl+click</kbd><span>Set adaptive filter target</span></div><div><kbd>Drag</kbd><span>Pan / draw</span></div></div><div><h4>Session</h4><div><kbd>Ctrl+S</kbd><span>Save session</span></div><div><kbd>Ctrl+Shift+S</kbd><span>Export session file</span></div><div><kbd>Ctrl+O</kbd><span>Import session file</span></div></div><div><h4>Drift</h4><div><kbd>Enter / D</kbd><span>Run drift compute</span></div><div><kbd>E</kbd><span>Export drift CSV</span></div><div><kbd>J / P</kbd><span>Export JSON / PNG`), _tmpl$24 = /* @__PURE__ */ template(`<button type=button><div><div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,10 4,6 7,12 10,3 13,8 15,7"></polyline></svg></div><div><div></div><div></div></div></div><p></p><div><span>`), _tmpl$25 = /* @__PURE__ */ template(`<span>`);
const SAMPLE_DATASETS = [{
  id: "ettm2",
  name: "ETTm2",
  meta: "70,320 rows × 7 columns",
  desc: "Industrial fault detection dataset with temperature, pressure, and quality measurements from a power plant.",
  tags: ["multivariate", "industrial", "7 cols"],
  rows: "70K rows"
}, {
  id: "sinusoidal",
  name: "Sinusoidal",
  meta: "5,000 rows × 4 columns",
  desc: "Synthetic multi-frequency sine waves with varying amplitudes and noise levels for testing.",
  tags: ["synthetic", "periodic", "4 cols"],
  rows: "5K rows"
}, {
  id: "weather",
  name: "Weather",
  meta: "5,000 rows × 5 columns",
  desc: "Daily weather observations with temperature, humidity, and pressure readings across multiple cities.",
  tags: ["real-world", "time-series", "5 cols"],
  rows: "5K rows"
}];
const HomePage = () => {
  const navigate = useNavigate();
  const handleSampleClick = (id) => {
    sessionStorage.setItem("sampleDataset", id);
    navigate("/upload");
  };
  return (() => {
    var _el$ = _tmpl$23(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$4.nextSibling, _el$6 = _el$2.nextSibling, _el$7 = _el$6.firstChild, _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling, _el$0 = _el$7.nextSibling, _el$1 = _el$6.nextSibling, _el$10 = _el$1.firstChild, _el$11 = _el$10.nextSibling, _el$12 = _el$1.nextSibling, _el$25 = _el$12.nextSibling, _el$26 = _el$25.firstChild, _el$27 = _el$26.nextSibling, _el$28 = _el$25.nextSibling, _el$41 = _el$28.nextSibling, _el$42 = _el$41.firstChild, _el$43 = _el$42.nextSibling, _el$44 = _el$43.firstChild, _el$45 = _el$44.firstChild, _el$46 = _el$45.nextSibling, _el$47 = _el$46.nextSibling, _el$48 = _el$47.nextSibling, _el$49 = _el$48.nextSibling, _el$50 = _el$44.nextSibling, _el$51 = _el$50.firstChild, _el$52 = _el$51.nextSibling, _el$53 = _el$52.nextSibling, _el$54 = _el$53.nextSibling, _el$55 = _el$50.nextSibling, _el$56 = _el$55.firstChild, _el$57 = _el$56.nextSibling, _el$58 = _el$57.nextSibling, _el$59 = _el$58.nextSibling, _el$60 = _el$55.nextSibling, _el$61 = _el$60.firstChild, _el$62 = _el$61.nextSibling, _el$63 = _el$62.nextSibling, _el$64 = _el$63.nextSibling;
    insert(_el$2, createComponent(A, {
      href: "/upload",
      get ["class"]() {
        return styles.ctaButton;
      },
      children: "Upload a file to get started"
    }), null);
    insert(_el$0, () => SAMPLE_DATASETS.map((ds) => (() => {
      var _el$65 = _tmpl$24(), _el$66 = _el$65.firstChild, _el$67 = _el$66.firstChild, _el$68 = _el$67.nextSibling, _el$69 = _el$68.firstChild, _el$70 = _el$69.nextSibling, _el$71 = _el$66.nextSibling, _el$72 = _el$71.nextSibling, _el$73 = _el$72.firstChild;
      _el$65.$$click = () => handleSampleClick(ds.id);
      insert(_el$69, () => ds.name);
      insert(_el$70, () => ds.meta);
      insert(_el$71, () => ds.desc);
      insert(_el$72, () => ds.tags.map((tag) => (() => {
        var _el$74 = _tmpl$25();
        insert(_el$74, tag);
        createRenderEffect(() => className(_el$74, styles.datasetTag));
        return _el$74;
      })()), _el$73);
      insert(_el$73, () => ds.rows);
      createRenderEffect((_p$) => {
        var _v$41 = styles.datasetCard, _v$42 = styles.datasetHeader, _v$43 = styles.datasetIcon, _v$44 = styles.datasetInfo, _v$45 = styles.datasetName, _v$46 = styles.datasetMeta, _v$47 = styles.datasetDesc, _v$48 = styles.datasetTags, _v$49 = `${styles.datasetTag} ${styles.tagRows}`;
        _v$41 !== _p$.e && className(_el$65, _p$.e = _v$41);
        _v$42 !== _p$.t && className(_el$66, _p$.t = _v$42);
        _v$43 !== _p$.a && className(_el$67, _p$.a = _v$43);
        _v$44 !== _p$.o && className(_el$68, _p$.o = _v$44);
        _v$45 !== _p$.i && className(_el$69, _p$.i = _v$45);
        _v$46 !== _p$.n && className(_el$70, _p$.n = _v$46);
        _v$47 !== _p$.s && className(_el$71, _p$.s = _v$47);
        _v$48 !== _p$.h && className(_el$72, _p$.h = _v$48);
        _v$49 !== _p$.r && className(_el$73, _p$.r = _v$49);
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
        r: void 0
      });
      return _el$65;
    })()));
    insert(_el$12, createComponent(A, {
      href: "/upload",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "upload",
      get children() {
        return [(() => {
          var _el$13 = _tmpl$();
          createRenderEffect(() => className(_el$13, styles.cardIcon));
          return _el$13;
        })(), (() => {
          var _el$14 = _tmpl$2();
          createRenderEffect(() => className(_el$14, styles.cardTitle));
          return _el$14;
        })(), (() => {
          var _el$15 = _tmpl$3();
          createRenderEffect(() => className(_el$15, styles.cardDesc));
          return _el$15;
        })()];
      }
    }), null);
    insert(_el$12, createComponent(A, {
      href: "/timeseries",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "timeseries",
      get children() {
        return [(() => {
          var _el$16 = _tmpl$4();
          createRenderEffect(() => className(_el$16, styles.cardIcon));
          return _el$16;
        })(), (() => {
          var _el$17 = _tmpl$5();
          createRenderEffect(() => className(_el$17, styles.cardTitle));
          return _el$17;
        })(), (() => {
          var _el$18 = _tmpl$6();
          createRenderEffect(() => className(_el$18, styles.cardDesc));
          return _el$18;
        })()];
      }
    }), null);
    insert(_el$12, createComponent(A, {
      href: "/heatmap",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "heatmap",
      get children() {
        return [(() => {
          var _el$19 = _tmpl$7();
          createRenderEffect(() => className(_el$19, styles.cardIcon));
          return _el$19;
        })(), (() => {
          var _el$20 = _tmpl$8();
          createRenderEffect(() => className(_el$20, styles.cardTitle));
          return _el$20;
        })(), (() => {
          var _el$21 = _tmpl$9();
          createRenderEffect(() => className(_el$21, styles.cardDesc));
          return _el$21;
        })()];
      }
    }), null);
    insert(_el$12, createComponent(A, {
      href: "/scatter",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "scatter",
      get children() {
        return [(() => {
          var _el$22 = _tmpl$0();
          createRenderEffect(() => className(_el$22, styles.cardIcon));
          return _el$22;
        })(), (() => {
          var _el$23 = _tmpl$1();
          createRenderEffect(() => className(_el$23, styles.cardTitle));
          return _el$23;
        })(), (() => {
          var _el$24 = _tmpl$10();
          createRenderEffect(() => className(_el$24, styles.cardDesc));
          return _el$24;
        })()];
      }
    }), null);
    insert(_el$28, createComponent(A, {
      href: "/fft",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "fft",
      get children() {
        return [(() => {
          var _el$29 = _tmpl$11();
          createRenderEffect(() => className(_el$29, styles.cardIcon));
          return _el$29;
        })(), (() => {
          var _el$30 = _tmpl$12();
          createRenderEffect(() => className(_el$30, styles.cardTitle));
          return _el$30;
        })(), (() => {
          var _el$31 = _tmpl$13();
          createRenderEffect(() => className(_el$31, styles.cardDesc));
          return _el$31;
        })()];
      }
    }), null);
    insert(_el$28, createComponent(A, {
      href: "/spectrogram",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "spectrogram",
      get children() {
        return [(() => {
          var _el$32 = _tmpl$14();
          createRenderEffect(() => className(_el$32, styles.cardIcon));
          return _el$32;
        })(), (() => {
          var _el$33 = _tmpl$15();
          createRenderEffect(() => className(_el$33, styles.cardTitle));
          return _el$33;
        })(), (() => {
          var _el$34 = _tmpl$16();
          createRenderEffect(() => className(_el$34, styles.cardDesc));
          return _el$34;
        })()];
      }
    }), null);
    insert(_el$28, createComponent(A, {
      href: "/causal",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "causal",
      get children() {
        return [(() => {
          var _el$35 = _tmpl$17();
          createRenderEffect(() => className(_el$35, styles.cardIcon));
          return _el$35;
        })(), (() => {
          var _el$36 = _tmpl$18();
          createRenderEffect(() => className(_el$36, styles.cardTitle));
          return _el$36;
        })(), (() => {
          var _el$37 = _tmpl$19();
          createRenderEffect(() => className(_el$37, styles.cardDesc));
          return _el$37;
        })()];
      }
    }), null);
    insert(_el$28, createComponent(A, {
      href: "/drift",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "drift",
      get children() {
        return [(() => {
          var _el$38 = _tmpl$20();
          createRenderEffect(() => className(_el$38, styles.cardIcon));
          return _el$38;
        })(), (() => {
          var _el$39 = _tmpl$21();
          createRenderEffect(() => className(_el$39, styles.cardTitle));
          return _el$39;
        })(), (() => {
          var _el$40 = _tmpl$22();
          createRenderEffect(() => className(_el$40, styles.cardDesc));
          return _el$40;
        })()];
      }
    }), null);
    createRenderEffect((_p$) => {
      var _v$ = styles.page, _v$2 = styles.hero, _v$3 = styles.heroIcon, _v$4 = styles.title, _v$5 = styles.tagline, _v$6 = styles.datasets, _v$7 = styles.section, _v$8 = styles.sectionTitle, _v$9 = styles.sectionCopy, _v$0 = styles.datasetsGrid, _v$1 = styles.section, _v$10 = styles.sectionTitle, _v$11 = styles.sectionCopy, _v$12 = `${styles.grid} ${styles.gridWorkflow}`, _v$13 = styles.section, _v$14 = styles.sectionTitle, _v$15 = styles.sectionCopy, _v$16 = styles.grid, _v$17 = styles.shortcuts, _v$18 = styles.sectionTitle, _v$19 = styles.shortcutsGrid, _v$20 = styles.shortcutGroup, _v$21 = styles.shortcutGroupTitle, _v$22 = styles.shortcutRow, _v$23 = styles.shortcutRow, _v$24 = styles.shortcutRow, _v$25 = styles.shortcutRow, _v$26 = styles.shortcutGroup, _v$27 = styles.shortcutGroupTitle, _v$28 = styles.shortcutRow, _v$29 = styles.shortcutRow, _v$30 = styles.shortcutRow, _v$31 = styles.shortcutGroup, _v$32 = styles.shortcutGroupTitle, _v$33 = styles.shortcutRow, _v$34 = styles.shortcutRow, _v$35 = styles.shortcutRow, _v$36 = styles.shortcutGroup, _v$37 = styles.shortcutGroupTitle, _v$38 = styles.shortcutRow, _v$39 = styles.shortcutRow, _v$40 = styles.shortcutRow;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$4, _p$.o = _v$4);
      _v$5 !== _p$.i && className(_el$5, _p$.i = _v$5);
      _v$6 !== _p$.n && className(_el$6, _p$.n = _v$6);
      _v$7 !== _p$.s && className(_el$7, _p$.s = _v$7);
      _v$8 !== _p$.h && className(_el$8, _p$.h = _v$8);
      _v$9 !== _p$.r && className(_el$9, _p$.r = _v$9);
      _v$0 !== _p$.d && className(_el$0, _p$.d = _v$0);
      _v$1 !== _p$.l && className(_el$1, _p$.l = _v$1);
      _v$10 !== _p$.u && className(_el$10, _p$.u = _v$10);
      _v$11 !== _p$.c && className(_el$11, _p$.c = _v$11);
      _v$12 !== _p$.w && className(_el$12, _p$.w = _v$12);
      _v$13 !== _p$.m && className(_el$25, _p$.m = _v$13);
      _v$14 !== _p$.f && className(_el$26, _p$.f = _v$14);
      _v$15 !== _p$.y && className(_el$27, _p$.y = _v$15);
      _v$16 !== _p$.g && className(_el$28, _p$.g = _v$16);
      _v$17 !== _p$.p && className(_el$41, _p$.p = _v$17);
      _v$18 !== _p$.b && className(_el$42, _p$.b = _v$18);
      _v$19 !== _p$.T && className(_el$43, _p$.T = _v$19);
      _v$20 !== _p$.A && className(_el$44, _p$.A = _v$20);
      _v$21 !== _p$.O && className(_el$45, _p$.O = _v$21);
      _v$22 !== _p$.I && className(_el$46, _p$.I = _v$22);
      _v$23 !== _p$.S && className(_el$47, _p$.S = _v$23);
      _v$24 !== _p$.W && className(_el$48, _p$.W = _v$24);
      _v$25 !== _p$.C && className(_el$49, _p$.C = _v$25);
      _v$26 !== _p$.B && className(_el$50, _p$.B = _v$26);
      _v$27 !== _p$.v && className(_el$51, _p$.v = _v$27);
      _v$28 !== _p$.k && className(_el$52, _p$.k = _v$28);
      _v$29 !== _p$.x && className(_el$53, _p$.x = _v$29);
      _v$30 !== _p$.j && className(_el$54, _p$.j = _v$30);
      _v$31 !== _p$.q && className(_el$55, _p$.q = _v$31);
      _v$32 !== _p$.z && className(_el$56, _p$.z = _v$32);
      _v$33 !== _p$.P && className(_el$57, _p$.P = _v$33);
      _v$34 !== _p$.H && className(_el$58, _p$.H = _v$34);
      _v$35 !== _p$.F && className(_el$59, _p$.F = _v$35);
      _v$36 !== _p$.M && className(_el$60, _p$.M = _v$36);
      _v$37 !== _p$.D && className(_el$61, _p$.D = _v$37);
      _v$38 !== _p$.R && className(_el$62, _p$.R = _v$38);
      _v$39 !== _p$.E && className(_el$63, _p$.E = _v$39);
      _v$40 !== _p$.L && className(_el$64, _p$.L = _v$40);
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
      L: void 0
    });
    return _el$;
  })();
};
delegateEvents(["click"]);

export { HomePage as default };
//# sourceMappingURL=HomePage.CFHzNIuW.js.map
