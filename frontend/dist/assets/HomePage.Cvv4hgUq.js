import { i as insert, e as createComponent, A, b as createRenderEffect, f as className, t as template, h as delegateEvents } from './index.ejaTb3X2.js';

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
const tagSize = "_tagSize_5i3qm_184";
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
	tagSize: tagSize,
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

var _tmpl$ = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"></path><polyline points="11 5 8 2 5 5"></polyline><line x1=8 y1=2 x2=8 y2=11>`), _tmpl$2 = /* @__PURE__ */ template(`<h3>Upload <kbd>⌥1`), _tmpl$3 = /* @__PURE__ */ template(`<p>Drag & drop CSV or Parquet files. Preview column profiles before ingesting. Select a column subset and time slice for partial loads.`), _tmpl$4 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,10 4,6 7,12 10,3 13,8 15,7">`), _tmpl$5 = /* @__PURE__ */ template(`<h3>Timeseries <kbd>⌥2`), _tmpl$6 = /* @__PURE__ */ template(`<p>WebGPU-accelerated multi-series chart with zoom, custom colors, rolling bands, anomaly detection, and adaptive line filters.`), _tmpl$7 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=1 y=1 width=4 height=4 rx=0.5></rect><rect x=6 y=1 width=4 height=4 rx=0.5></rect><rect x=11 y=1 width=4 height=4 rx=0.5></rect><rect x=1 y=6 width=4 height=4 rx=0.5></rect><rect x=6 y=6 width=4 height=4 rx=0.5></rect><rect x=11 y=6 width=4 height=4 rx=0.5></rect><rect x=1 y=11 width=4 height=4 rx=0.5></rect><rect x=6 y=11 width=4 height=4 rx=0.5></rect><rect x=11 y=11 width=4 height=4 rx=0.5>`), _tmpl$8 = /* @__PURE__ */ template(`<h3>Correlations <kbd>⌥7`), _tmpl$9 = /* @__PURE__ */ template(`<p>Screen pairs in the correlation heatmap, then jump into the detailed scatter view for the promising relationships.`), _tmpl$0 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><circle cx=4 cy=11 r=1.2></circle><circle cx=8 cy=6 r=1.2></circle><circle cx=12 cy=9 r=1.2></circle><circle cx=6 cy=13 r=1.2></circle><circle cx=11 cy=3 r=1.2>`), _tmpl$1 = /* @__PURE__ */ template(`<h3>Scatter / Density <kbd>⌥3`), _tmpl$10 = /* @__PURE__ */ template(`<p>Inspect the selected pair in detail, color by an extra column, and switch to matrix view with <kbd>⌥4</kbd> for pairwise screening inside the same workspace.`), _tmpl$11 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,8 3,4 5,10 7,2 9,12 11,6 13,8 15,8">`), _tmpl$12 = /* @__PURE__ */ template(`<h3>FFT / PSD <kbd>⌥6`), _tmpl$13 = /* @__PURE__ */ template(`<p>Frequency-domain analysis with magnitude or power spectral density. Log scale, multi-trace overlay, zoom, and PNG/SVG/CSV export.`), _tmpl$14 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=1 y=2 width=2 height=12 rx=0.3></rect><rect x=4 y=4 width=2 height=8 rx=0.3></rect><rect x=7 y=1 width=2 height=14 rx=0.3></rect><rect x=10 y=5 width=2 height=6 rx=0.3></rect><rect x=13 y=3 width=2 height=10 rx=0.3>`), _tmpl$15 = /* @__PURE__ */ template(`<h3>Spectrogram <kbd>⌥8`), _tmpl$16 = /* @__PURE__ */ template(`<p>Time-frequency heatmap using short-time FFT. Adjustable window size, log scale, zoom, and PNG export.`), _tmpl$17 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><circle cx=3 cy=8 r=2></circle><circle cx=13 cy=4 r=2></circle><circle cx=13 cy=12 r=2></circle><line x1=5 y1=7.2 x2=11 y2=4.8></line><line x1=5 y1=8.8 x2=11 y2=11.2>`), _tmpl$18 = /* @__PURE__ */ template(`<h3>Causal Discovery <kbd>⌥9`), _tmpl$19 = /* @__PURE__ */ template(`<p>PCMCI, PCMCI+, FullCI, BivCI, and LPCMCI via Tigramite. Directed graph with edge lag and p-value labels. Export to JSON or torch_geometric.`), _tmpl$20 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=1 y=7 width=3 height=7 rx=0.5></rect><rect x=5 y=4 width=3 height=10 rx=0.5></rect><rect x=9 y=6 width=3 height=8 rx=0.5></rect><rect x=13 y=2 width=2 height=12 rx=0.5></rect><polyline points="1,5 5,2 9,4 13,1"stroke-dasharray="2 1.5">`), _tmpl$21 = /* @__PURE__ */ template(`<h3>Drift Analysis <kbd>⌥0`), _tmpl$22 = /* @__PURE__ */ template(`<p>Compare windows and detect distribution or score shifts once the main workflow has identified the slices worth monitoring.`), _tmpl$23 = /* @__PURE__ */ template(`<div><div><div><svg viewBox="0 0 32 32"fill=none stroke=currentColor stroke-width=1.6 stroke-linecap=round stroke-linejoin=round><polyline points="2,18 7,10 12,22 17,6 22,16 27,12 30,12"></polyline></svg></div><h1>EdaTime</h1><p>Interactive time-series analytics — upload a CSV or Parquet, explore, and export.</p></div><div><h2>Try with sample data</h2><p>Load built-in datasets to explore the workflow without preparing a file.</p><div><button type=button aria-label="Load ETTm2 sample dataset"><div><div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,10 4,6 7,12 10,3 13,8 15,7"></polyline></svg></div><div><div>ETTm2 Sensor Data</div><div>Electrical transformer monitoring</div></div></div><p>Time series with multiple sensor readings including temperature, pressure, and power metrics.</p><div><span>Time-series</span><span>69K rows</span><span>7 columns</span></div></button><button type=button aria-label="Load Sinusoidal Waves sample dataset"><div><div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,8 4,4 7,12 10,2 13,10 15,6"></polyline></svg></div><div><div>Sinusoidal Waves</div><div>Generated periodic signals</div></div></div><p>Multiple sine waves with different frequencies for testing FFT and spectral analysis features.</p><div><span>FFT</span><span>10K rows</span><span>4 columns</span></div></button><button type=button aria-label="Load Weather Patterns sample dataset"><div><div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=1 y=1 width=4 height=4 rx=0.5></rect><rect x=6 y=1 width=4 height=4 rx=0.5></rect><rect x=11 y=1 width=4 height=4 rx=0.5></rect><rect x=1 y=6 width=4 height=4 rx=0.5></rect><rect x=6 y=6 width=4 height=4 rx=0.5></rect><rect x=11 y=6 width=4 height=4 rx=0.5></rect></svg></div><div><div>Weather Patterns</div><div>Temperature and humidity readings</div></div></div><p>Environmental sensor data with correlated temperature, humidity, and pressure readings.</p><div><span>Correlations</span><span>50K rows</span><span>6 columns</span></div></button></div></div><div><h2>Recommended workflow</h2><p>Start with the core path, then branch into advanced analyses only after you know which columns and intervals matter.</p></div><div></div><div><h2>Advanced analyses</h2><p>Use these pages after the workflow above has narrowed the signal, time window, or candidate variables.</p></div><div></div><div><h2>Keyboard shortcuts</h2><div><div><h4>Navigation</h4><div><kbd>⌥1–3, 6–0</kbd><span>Switch major pages</span></div><div><kbd>⌥4</kbd><span>Open scatter matrix view</span></div><div><kbd>Ctrl+K</kbd><span>Command palette</span></div><div><kbd>Ctrl+I</kbd><span>Analysis context panel</span></div></div><div><h4>Chart</h4><div><kbd>Double-click</kbd><span>Reset zoom</span></div><div><kbd>Ctrl+click</kbd><span>Set adaptive filter target</span></div><div><kbd>Drag</kbd><span>Pan / draw</span></div></div><div><h4>Session</h4><div><kbd>Ctrl+S</kbd><span>Save session</span></div><div><kbd>Ctrl+Shift+S</kbd><span>Export session file</span></div><div><kbd>Ctrl+O</kbd><span>Import session file</span></div></div><div><h4>Drift</h4><div><kbd>Enter / D</kbd><span>Run drift compute</span></div><div><kbd>E</kbd><span>Export drift CSV</span></div><div><kbd>J / P</kbd><span>Export JSON / PNG`);
const HomePage = () => {
  const handleSampleDataset = (datasetId) => {
    sessionStorage.setItem("sampleDataset", datasetId);
    window.location.hash = "/upload";
  };
  return (() => {
    var _el$ = _tmpl$23(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$4.nextSibling, _el$6 = _el$2.nextSibling, _el$7 = _el$6.firstChild, _el$8 = _el$7.nextSibling, _el$9 = _el$8.nextSibling, _el$0 = _el$9.firstChild, _el$1 = _el$0.firstChild, _el$10 = _el$1.firstChild, _el$11 = _el$10.nextSibling, _el$12 = _el$11.firstChild, _el$13 = _el$12.nextSibling, _el$14 = _el$1.nextSibling, _el$15 = _el$14.nextSibling, _el$16 = _el$15.firstChild, _el$17 = _el$16.nextSibling, _el$18 = _el$17.nextSibling, _el$19 = _el$0.nextSibling, _el$20 = _el$19.firstChild, _el$21 = _el$20.firstChild, _el$22 = _el$21.nextSibling, _el$23 = _el$22.firstChild, _el$24 = _el$23.nextSibling, _el$25 = _el$20.nextSibling, _el$26 = _el$25.nextSibling, _el$27 = _el$26.firstChild, _el$28 = _el$27.nextSibling, _el$29 = _el$28.nextSibling, _el$30 = _el$19.nextSibling, _el$31 = _el$30.firstChild, _el$32 = _el$31.firstChild, _el$33 = _el$32.nextSibling, _el$34 = _el$33.firstChild, _el$35 = _el$34.nextSibling, _el$36 = _el$31.nextSibling, _el$37 = _el$36.nextSibling, _el$38 = _el$37.firstChild, _el$39 = _el$38.nextSibling, _el$40 = _el$39.nextSibling, _el$41 = _el$6.nextSibling, _el$42 = _el$41.firstChild, _el$43 = _el$42.nextSibling, _el$44 = _el$41.nextSibling, _el$57 = _el$44.nextSibling, _el$58 = _el$57.firstChild, _el$59 = _el$58.nextSibling, _el$60 = _el$57.nextSibling, _el$73 = _el$60.nextSibling, _el$74 = _el$73.firstChild, _el$75 = _el$74.nextSibling, _el$76 = _el$75.firstChild, _el$77 = _el$76.firstChild, _el$78 = _el$77.nextSibling, _el$79 = _el$78.nextSibling, _el$80 = _el$79.nextSibling, _el$81 = _el$80.nextSibling, _el$82 = _el$76.nextSibling, _el$83 = _el$82.firstChild, _el$84 = _el$83.nextSibling, _el$85 = _el$84.nextSibling, _el$86 = _el$85.nextSibling, _el$87 = _el$82.nextSibling, _el$88 = _el$87.firstChild, _el$89 = _el$88.nextSibling, _el$90 = _el$89.nextSibling, _el$91 = _el$90.nextSibling, _el$92 = _el$87.nextSibling, _el$93 = _el$92.firstChild, _el$94 = _el$93.nextSibling, _el$95 = _el$94.nextSibling, _el$96 = _el$95.nextSibling;
    insert(_el$2, createComponent(A, {
      href: "/upload",
      get ["class"]() {
        return styles.ctaButton;
      },
      children: "Upload a file to get started"
    }), null);
    _el$0.$$click = () => handleSampleDataset("ettm2");
    _el$19.$$click = () => handleSampleDataset("sinusoidal");
    _el$30.$$click = () => handleSampleDataset("weather");
    insert(_el$44, createComponent(A, {
      href: "/upload",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "upload",
      get children() {
        return [(() => {
          var _el$45 = _tmpl$();
          createRenderEffect(() => className(_el$45, styles.cardIcon));
          return _el$45;
        })(), (() => {
          var _el$46 = _tmpl$2();
          createRenderEffect(() => className(_el$46, styles.cardTitle));
          return _el$46;
        })(), (() => {
          var _el$47 = _tmpl$3();
          createRenderEffect(() => className(_el$47, styles.cardDesc));
          return _el$47;
        })()];
      }
    }), null);
    insert(_el$44, createComponent(A, {
      href: "/timeseries",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "timeseries",
      get children() {
        return [(() => {
          var _el$48 = _tmpl$4();
          createRenderEffect(() => className(_el$48, styles.cardIcon));
          return _el$48;
        })(), (() => {
          var _el$49 = _tmpl$5();
          createRenderEffect(() => className(_el$49, styles.cardTitle));
          return _el$49;
        })(), (() => {
          var _el$50 = _tmpl$6();
          createRenderEffect(() => className(_el$50, styles.cardDesc));
          return _el$50;
        })()];
      }
    }), null);
    insert(_el$44, createComponent(A, {
      href: "/heatmap",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "heatmap",
      get children() {
        return [(() => {
          var _el$51 = _tmpl$7();
          createRenderEffect(() => className(_el$51, styles.cardIcon));
          return _el$51;
        })(), (() => {
          var _el$52 = _tmpl$8();
          createRenderEffect(() => className(_el$52, styles.cardTitle));
          return _el$52;
        })(), (() => {
          var _el$53 = _tmpl$9();
          createRenderEffect(() => className(_el$53, styles.cardDesc));
          return _el$53;
        })()];
      }
    }), null);
    insert(_el$44, createComponent(A, {
      href: "/scatter",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "scatter",
      get children() {
        return [(() => {
          var _el$54 = _tmpl$0();
          createRenderEffect(() => className(_el$54, styles.cardIcon));
          return _el$54;
        })(), (() => {
          var _el$55 = _tmpl$1();
          createRenderEffect(() => className(_el$55, styles.cardTitle));
          return _el$55;
        })(), (() => {
          var _el$56 = _tmpl$10();
          createRenderEffect(() => className(_el$56, styles.cardDesc));
          return _el$56;
        })()];
      }
    }), null);
    insert(_el$60, createComponent(A, {
      href: "/fft",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "fft",
      get children() {
        return [(() => {
          var _el$61 = _tmpl$11();
          createRenderEffect(() => className(_el$61, styles.cardIcon));
          return _el$61;
        })(), (() => {
          var _el$62 = _tmpl$12();
          createRenderEffect(() => className(_el$62, styles.cardTitle));
          return _el$62;
        })(), (() => {
          var _el$63 = _tmpl$13();
          createRenderEffect(() => className(_el$63, styles.cardDesc));
          return _el$63;
        })()];
      }
    }), null);
    insert(_el$60, createComponent(A, {
      href: "/spectrogram",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "spectrogram",
      get children() {
        return [(() => {
          var _el$64 = _tmpl$14();
          createRenderEffect(() => className(_el$64, styles.cardIcon));
          return _el$64;
        })(), (() => {
          var _el$65 = _tmpl$15();
          createRenderEffect(() => className(_el$65, styles.cardTitle));
          return _el$65;
        })(), (() => {
          var _el$66 = _tmpl$16();
          createRenderEffect(() => className(_el$66, styles.cardDesc));
          return _el$66;
        })()];
      }
    }), null);
    insert(_el$60, createComponent(A, {
      href: "/causal",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "causal",
      get children() {
        return [(() => {
          var _el$67 = _tmpl$17();
          createRenderEffect(() => className(_el$67, styles.cardIcon));
          return _el$67;
        })(), (() => {
          var _el$68 = _tmpl$18();
          createRenderEffect(() => className(_el$68, styles.cardTitle));
          return _el$68;
        })(), (() => {
          var _el$69 = _tmpl$19();
          createRenderEffect(() => className(_el$69, styles.cardDesc));
          return _el$69;
        })()];
      }
    }), null);
    insert(_el$60, createComponent(A, {
      href: "/drift",
      get ["class"]() {
        return styles.card;
      },
      "data-home-nav": "drift",
      get children() {
        return [(() => {
          var _el$70 = _tmpl$20();
          createRenderEffect(() => className(_el$70, styles.cardIcon));
          return _el$70;
        })(), (() => {
          var _el$71 = _tmpl$21();
          createRenderEffect(() => className(_el$71, styles.cardTitle));
          return _el$71;
        })(), (() => {
          var _el$72 = _tmpl$22();
          createRenderEffect(() => className(_el$72, styles.cardDesc));
          return _el$72;
        })()];
      }
    }), null);
    createRenderEffect((_p$) => {
      var _v$ = styles.page, _v$2 = styles.hero, _v$3 = styles.heroIcon, _v$4 = styles.title, _v$5 = styles.tagline, _v$6 = styles.datasets, _v$7 = styles.sectionTitle, _v$8 = styles.sectionCopy, _v$9 = styles.datasetsGrid, _v$0 = styles.datasetCard, _v$1 = styles.datasetHeader, _v$10 = styles.datasetIcon, _v$11 = styles.datasetInfo, _v$12 = styles.datasetName, _v$13 = styles.datasetMeta, _v$14 = styles.datasetDesc, _v$15 = styles.datasetTags, _v$16 = styles.datasetTag, _v$17 = `${styles.datasetTag} ${styles.tagRows}`, _v$18 = `${styles.datasetTag} ${styles.tagSize}`, _v$19 = styles.datasetCard, _v$20 = styles.datasetHeader, _v$21 = styles.datasetIcon, _v$22 = styles.datasetInfo, _v$23 = styles.datasetName, _v$24 = styles.datasetMeta, _v$25 = styles.datasetDesc, _v$26 = styles.datasetTags, _v$27 = styles.datasetTag, _v$28 = `${styles.datasetTag} ${styles.tagRows}`, _v$29 = `${styles.datasetTag} ${styles.tagSize}`, _v$30 = styles.datasetCard, _v$31 = styles.datasetHeader, _v$32 = styles.datasetIcon, _v$33 = styles.datasetInfo, _v$34 = styles.datasetName, _v$35 = styles.datasetMeta, _v$36 = styles.datasetDesc, _v$37 = styles.datasetTags, _v$38 = styles.datasetTag, _v$39 = `${styles.datasetTag} ${styles.tagRows}`, _v$40 = `${styles.datasetTag} ${styles.tagSize}`, _v$41 = styles.section, _v$42 = styles.sectionTitle, _v$43 = styles.sectionCopy, _v$44 = `${styles.grid} ${styles.gridWorkflow}`, _v$45 = styles.section, _v$46 = styles.sectionTitle, _v$47 = styles.sectionCopy, _v$48 = styles.grid, _v$49 = styles.shortcuts, _v$50 = styles.sectionTitle, _v$51 = styles.shortcutsGrid, _v$52 = styles.shortcutGroup, _v$53 = styles.shortcutGroupTitle, _v$54 = styles.shortcutRow, _v$55 = styles.shortcutRow, _v$56 = styles.shortcutRow, _v$57 = styles.shortcutRow, _v$58 = styles.shortcutGroup, _v$59 = styles.shortcutGroupTitle, _v$60 = styles.shortcutRow, _v$61 = styles.shortcutRow, _v$62 = styles.shortcutRow, _v$63 = styles.shortcutGroup, _v$64 = styles.shortcutGroupTitle, _v$65 = styles.shortcutRow, _v$66 = styles.shortcutRow, _v$67 = styles.shortcutRow, _v$68 = styles.shortcutGroup, _v$69 = styles.shortcutGroupTitle, _v$70 = styles.shortcutRow, _v$71 = styles.shortcutRow, _v$72 = styles.shortcutRow;
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
      _v$13 !== _p$.m && className(_el$13, _p$.m = _v$13);
      _v$14 !== _p$.f && className(_el$14, _p$.f = _v$14);
      _v$15 !== _p$.y && className(_el$15, _p$.y = _v$15);
      _v$16 !== _p$.g && className(_el$16, _p$.g = _v$16);
      _v$17 !== _p$.p && className(_el$17, _p$.p = _v$17);
      _v$18 !== _p$.b && className(_el$18, _p$.b = _v$18);
      _v$19 !== _p$.T && className(_el$19, _p$.T = _v$19);
      _v$20 !== _p$.A && className(_el$20, _p$.A = _v$20);
      _v$21 !== _p$.O && className(_el$21, _p$.O = _v$21);
      _v$22 !== _p$.I && className(_el$22, _p$.I = _v$22);
      _v$23 !== _p$.S && className(_el$23, _p$.S = _v$23);
      _v$24 !== _p$.W && className(_el$24, _p$.W = _v$24);
      _v$25 !== _p$.C && className(_el$25, _p$.C = _v$25);
      _v$26 !== _p$.B && className(_el$26, _p$.B = _v$26);
      _v$27 !== _p$.v && className(_el$27, _p$.v = _v$27);
      _v$28 !== _p$.k && className(_el$28, _p$.k = _v$28);
      _v$29 !== _p$.x && className(_el$29, _p$.x = _v$29);
      _v$30 !== _p$.j && className(_el$30, _p$.j = _v$30);
      _v$31 !== _p$.q && className(_el$31, _p$.q = _v$31);
      _v$32 !== _p$.z && className(_el$32, _p$.z = _v$32);
      _v$33 !== _p$.P && className(_el$33, _p$.P = _v$33);
      _v$34 !== _p$.H && className(_el$34, _p$.H = _v$34);
      _v$35 !== _p$.F && className(_el$35, _p$.F = _v$35);
      _v$36 !== _p$.M && className(_el$36, _p$.M = _v$36);
      _v$37 !== _p$.D && className(_el$37, _p$.D = _v$37);
      _v$38 !== _p$.R && className(_el$38, _p$.R = _v$38);
      _v$39 !== _p$.E && className(_el$39, _p$.E = _v$39);
      _v$40 !== _p$.L && className(_el$40, _p$.L = _v$40);
      _v$41 !== _p$.N && className(_el$41, _p$.N = _v$41);
      _v$42 !== _p$.G && className(_el$42, _p$.G = _v$42);
      _v$43 !== _p$.U && className(_el$43, _p$.U = _v$43);
      _v$44 !== _p$.K && className(_el$44, _p$.K = _v$44);
      _v$45 !== _p$.V && className(_el$57, _p$.V = _v$45);
      _v$46 !== _p$.Y && className(_el$58, _p$.Y = _v$46);
      _v$47 !== _p$.J && className(_el$59, _p$.J = _v$47);
      _v$48 !== _p$.Q && className(_el$60, _p$.Q = _v$48);
      _v$49 !== _p$.Z && className(_el$73, _p$.Z = _v$49);
      _v$50 !== _p$.X && className(_el$74, _p$.X = _v$50);
      _v$51 !== _p$._ && className(_el$75, _p$._ = _v$51);
      _v$52 !== _p$.$ && className(_el$76, _p$.$ = _v$52);
      _v$53 !== _p$.te && className(_el$77, _p$.te = _v$53);
      _v$54 !== _p$.tt && className(_el$78, _p$.tt = _v$54);
      _v$55 !== _p$.ta && className(_el$79, _p$.ta = _v$55);
      _v$56 !== _p$.to && className(_el$80, _p$.to = _v$56);
      _v$57 !== _p$.ti && className(_el$81, _p$.ti = _v$57);
      _v$58 !== _p$.tn && className(_el$82, _p$.tn = _v$58);
      _v$59 !== _p$.ts && className(_el$83, _p$.ts = _v$59);
      _v$60 !== _p$.th && className(_el$84, _p$.th = _v$60);
      _v$61 !== _p$.tr && className(_el$85, _p$.tr = _v$61);
      _v$62 !== _p$.td && className(_el$86, _p$.td = _v$62);
      _v$63 !== _p$.tl && className(_el$87, _p$.tl = _v$63);
      _v$64 !== _p$.tu && className(_el$88, _p$.tu = _v$64);
      _v$65 !== _p$.tc && className(_el$89, _p$.tc = _v$65);
      _v$66 !== _p$.tw && className(_el$90, _p$.tw = _v$66);
      _v$67 !== _p$.tm && className(_el$91, _p$.tm = _v$67);
      _v$68 !== _p$.tf && className(_el$92, _p$.tf = _v$68);
      _v$69 !== _p$.ty && className(_el$93, _p$.ty = _v$69);
      _v$70 !== _p$.tg && className(_el$94, _p$.tg = _v$70);
      _v$71 !== _p$.tp && className(_el$95, _p$.tp = _v$71);
      _v$72 !== _p$.tb && className(_el$96, _p$.tb = _v$72);
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
      Z: void 0,
      X: void 0,
      _: void 0,
      $: void 0,
      te: void 0,
      tt: void 0,
      ta: void 0,
      to: void 0,
      ti: void 0,
      tn: void 0,
      ts: void 0,
      th: void 0,
      tr: void 0,
      td: void 0,
      tl: void 0,
      tu: void 0,
      tc: void 0,
      tw: void 0,
      tm: void 0,
      tf: void 0,
      ty: void 0,
      tg: void 0,
      tp: void 0,
      tb: void 0
    });
    return _el$;
  })();
};
delegateEvents(["click"]);

export { HomePage as default };
//# sourceMappingURL=HomePage.Cvv4hgUq.js.map
