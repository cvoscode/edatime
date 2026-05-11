import { c as createSignal, i as insert, e as createComponent, y as uploadStore, b as createRenderEffect, f as className, S as Show, t as template, u as use, h as delegateEvents, d as createMemo, m as memo, g as setStyleProperty, s as setAttribute, F as For, n as useNavigate, o as onMount, q as uiStore, p as datasetStore } from './index.ejaTb3X2.js';
import './Dropdown.zvInWQuU.js';
import { S as SwitchToggle } from './SwitchToggle.DmpyzbKN.js';

const API_BASE = "/api";
async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function uploadPreview$1(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/upload/preview`, { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Preview failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function uploadIngest(file, options) {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.columns) formData.append("columns", options.columns.join(","));
  if (options?.max_rows != null) formData.append("n_rows", String(options.max_rows));
  if (options?.skip_rows != null) formData.append("skip_rows", String(options.skip_rows));
  if (options?.time_start) formData.append("time_start", options.time_start);
  if (options?.time_end) formData.append("time_end", options.time_end);
  if (options?.time_column) formData.append("time_column", options.time_column);
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ingest failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function fetchMetadata() {
  return getJson(`${API_BASE}/metadata`);
}
async function fetchSampleETTm2() {
  const res = await fetch(`${API_BASE}/sample/ETTm2.csv`);
  if (!res.ok) throw new Error(`Failed to fetch ETTm2.csv: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], "ETTm2.csv", { type: "text/csv" });
}

function generateSinusoidalCsv() {
  const rows = ["timestamp,temperature,humidity,pressure"];
  const start = (/* @__PURE__ */ new Date("2024-01-01T00:00:00Z")).getTime();
  const end = (/* @__PURE__ */ new Date("2024-01-08T00:00:00Z")).getTime();
  const interval = 15 * 60 * 1e3;
  for (let t = start; t < end; t += interval) {
    const temp = 20 + 5 * Math.sin((t - start) / (3600 * 1e3)) + (Math.random() - 0.5) * 0.5;
    const hum = 50 + 20 * Math.sin((t - start) / (7200 * 1e3)) + (Math.random() - 0.5) * 2;
    const pres = 1013 + 5 * Math.sin((t - start) / (5400 * 1e3)) + (Math.random() - 0.5) * 0.3;
    rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)}`);
  }
  return rows.join("\n");
}
function generateWeatherCsv() {
  const rows = ["timestamp,temperature,humidity,pressure,wind_speed"];
  const start = (/* @__PURE__ */ new Date("2024-03-01T00:00:00Z")).getTime();
  const end = (/* @__PURE__ */ new Date("2024-03-08T00:00:00Z")).getTime();
  const interval = 10 * 60 * 1e3;
  for (let t = start; t < end; t += interval) {
    const hour = new Date(t).getUTCHours();
    const dayFactor = Math.sin((t - start) / (86400 * 1e3));
    const temp = 15 + 8 * dayFactor + 3 * Math.sin(hour * Math.PI / 12) + (Math.random() - 0.5) * 0.5;
    const hum = 60 + 15 * Math.cos((t - start) / (43200 * 1e3)) + (Math.random() - 0.5) * 3;
    const pres = 1010 + 8 * dayFactor + (Math.random() - 0.5) * 0.5;
    const wind = 5 + 3 * Math.abs(Math.sin((t - start) / (21600 * 1e3))) + (Math.random() - 0.5) * 1;
    rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)},${wind.toFixed(3)}`);
  }
  return rows.join("\n");
}
function createFileFromCsv(csvContent, filename) {
  return new File([csvContent], filename, { type: "text/csv" });
}

const dropZone = "_dropZone_y5i85_1";
const dragover = "_dragover_y5i85_19";
const title = "_title_y5i85_37";
const sub = "_sub_y5i85_43";
const browseBtn = "_browseBtn_y5i85_48";
const filename = "_filename_y5i85_64";
const styles$2 = {
	dropZone: dropZone,
	dragover: dragover,
	title: title,
	sub: sub,
	browseBtn: browseBtn,
	filename: filename
};

var _tmpl$$2 = /* @__PURE__ */ template(`<span role=status aria-live=polite>`), _tmpl$2$2 = /* @__PURE__ */ template(`<div role=button tabindex=0 aria-label="Drop CSV or Parquet file here or browse for a file"><svg viewBox="0 0 24 24"fill=none stroke=currentColor stroke-width=1.4 stroke-linecap=round stroke-linejoin=round><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1=12 y1=3 x2=12 y2=15></line></svg><span>Drop CSV or Parquet here</span><span>or</span><button type=button>Browse file</button><input type=file id=file-upload accept=.csv,.parquet hidden>`);
const UploadDropzone = (props) => {
  const [isDragging, setIsDragging] = createSignal(false);
  let fileInputRef;
  const handleClick = () => {
    fileInputRef?.click();
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files[0];
    if (file) props.onFileSelected(file);
  };
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) props.onFileSelected(file);
  };
  const handleBrowseClick = (e) => {
    e.stopPropagation();
    fileInputRef?.click();
  };
  return (() => {
    var _el$ = _tmpl$2$2(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling, _el$4 = _el$3.nextSibling, _el$5 = _el$4.nextSibling, _el$6 = _el$5.nextSibling;
    _el$.addEventListener("drop", handleDrop);
    _el$.addEventListener("dragleave", handleDragLeave);
    _el$.addEventListener("dragover", handleDragOver);
    _el$.$$click = handleClick;
    _el$5.$$click = handleBrowseClick;
    _el$6.addEventListener("change", handleFileChange);
    var _ref$ = fileInputRef;
    typeof _ref$ === "function" ? use(_ref$, _el$6) : fileInputRef = _el$6;
    insert(_el$, createComponent(Show, {
      get when() {
        return uploadStore.state.selectedFile;
      },
      get children() {
        var _el$7 = _tmpl$$2();
        insert(_el$7, () => uploadStore.state.selectedFile?.name);
        createRenderEffect(() => className(_el$7, styles$2.filename));
        return _el$7;
      }
    }), null);
    createRenderEffect((_p$) => {
      var _v$ = `${styles$2.dropZone} ${isDragging() ? styles$2.dragover : ""}`, _v$2 = styles$2.title, _v$3 = styles$2.sub, _v$4 = styles$2.browseBtn;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$3, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$4, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$5, _p$.o = _v$4);
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0
    });
    return _el$;
  })();
};
delegateEvents(["click"]);

const grid = "_grid_1ix2r_1";
const header = "_header_1ix2r_9";
const col = "_col_1ix2r_24";
const colCheck = "_colCheck_1ix2r_42";
const colName = "_colName_1ix2r_48";
const colType = "_colType_1ix2r_52";
const colCount = "_colCount_1ix2r_56";
const colNum = "_colNum_1ix2r_60";
const colHist = "_colHist_1ix2r_64";
const viewport = "_viewport_1ix2r_68";
const spacer = "_spacer_1ix2r_73";
const row$1 = "_row_1ix2r_77";
const histogram = "_histogram_1ix2r_100";
const histBar = "_histBar_1ix2r_107";
const styles$1 = {
	grid: grid,
	header: header,
	col: col,
	colCheck: colCheck,
	colName: colName,
	colType: colType,
	colCount: colCount,
	colNum: colNum,
	colHist: colHist,
	viewport: viewport,
	spacer: spacer,
	row: row$1,
	histogram: histogram,
	histBar: histBar
};

var _tmpl$$1 = /* @__PURE__ */ template(`<div><div role=row><div role=columnheader><input type=checkbox aria-label="Select all upload columns"></div><div role=columnheader>Column </div><div role=columnheader>Type </div><div role=columnheader>Non-null </div><div role=columnheader>Nulls </div><div role=columnheader>Min </div><div role=columnheader>Max </div><div role=columnheader>Distribution</div></div><div role=rowgroup><div><div>`), _tmpl$2$1 = /* @__PURE__ */ template(`<div role=row><div><input type=checkbox></div><div></div><div></div><div></div><div></div><div></div><div></div><div><div>`), _tmpl$3$1 = /* @__PURE__ */ template(`<div>`);
const ROW_HEIGHT = 38;
const OVERSCAN = 8;
const ColumnProfileGrid = (props) => {
  let viewportRef;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [filterText, setFilterText] = createSignal("");
  const [sortKey, setSortKey] = createSignal("name");
  const [sortDir, setSortDir] = createSignal("asc");
  const filteredProfiles = createMemo(() => {
    const filter = filterText().toLowerCase();
    let result = filter ? props.profiles.filter((p) => p.name.toLowerCase().includes(filter)) : props.profiles;
    const key = sortKey();
    const dir = sortDir();
    result = [...result].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      if (key === "name") {
        aVal = a.name;
        bVal = b.name;
      } else if (key === "dtype") {
        aVal = a.dtype;
        bVal = b.dtype;
      } else if (key === "nonNullCount") {
        aVal = a.non_null_count;
        bVal = b.non_null_count;
      } else if (key === "nullCount") {
        aVal = a.null_count;
        bVal = b.null_count;
      } else if (key === "min") {
        aVal = a.min ?? 0;
        bVal = b.min ?? 0;
      } else if (key === "max") {
        aVal = a.max ?? 0;
        bVal = b.max ?? 0;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return dir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return result;
  });
  const totalHeight = () => filteredProfiles().length * ROW_HEIGHT;
  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil((viewportRef?.clientHeight ?? 400) / ROW_HEIGHT);
    const end = Math.min(filteredProfiles().length, start + visibleCount + OVERSCAN * 2);
    return {
      start,
      end
    };
  });
  const visibleRows = createMemo(() => {
    const {
      start,
      end
    } = visibleRange();
    return filteredProfiles().slice(start, end).map((profile, i) => ({
      profile,
      index: start + i
    }));
  });
  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };
  const handleSort = (key) => {
    if (sortKey() === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const toggleColumn = (name) => {
    const current = props.selectedColumns;
    if (current.includes(name)) {
      props.onSelectionChange(current.filter((c) => c !== name));
    } else {
      props.onSelectionChange([...current, name]);
    }
  };
  const toggleAll = (checked) => {
    if (checked) {
      props.onSelectionChange(props.profiles.map((p) => p.name));
    } else {
      props.onSelectionChange([]);
    }
  };
  const formatNumber = (n, decimals = 2) => {
    if (n === null || n === void 0) return "—";
    return n.toFixed(decimals);
  };
  const allSelected = () => props.profiles.length > 0 && props.selectedColumns.length === props.profiles.length;
  const getTypeLabel = (dtype) => {
    if (dtype.includes("int") || dtype.includes("float") || dtype.includes("double")) return "numeric";
    if (dtype.includes("datetime") || dtype.includes("date")) return "datetime";
    if (dtype.includes("bool")) return "bool";
    return "categorical";
  };
  return (() => {
    var _el$ = _tmpl$$1(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$3.nextSibling; _el$5.firstChild; var _el$7 = _el$5.nextSibling; _el$7.firstChild; var _el$9 = _el$7.nextSibling; _el$9.firstChild; var _el$1 = _el$9.nextSibling; _el$1.firstChild; var _el$11 = _el$1.nextSibling; _el$11.firstChild; var _el$13 = _el$11.nextSibling; _el$13.firstChild; var _el$15 = _el$13.nextSibling, _el$16 = _el$2.nextSibling, _el$17 = _el$16.firstChild, _el$18 = _el$17.firstChild;
    _el$4.addEventListener("change", (e) => toggleAll(e.currentTarget.checked));
    _el$5.$$click = () => handleSort("name");
    insert(_el$5, (() => {
      var _c$ = memo(() => sortKey() === "name");
      return () => _c$() ? sortDir() === "asc" ? "↑" : "↓" : "";
    })(), null);
    _el$7.$$click = () => handleSort("dtype");
    insert(_el$7, (() => {
      var _c$2 = memo(() => sortKey() === "dtype");
      return () => _c$2() ? sortDir() === "asc" ? "↑" : "↓" : "";
    })(), null);
    _el$9.$$click = () => handleSort("nonNullCount");
    insert(_el$9, (() => {
      var _c$3 = memo(() => sortKey() === "nonNullCount");
      return () => _c$3() ? sortDir() === "asc" ? "↑" : "↓" : "";
    })(), null);
    _el$1.$$click = () => handleSort("nullCount");
    insert(_el$1, (() => {
      var _c$4 = memo(() => sortKey() === "nullCount");
      return () => _c$4() ? sortDir() === "asc" ? "↑" : "↓" : "";
    })(), null);
    _el$11.$$click = () => handleSort("min");
    insert(_el$11, (() => {
      var _c$5 = memo(() => sortKey() === "min");
      return () => _c$5() ? sortDir() === "asc" ? "↑" : "↓" : "";
    })(), null);
    _el$13.$$click = () => handleSort("max");
    insert(_el$13, (() => {
      var _c$6 = memo(() => sortKey() === "max");
      return () => _c$6() ? sortDir() === "asc" ? "↑" : "↓" : "";
    })(), null);
    _el$16.addEventListener("scroll", handleScroll);
    var _ref$ = viewportRef;
    typeof _ref$ === "function" ? use(_ref$, _el$16) : viewportRef = _el$16;
    insert(_el$18, createComponent(For, {
      get each() {
        return visibleRows();
      },
      children: ({
        profile,
        index
      }) => (() => {
        var _el$19 = _tmpl$2$1(), _el$20 = _el$19.firstChild, _el$21 = _el$20.firstChild, _el$22 = _el$20.nextSibling, _el$23 = _el$22.nextSibling, _el$24 = _el$23.nextSibling, _el$25 = _el$24.nextSibling, _el$26 = _el$25.nextSibling, _el$27 = _el$26.nextSibling, _el$28 = _el$27.nextSibling, _el$29 = _el$28.firstChild;
        setStyleProperty(_el$19, "top", `${index * ROW_HEIGHT}px`);
        _el$21.addEventListener("change", () => toggleColumn(profile.name));
        insert(_el$22, () => profile.name);
        insert(_el$23, () => getTypeLabel(profile.dtype));
        insert(_el$24, () => profile.non_null_count.toLocaleString());
        insert(_el$25, (() => {
          var _c$7 = memo(() => profile.null_count > 0);
          return () => _c$7() ? profile.null_count.toLocaleString() : "—";
        })());
        insert(_el$26, () => formatNumber(profile.min));
        insert(_el$27, () => formatNumber(profile.max));
        insert(_el$29, (() => {
          var _c$8 = memo(() => !!profile.histogram);
          return () => _c$8() && profile.histogram.counts.slice(0, 16).map((count, i) => (() => {
            var _el$30 = _tmpl$3$1();
            createRenderEffect((_p$) => {
              var _v$24 = styles$1.histBar, _v$25 = `${Math.max(2, count / Math.max(...profile.histogram.counts) * 36)}px`;
              _v$24 !== _p$.e && className(_el$30, _p$.e = _v$24);
              _v$25 !== _p$.t && setStyleProperty(_el$30, "height", _p$.t = _v$25);
              return _p$;
            }, {
              e: void 0,
              t: void 0
            });
            return _el$30;
          })());
        })());
        createRenderEffect((_p$) => {
          var _v$13 = styles$1.row, _v$14 = `${styles$1.col} ${styles$1.colCheck}`, _v$15 = `Select column ${profile.name}`, _v$16 = `${styles$1.col} ${styles$1.colName}`, _v$17 = `${styles$1.col} ${styles$1.colType}`, _v$18 = `${styles$1.col} ${styles$1.colCount}`, _v$19 = `${styles$1.col} ${styles$1.colCount}`, _v$20 = `${styles$1.col} ${styles$1.colNum}`, _v$21 = `${styles$1.col} ${styles$1.colNum}`, _v$22 = `${styles$1.col} ${styles$1.colHist}`, _v$23 = styles$1.histogram;
          _v$13 !== _p$.e && className(_el$19, _p$.e = _v$13);
          _v$14 !== _p$.t && className(_el$20, _p$.t = _v$14);
          _v$15 !== _p$.a && setAttribute(_el$21, "aria-label", _p$.a = _v$15);
          _v$16 !== _p$.o && className(_el$22, _p$.o = _v$16);
          _v$17 !== _p$.i && className(_el$23, _p$.i = _v$17);
          _v$18 !== _p$.n && className(_el$24, _p$.n = _v$18);
          _v$19 !== _p$.s && className(_el$25, _p$.s = _v$19);
          _v$20 !== _p$.h && className(_el$26, _p$.h = _v$20);
          _v$21 !== _p$.r && className(_el$27, _p$.r = _v$21);
          _v$22 !== _p$.d && className(_el$28, _p$.d = _v$22);
          _v$23 !== _p$.l && className(_el$29, _p$.l = _v$23);
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
          l: void 0
        });
        createRenderEffect(() => _el$21.checked = props.selectedColumns.includes(profile.name));
        return _el$19;
      })()
    }));
    createRenderEffect((_p$) => {
      var _v$ = styles$1.grid, _v$2 = styles$1.header, _v$3 = `${styles$1.col} ${styles$1.colCheck}`, _v$4 = `${styles$1.col} ${styles$1.colName}`, _v$5 = `${styles$1.col} ${styles$1.colType}`, _v$6 = `${styles$1.col} ${styles$1.colCount}`, _v$7 = `${styles$1.col} ${styles$1.colCount}`, _v$8 = `${styles$1.col} ${styles$1.colNum}`, _v$9 = `${styles$1.col} ${styles$1.colNum}`, _v$0 = `${styles$1.col} ${styles$1.colHist}`, _v$1 = styles$1.viewport, _v$10 = styles$1.spacer, _v$11 = `${totalHeight()}px`, _v$12 = `translateY(${visibleRange().start * ROW_HEIGHT}px)`;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$5, _p$.o = _v$4);
      _v$5 !== _p$.i && className(_el$7, _p$.i = _v$5);
      _v$6 !== _p$.n && className(_el$9, _p$.n = _v$6);
      _v$7 !== _p$.s && className(_el$1, _p$.s = _v$7);
      _v$8 !== _p$.h && className(_el$11, _p$.h = _v$8);
      _v$9 !== _p$.r && className(_el$13, _p$.r = _v$9);
      _v$0 !== _p$.d && className(_el$15, _p$.d = _v$0);
      _v$1 !== _p$.l && className(_el$16, _p$.l = _v$1);
      _v$10 !== _p$.u && className(_el$17, _p$.u = _v$10);
      _v$11 !== _p$.c && setStyleProperty(_el$17, "height", _p$.c = _v$11);
      _v$12 !== _p$.w && setStyleProperty(_el$18, "transform", _p$.w = _v$12);
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
    createRenderEffect(() => _el$4.checked = allSelected());
    return _el$;
  })();
};
delegateEvents(["click"]);

const page = "_page_6ekfa_1";
const uploadInner = "_uploadInner_6ekfa_9";
const sourceTabs = "_sourceTabs_6ekfa_17";
const tabBtn = "_tabBtn_6ekfa_28";
const active = "_active_6ekfa_42";
const filePanel = "_filePanel_6ekfa_47";
const partialSection = "_partialSection_6ekfa_52";
const partialSectionTitle = "_partialSectionTitle_6ekfa_59";
const toggleRow = "_toggleRow_6ekfa_66";
const toggleLabelText = "_toggleLabelText_6ekfa_73";
const toggleSub = "_toggleSub_6ekfa_79";
const partialFields = "_partialFields_6ekfa_84";
const visible = "_visible_6ekfa_92";
const fieldGroup = "_fieldGroup_6ekfa_97";
const row = "_row_6ekfa_124";
const rangeValue = "_rangeValue_6ekfa_138";
const rowTime = "_rowTime_6ekfa_145";
const select = "_select_6ekfa_151";
const uploadActions = "_uploadActions_6ekfa_161";
const uploadBtn = "_uploadBtn_6ekfa_167";
const progressWrap = "_progressWrap_6ekfa_195";
const progressBar = "_progressBar_6ekfa_202";
const status = "_status_6ekfa_208";
const error = "_error_6ekfa_213";
const dbSection = "_dbSection_6ekfa_221";
const dbFields = "_dbFields_6ekfa_229";
const input = "_input_6ekfa_235";
const dbTableRow = "_dbTableRow_6ekfa_245";
const dbBtnRow = "_dbBtnRow_6ekfa_254";
const primaryBtn = "_primaryBtn_6ekfa_260";
const ghostBtn = "_ghostBtn_6ekfa_279";
const uploadPreview = "_uploadPreview_6ekfa_293";
const uploadPreviewHead = "_uploadPreviewHead_6ekfa_301";
const toolbarLabel = "_toolbarLabel_6ekfa_311";
const profileModeBadge = "_profileModeBadge_6ekfa_317";
const uploadPreviewSelection = "_uploadPreviewSelection_6ekfa_340";
const selectBtn = "_selectBtn_6ekfa_346";
const columnFilterInput = "_columnFilterInput_6ekfa_361";
const uploadPreviewStatus = "_uploadPreviewStatus_6ekfa_371";
const styles = {
	page: page,
	uploadInner: uploadInner,
	sourceTabs: sourceTabs,
	tabBtn: tabBtn,
	active: active,
	filePanel: filePanel,
	partialSection: partialSection,
	partialSectionTitle: partialSectionTitle,
	toggleRow: toggleRow,
	toggleLabelText: toggleLabelText,
	toggleSub: toggleSub,
	partialFields: partialFields,
	visible: visible,
	fieldGroup: fieldGroup,
	row: row,
	rangeValue: rangeValue,
	rowTime: rowTime,
	select: select,
	uploadActions: uploadActions,
	uploadBtn: uploadBtn,
	progressWrap: progressWrap,
	progressBar: progressBar,
	status: status,
	error: error,
	dbSection: dbSection,
	dbFields: dbFields,
	input: input,
	dbTableRow: dbTableRow,
	dbBtnRow: dbBtnRow,
	primaryBtn: primaryBtn,
	ghostBtn: ghostBtn,
	uploadPreview: uploadPreview,
	uploadPreviewHead: uploadPreviewHead,
	toolbarLabel: toolbarLabel,
	profileModeBadge: profileModeBadge,
	uploadPreviewSelection: uploadPreviewSelection,
	selectBtn: selectBtn,
	columnFilterInput: columnFilterInput,
	uploadPreviewStatus: uploadPreviewStatus
};

var _tmpl$ = /* @__PURE__ */ template(`<div role=progressbar><div>`), _tmpl$2 = /* @__PURE__ */ template(`<div>`), _tmpl$3 = /* @__PURE__ */ template(`<div><div><div>Load options</div><label><div><div>Partial load</div><div>Limit the rows ingested from the file</div></div></label><div><div><label for=n-rows-input>Max rows to load</label><div><input type=number id=n-rows-input placeholder="All rows"min=1 step=1000><input type=range id=n-rows-range min=1000 max=5000000 step=1000><span></span></div></div><div><label for=skip-rows-input>Skip first N rows</label><input type=number id=skip-rows-input placeholder=0 min=0></div><div><label>Time range (optional)</label><div><input type=datetime-local id=time-start-input><input type=datetime-local id=time-end-input></div></div><div><label for=time-column-select>Time column</label><select id=time-column-select><option value>Auto-detect</option></select></div></div></div><div><button id=upload-btn type=button><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.8 stroke-linecap=round stroke-linejoin=round><path d="M8 11V3M5 6l3-3 3 3"></path><path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"></path></svg>Upload & Ingest`), _tmpl$4 = /* @__PURE__ */ template(`<div><div>Database Connection</div><p>Connect to PostgreSQL or TimescaleDB and load a table into the active dataset.</p><div><div><label for=db-backend-select>Backend</label><select id=db-backend-select><option value=timescale>TimescaleDB</option><option value=postgres>PostgreSQL</option></select></div><div><label for=db-connection-input>Connection string</label><input type=text id=db-connection-input placeholder=postgres://user:pass@host/db></div><div><label for=db-schema-input>Schema</label><input type=text id=db-schema-input placeholder=public></div><div><label for=db-table-select>Table / Hypertable</label><div><select id=db-table-select><option value>— connect first —</option></select><input type=text id=db-table-input placeholder="or type name"></div></div><div><label for=db-time-col-input>Time column</label><input type=text id=db-time-col-input placeholder=Auto-detect></div><div><button id=db-connect-btn type=button>Connect</button><button id=db-load-btn type=button disabled>Load data</button><button id=db-disconnect-btn type=button hidden>Disconnect</button></div><div id=db-status>`), _tmpl$5 = /* @__PURE__ */ template(`<div><div><div role=tablist><button role=tab>File</button><button role=tab>Database</button></div></div><div><div><span>File Preview</span><span></span><div><button id=profile-select-all-btn type=button>All</button><button id=profile-select-none-btn type=button>None</button></div><input type=text id=profile-filter-input placeholder="Filter columns…"><span>`), _tmpl$6 = /* @__PURE__ */ template(`<option>`);
const UploadPage = () => {
  useNavigate();
  const [profileMode, setProfileMode] = createSignal("dataset");
  onMount(() => {
    const sampleId = sessionStorage.getItem("sampleDataset");
    if (sampleId) {
      sessionStorage.removeItem("sampleDataset");
      handleSampleDataset(sampleId);
    }
  });
  const handlePreview = async (file) => {
    uploadStore.setSelectedFile(file);
    uploadStore.setPreviewing(true);
    uploadStore.setUploadStatus("Loading preview...");
    try {
      const result = await uploadPreview$1(file);
      uploadStore.setPreview(result.metadata, result.metadata.column_profiles);
      setProfileMode("preview");
      uploadStore.setUploadStatus("");
    } catch (err) {
      uploadStore.setUploadStatus(`Error: ${err}`);
    } finally {
      uploadStore.setPreviewing(false);
    }
  };
  const handleUpload = async () => {
    const file = uploadStore.state.selectedFile;
    if (!file) return;
    uploadStore.setUploading(true);
    uploadStore.setUploadStatus("Uploading...");
    uploadStore.setUploadProgress(0);
    try {
      const options = {
        columns: uploadStore.state.selectedColumns.length > 0 ? uploadStore.state.selectedColumns : void 0,
        max_rows: uploadStore.state.partialEnabled ? uploadStore.state.maxRows : void 0,
        skip_rows: uploadStore.state.partialEnabled ? uploadStore.state.skipRows : void 0,
        time_start: uploadStore.state.partialEnabled ? uploadStore.state.timeStart : void 0,
        time_end: uploadStore.state.partialEnabled ? uploadStore.state.timeEnd : void 0,
        time_column: uploadStore.state.timeColumn || void 0
      };
      const result = await uploadIngest(file, options);
      const rowCount = result.row_count ?? result.rows ?? 0;
      const colCount = result.columns?.length ?? 0;
      const freshMetadata = await fetchMetadata();
      uploadStore.setPreview(freshMetadata, freshMetadata.column_profiles);
      setProfileMode("dataset");
      uiStore.addToast({
        message: `Uploaded ${file.name} with ${rowCount.toLocaleString()} rows and ${colCount} columns.`,
        type: "success",
        duration: 5e3
      });
      datasetStore.setMetadata({
        name: file.name,
        rowCount,
        columns: result.columns,
        timestampColumn: result.timestamp_column ?? "",
        fileSize: file.size,
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      datasetStore.setNumericCols(result.numeric_columns ?? []);
      uploadStore.setUploadStatus(`Loaded ${rowCount.toLocaleString()} rows`);
    } catch (err) {
      uploadStore.setUploadStatus(`Error: ${err}`);
    } finally {
      uploadStore.setUploading(false);
    }
  };
  const handleSampleDataset = async (datasetId) => {
    uploadStore.setPreviewing(true);
    uploadStore.setUploadStatus("Loading sample...");
    let file;
    try {
      if (datasetId === "ettm2") {
        file = await fetchSampleETTm2();
      } else if (datasetId === "sinusoidal") {
        const csv = generateSinusoidalCsv();
        file = createFileFromCsv(csv, "sinusoidal.csv");
      } else {
        const csv = generateWeatherCsv();
        file = createFileFromCsv(csv, "weather.csv");
      }
      uploadStore.setSelectedFile(file);
      const result = await uploadPreview$1(file);
      uploadStore.setPreview(result.metadata, result.metadata.column_profiles);
      setProfileMode("preview");
      uploadStore.setUploadStatus("");
    } catch (err) {
      uploadStore.setUploadStatus(`Error loading sample: ${err}`);
    } finally {
      uploadStore.setPreviewing(false);
    }
  };
  const handleSelectAll = () => {
    if (uploadStore.state.previewMetadata) {
      uploadStore.setSelectedColumns(uploadStore.state.previewMetadata.numeric_columns);
    }
  };
  const handleSelectNone = () => {
    uploadStore.setSelectedColumns([]);
  };
  return (() => {
    var _el$ = _tmpl$5(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$62 = _el$2.nextSibling, _el$63 = _el$62.firstChild, _el$64 = _el$63.firstChild, _el$65 = _el$64.nextSibling, _el$66 = _el$65.nextSibling, _el$67 = _el$66.firstChild, _el$68 = _el$67.nextSibling, _el$69 = _el$66.nextSibling, _el$70 = _el$69.nextSibling;
    _el$4.$$click = () => uploadStore.setSource("file");
    _el$5.$$click = () => uploadStore.setSource("database");
    insert(_el$2, createComponent(Show, {
      get when() {
        return uploadStore.state.source === "file";
      },
      get children() {
        var _el$6 = _tmpl$3(), _el$7 = _el$6.firstChild, _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling, _el$0 = _el$9.firstChild, _el$1 = _el$0.firstChild, _el$10 = _el$1.nextSibling, _el$11 = _el$9.nextSibling, _el$12 = _el$11.firstChild, _el$13 = _el$12.firstChild, _el$14 = _el$13.nextSibling, _el$15 = _el$14.firstChild, _el$16 = _el$15.nextSibling, _el$17 = _el$16.nextSibling, _el$18 = _el$12.nextSibling, _el$19 = _el$18.firstChild, _el$20 = _el$19.nextSibling, _el$21 = _el$18.nextSibling, _el$22 = _el$21.firstChild, _el$23 = _el$22.nextSibling, _el$24 = _el$23.firstChild, _el$25 = _el$24.nextSibling, _el$26 = _el$21.nextSibling, _el$27 = _el$26.firstChild, _el$28 = _el$27.nextSibling; _el$28.firstChild; var _el$30 = _el$7.nextSibling, _el$31 = _el$30.firstChild;
        insert(_el$6, createComponent(UploadDropzone, {
          onFileSelected: handlePreview,
          onSampleDataset: handleSampleDataset
        }), _el$7);
        insert(_el$9, createComponent(SwitchToggle, {
          get checked() {
            return uploadStore.state.partialEnabled;
          },
          onChange: (e) => uploadStore.setPartialEnabled(e.currentTarget.checked),
          "aria-label": "Enable partial load options"
        }), _el$0);
        _el$15.$$input = (e) => uploadStore.setMaxRows(parseInt(e.currentTarget.value) || 1e6);
        _el$16.$$input = (e) => uploadStore.setMaxRows(parseInt(e.currentTarget.value));
        insert(_el$17, () => uploadStore.state.maxRows.toLocaleString());
        _el$20.$$input = (e) => uploadStore.setSkipRows(parseInt(e.currentTarget.value) || 0);
        _el$24.$$input = (e) => uploadStore.setTimeStart(e.currentTarget.value);
        _el$25.$$input = (e) => uploadStore.setTimeEnd(e.currentTarget.value);
        _el$28.addEventListener("change", (e) => uploadStore.setTimeColumn(e.currentTarget.value));
        insert(_el$28, createComponent(For, {
          get each() {
            return uploadStore.state.previewMetadata?.columns ?? [];
          },
          children: (col) => (() => {
            var _el$71 = _tmpl$6();
            insert(_el$71, () => col.name);
            createRenderEffect(() => _el$71.value = col.name);
            return _el$71;
          })()
        }), null);
        _el$31.$$click = handleUpload;
        insert(_el$30, createComponent(Show, {
          get when() {
            return uploadStore.state.isUploading;
          },
          get children() {
            var _el$32 = _tmpl$(), _el$33 = _el$32.firstChild;
            createRenderEffect((_p$) => {
              var _v$ = styles.progressWrap, _v$2 = styles.progressBar, _v$3 = `${uploadStore.state.uploadProgress}%`;
              _v$ !== _p$.e && className(_el$32, _p$.e = _v$);
              _v$2 !== _p$.t && className(_el$33, _p$.t = _v$2);
              _v$3 !== _p$.a && setStyleProperty(_el$33, "width", _p$.a = _v$3);
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0
            });
            return _el$32;
          }
        }), null);
        insert(_el$30, createComponent(Show, {
          get when() {
            return uploadStore.state.uploadStatus;
          },
          get children() {
            var _el$34 = _tmpl$2();
            insert(_el$34, () => uploadStore.state.uploadStatus);
            createRenderEffect(() => className(_el$34, `${styles.status} ${uploadStore.state.uploadStatus.includes("Error") ? styles.error : ""}`));
            return _el$34;
          }
        }), null);
        createRenderEffect((_p$) => {
          var _v$4 = styles.filePanel, _v$5 = styles.partialSection, _v$6 = styles.partialSectionTitle, _v$7 = styles.toggleRow, _v$8 = styles.toggleLabelText, _v$9 = styles.toggleSub, _v$0 = `${styles.partialFields} ${uploadStore.state.partialEnabled ? styles.visible : ""}`, _v$1 = styles.fieldGroup, _v$10 = styles.row, _v$11 = styles.rangeValue, _v$12 = styles.fieldGroup, _v$13 = styles.fieldGroup, _v$14 = `${styles.row} ${styles.rowTime}`, _v$15 = styles.fieldGroup, _v$16 = styles.select, _v$17 = styles.uploadActions, _v$18 = styles.uploadBtn, _v$19 = !uploadStore.state.selectedFile || uploadStore.state.isUploading;
          _v$4 !== _p$.e && className(_el$6, _p$.e = _v$4);
          _v$5 !== _p$.t && className(_el$7, _p$.t = _v$5);
          _v$6 !== _p$.a && className(_el$8, _p$.a = _v$6);
          _v$7 !== _p$.o && className(_el$9, _p$.o = _v$7);
          _v$8 !== _p$.i && className(_el$1, _p$.i = _v$8);
          _v$9 !== _p$.n && className(_el$10, _p$.n = _v$9);
          _v$0 !== _p$.s && className(_el$11, _p$.s = _v$0);
          _v$1 !== _p$.h && className(_el$12, _p$.h = _v$1);
          _v$10 !== _p$.r && className(_el$14, _p$.r = _v$10);
          _v$11 !== _p$.d && className(_el$17, _p$.d = _v$11);
          _v$12 !== _p$.l && className(_el$18, _p$.l = _v$12);
          _v$13 !== _p$.u && className(_el$21, _p$.u = _v$13);
          _v$14 !== _p$.c && className(_el$23, _p$.c = _v$14);
          _v$15 !== _p$.w && className(_el$26, _p$.w = _v$15);
          _v$16 !== _p$.m && className(_el$28, _p$.m = _v$16);
          _v$17 !== _p$.f && className(_el$30, _p$.f = _v$17);
          _v$18 !== _p$.y && className(_el$31, _p$.y = _v$18);
          _v$19 !== _p$.g && (_el$31.disabled = _p$.g = _v$19);
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
        createRenderEffect(() => _el$15.value = uploadStore.state.maxRows);
        createRenderEffect(() => _el$16.value = uploadStore.state.maxRows);
        createRenderEffect(() => _el$20.value = uploadStore.state.skipRows);
        createRenderEffect(() => _el$24.value = uploadStore.state.timeStart);
        createRenderEffect(() => _el$25.value = uploadStore.state.timeEnd);
        createRenderEffect(() => _el$28.value = uploadStore.state.timeColumn);
        return _el$6;
      }
    }), null);
    insert(_el$2, createComponent(Show, {
      get when() {
        return uploadStore.state.source === "database";
      },
      get children() {
        var _el$35 = _tmpl$4(), _el$36 = _el$35.firstChild, _el$37 = _el$36.nextSibling, _el$38 = _el$37.nextSibling, _el$39 = _el$38.firstChild, _el$40 = _el$39.firstChild, _el$41 = _el$40.nextSibling, _el$42 = _el$39.nextSibling, _el$43 = _el$42.firstChild, _el$44 = _el$43.nextSibling, _el$45 = _el$42.nextSibling, _el$46 = _el$45.firstChild, _el$47 = _el$46.nextSibling, _el$48 = _el$45.nextSibling, _el$49 = _el$48.firstChild, _el$50 = _el$49.nextSibling, _el$51 = _el$50.firstChild; _el$51.firstChild; var _el$53 = _el$51.nextSibling, _el$54 = _el$48.nextSibling, _el$55 = _el$54.firstChild, _el$56 = _el$55.nextSibling, _el$57 = _el$54.nextSibling, _el$58 = _el$57.firstChild, _el$59 = _el$58.nextSibling, _el$60 = _el$59.nextSibling, _el$61 = _el$57.nextSibling;
        _el$44.$$input = (e) => uploadStore.setDbConnectionString(e.currentTarget.value);
        _el$47.$$input = (e) => uploadStore.setDbSchema(e.currentTarget.value);
        insert(_el$51, createComponent(For, {
          get each() {
            return uploadStore.state.dbTables;
          },
          children: (table) => (() => {
            var _el$72 = _tmpl$6();
            _el$72.value = table;
            insert(_el$72, table);
            return _el$72;
          })()
        }), null);
        createRenderEffect((_p$) => {
          var _v$20 = styles.dbSection, _v$21 = styles.partialSectionTitle, _v$22 = styles.toggleSub, _v$23 = styles.dbFields, _v$24 = styles.fieldGroup, _v$25 = styles.select, _v$26 = styles.fieldGroup, _v$27 = styles.input, _v$28 = styles.fieldGroup, _v$29 = styles.input, _v$30 = styles.fieldGroup, _v$31 = styles.dbTableRow, _v$32 = styles.select, _v$33 = !uploadStore.state.dbConnected, _v$34 = styles.input, _v$35 = styles.fieldGroup, _v$36 = styles.input, _v$37 = styles.dbBtnRow, _v$38 = styles.primaryBtn, _v$39 = styles.primaryBtn, _v$40 = styles.ghostBtn, _v$41 = styles.status;
          _v$20 !== _p$.e && className(_el$35, _p$.e = _v$20);
          _v$21 !== _p$.t && className(_el$36, _p$.t = _v$21);
          _v$22 !== _p$.a && className(_el$37, _p$.a = _v$22);
          _v$23 !== _p$.o && className(_el$38, _p$.o = _v$23);
          _v$24 !== _p$.i && className(_el$39, _p$.i = _v$24);
          _v$25 !== _p$.n && className(_el$41, _p$.n = _v$25);
          _v$26 !== _p$.s && className(_el$42, _p$.s = _v$26);
          _v$27 !== _p$.h && className(_el$44, _p$.h = _v$27);
          _v$28 !== _p$.r && className(_el$45, _p$.r = _v$28);
          _v$29 !== _p$.d && className(_el$47, _p$.d = _v$29);
          _v$30 !== _p$.l && className(_el$48, _p$.l = _v$30);
          _v$31 !== _p$.u && className(_el$50, _p$.u = _v$31);
          _v$32 !== _p$.c && className(_el$51, _p$.c = _v$32);
          _v$33 !== _p$.w && (_el$51.disabled = _p$.w = _v$33);
          _v$34 !== _p$.m && className(_el$53, _p$.m = _v$34);
          _v$35 !== _p$.f && className(_el$54, _p$.f = _v$35);
          _v$36 !== _p$.y && className(_el$56, _p$.y = _v$36);
          _v$37 !== _p$.g && className(_el$57, _p$.g = _v$37);
          _v$38 !== _p$.p && className(_el$58, _p$.p = _v$38);
          _v$39 !== _p$.b && className(_el$59, _p$.b = _v$39);
          _v$40 !== _p$.T && className(_el$60, _p$.T = _v$40);
          _v$41 !== _p$.A && className(_el$61, _p$.A = _v$41);
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
          A: void 0
        });
        createRenderEffect(() => _el$44.value = uploadStore.state.dbConnectionString);
        createRenderEffect(() => _el$47.value = uploadStore.state.dbSchema);
        return _el$35;
      }
    }), null);
    insert(_el$65, () => profileMode() === "dataset" ? "Current dataset" : "Pending upload");
    _el$67.$$click = handleSelectAll;
    _el$68.$$click = handleSelectNone;
    insert(_el$70, (() => {
      var _c$ = memo(() => !!uploadStore.state.isPreviewing);
      return () => _c$() ? "Loading preview..." : memo(() => !!uploadStore.state.previewMetadata)() ? `${uploadStore.state.previewMetadata.total_rows.toLocaleString()} rows × ${uploadStore.state.previewMetadata.columns.length} columns` : "Select a file to preview columns";
    })());
    insert(_el$62, createComponent(ColumnProfileGrid, {
      get profiles() {
        return uploadStore.state.previewProfiles;
      },
      get selectedColumns() {
        return uploadStore.state.selectedColumns;
      },
      onSelectionChange: (cols) => uploadStore.setSelectedColumns(cols)
    }), null);
    createRenderEffect((_p$) => {
      var _v$42 = styles.page, _v$43 = styles.uploadInner, _v$44 = styles.sourceTabs, _v$45 = `${styles.tabBtn} ${uploadStore.state.source === "file" ? styles.active : ""}`, _v$46 = uploadStore.state.source === "file", _v$47 = `${styles.tabBtn} ${uploadStore.state.source === "database" ? styles.active : ""}`, _v$48 = uploadStore.state.source === "database", _v$49 = styles.uploadPreview, _v$50 = styles.uploadPreviewHead, _v$51 = styles.toolbarLabel, _v$52 = `${styles.profileModeBadge}`, _v$53 = profileMode(), _v$54 = styles.uploadPreviewSelection, _v$55 = styles.selectBtn, _v$56 = styles.selectBtn, _v$57 = styles.columnFilterInput, _v$58 = styles.uploadPreviewStatus;
      _v$42 !== _p$.e && className(_el$, _p$.e = _v$42);
      _v$43 !== _p$.t && className(_el$2, _p$.t = _v$43);
      _v$44 !== _p$.a && className(_el$3, _p$.a = _v$44);
      _v$45 !== _p$.o && className(_el$4, _p$.o = _v$45);
      _v$46 !== _p$.i && setAttribute(_el$4, "aria-selected", _p$.i = _v$46);
      _v$47 !== _p$.n && className(_el$5, _p$.n = _v$47);
      _v$48 !== _p$.s && setAttribute(_el$5, "aria-selected", _p$.s = _v$48);
      _v$49 !== _p$.h && className(_el$62, _p$.h = _v$49);
      _v$50 !== _p$.r && className(_el$63, _p$.r = _v$50);
      _v$51 !== _p$.d && className(_el$64, _p$.d = _v$51);
      _v$52 !== _p$.l && className(_el$65, _p$.l = _v$52);
      _v$53 !== _p$.u && setAttribute(_el$65, "data-mode", _p$.u = _v$53);
      _v$54 !== _p$.c && className(_el$66, _p$.c = _v$54);
      _v$55 !== _p$.w && className(_el$67, _p$.w = _v$55);
      _v$56 !== _p$.m && className(_el$68, _p$.m = _v$56);
      _v$57 !== _p$.f && className(_el$69, _p$.f = _v$57);
      _v$58 !== _p$.y && className(_el$70, _p$.y = _v$58);
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
      y: void 0
    });
    return _el$;
  })();
};
delegateEvents(["click", "input"]);

export { UploadPage as default };
//# sourceMappingURL=UploadPage.Duuiwnek.js.map
