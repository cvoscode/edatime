import { r as useNavigate, e as createSignal, B as createResource, f as createMemo, o as onMount, i as insert, h as createComponent, b as createRenderEffect, n as className, S as Show, m as memo, F as For, s as setStyleProperty, j as setAttribute, p as style, g as uiStore, u as use, t as template, k as delegateEvents } from './index.DjSmm6wY.js';
import { e as fetchCorrelationMatrix } from './api.D--3WP_v.js';
import { b as getContrastTextColor, c as correlationColor, a as getColorScaleGradientCSS } from './colorScale.CLTVXB24.js';

const page = "_page_1ixzv_1";
const toolbar = "_toolbar_1ixzv_8";
const toolbarLeft = "_toolbarLeft_1ixzv_17";
const title = "_title_1ixzv_23";
const meta = "_meta_1ixzv_29";
const resetZoomBtn = "_resetZoomBtn_1ixzv_34";
const toolbarRight = "_toolbarRight_1ixzv_49";
const controlGroup = "_controlGroup_1ixzv_55";
const label = "_label_1ixzv_61";
const select = "_select_1ixzv_66";
const slider = "_slider_1ixzv_75";
const sliderValue = "_sliderValue_1ixzv_79";
const content = "_content_1ixzv_85";
const loadingOverlay = "_loadingOverlay_1ixzv_94";
const spinner = "_spinner_1ixzv_108";
const loadingLabel = "_loadingLabel_1ixzv_121";
const empty = "_empty_1ixzv_126";
const gridWrapper = "_gridWrapper_1ixzv_135";
const selectionOverlay = "_selectionOverlay_1ixzv_141";
const grid = "_grid_1ixzv_135";
const cornerCell = "_cornerCell_1ixzv_158";
const rowLabel = "_rowLabel_1ixzv_162";
const headerCell = "_headerCell_1ixzv_178";
const cell = "_cell_1ixzv_196";
const clickable = "_clickable_1ixzv_206";
const diagonal = "_diagonal_1ixzv_216";
const cellValue = "_cellValue_1ixzv_221";
const legend = "_legend_1ixzv_224";
const legendGradient = "_legendGradient_1ixzv_231";
const legendLabel = "_legendLabel_1ixzv_237";
const hint = "_hint_1ixzv_242";
const styles = {
	page: page,
	toolbar: toolbar,
	toolbarLeft: toolbarLeft,
	title: title,
	meta: meta,
	resetZoomBtn: resetZoomBtn,
	toolbarRight: toolbarRight,
	controlGroup: controlGroup,
	label: label,
	select: select,
	slider: slider,
	sliderValue: sliderValue,
	content: content,
	loadingOverlay: loadingOverlay,
	spinner: spinner,
	loadingLabel: loadingLabel,
	empty: empty,
	gridWrapper: gridWrapper,
	selectionOverlay: selectionOverlay,
	grid: grid,
	cornerCell: cornerCell,
	rowLabel: rowLabel,
	headerCell: headerCell,
	cell: cell,
	clickable: clickable,
	diagonal: diagonal,
	cellValue: cellValue,
	legend: legend,
	legendGradient: legendGradient,
	legendLabel: legendLabel,
	hint: hint
};

var _tmpl$ = /* @__PURE__ */ template(`<span> × <!> variables`), _tmpl$2 = /* @__PURE__ */ template(`<button>Reset zoom`), _tmpl$3 = /* @__PURE__ */ template(`<div><div></div><span>Loading correlation matrix...`), _tmpl$4 = /* @__PURE__ */ template(`<div>No numeric columns available for correlation analysis.`), _tmpl$5 = /* @__PURE__ */ template(`<div><div><div></div></div><div>`), _tmpl$6 = /* @__PURE__ */ template(`<div><span>−1</span><div></div><span>0</span><span>+1`), _tmpl$7 = /* @__PURE__ */ template(`<p>Click any cell to explore that pair in the Scatter view → | Drag to box-zoom | Scroll to zoom | Double-click to reset`), _tmpl$8 = /* @__PURE__ */ template(`<div>No dataset loaded. Please upload or select a sample dataset first.`), _tmpl$9 = /* @__PURE__ */ template(`<div><div><div><h1>Correlation Heatmap</h1></div><div><div><label>Metric</label><select><option value=pearson>Pearson</option><option value=spearman>Spearman</option></select></div><div><label>Zoom</label><input type=range min=0.5 max=4 step=0.1><span>%</span></div></div></div><div>`), _tmpl$0 = /* @__PURE__ */ template(`<div>`), _tmpl$1 = /* @__PURE__ */ template(`<span>`);
const MIN_CELL_SIZE = 24;
const MAX_CELL_SIZE = 72;
const BASE_CELL_SIZE = 48;
const MIN_DRAG_PX = 8;
const BUFFER_CELLS = 2;
const HeatmapPage = () => {
  const navigate = useNavigate();
  const [metric, setMetric] = createSignal("pearson");
  const [loadInFlight, setLoadInFlight] = createSignal(false);
  const [matrix] = createResource(async () => {
    setLoadInFlight(true);
    try {
      return await fetchCorrelationMatrix();
    } finally {
      setLoadInFlight(false);
    }
  });
  const [zoomLevel, setZoomLevel] = createSignal(1);
  const [visibleRange, setVisibleRange] = createSignal(null);
  const [isSelecting, setIsSelecting] = createSignal(false);
  const [selectionBox, setSelectionBox] = createSignal(null);
  const [pointerId, setPointerId] = createSignal(null);
  let gridWrapperRef;
  const cellSize = createMemo(() => {
    const level = zoomLevel();
    return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, Math.round(BASE_CELL_SIZE * level)));
  });
  const totalColumns = createMemo(() => matrix()?.columns.length ?? 0);
  createMemo(() => {
    const cols = matrix()?.columns ?? [];
    const range = visibleRange();
    if (!range) return {
      all: cols,
      start: 0,
      end: cols.length
    };
    const start = Math.max(0, range.colStart - BUFFER_CELLS);
    const end = Math.min(cols.length, range.colEnd + BUFFER_CELLS);
    return {
      all: cols,
      start,
      end
    };
  });
  createMemo(() => {
    const cols = matrix()?.columns ?? [];
    const range = visibleRange();
    if (!range) return {
      all: cols,
      start: 0,
      end: cols.length
    };
    const start = Math.max(0, range.rowStart - BUFFER_CELLS);
    const end = Math.min(cols.length, range.rowEnd + BUFFER_CELLS);
    return {
      all: cols,
      start,
      end
    };
  });
  const hasData = () => matrix() !== void 0 && matrix() !== null;
  onMount(() => {
    const xCol = sessionStorage.getItem("scatter-x-col");
    const yCol = sessionStorage.getItem("scatter-y-col");
    if (xCol) sessionStorage.removeItem("scatter-x-col");
    if (yCol) sessionStorage.removeItem("scatter-y-col");
  });
  const handleCellClick = (rowIdx, colIdx) => {
    if (isSelecting()) return;
    const data = matrix();
    if (!data || rowIdx === colIdx) return;
    const xCol = data.columns[colIdx];
    const yCol = data.columns[rowIdx];
    sessionStorage.setItem("scatter-x-col", xCol);
    sessionStorage.setItem("scatter-y-col", yCol);
    navigate("/scatter");
  };
  const getValue = (rowIdx, colIdx) => {
    const data = matrix();
    if (!data) return null;
    return metric() === "pearson" ? data.pearson[rowIdx]?.[colIdx] ?? null : data.spearman[rowIdx]?.[colIdx] ?? null;
  };
  const isDiagonal = (rowIdx, colIdx) => {
    return rowIdx === colIdx;
  };
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel((prev) => clamp(prev + delta, 0.5, 4));
  };
  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsSelecting(true);
    setPointerId(e.pointerId);
    setSelectionBox({
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY
    });
    e.target.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (!isSelecting() || pointerId() !== e.pointerId) return;
    const box = selectionBox();
    if (!box) return;
    setSelectionBox({
      ...box,
      endX: e.clientX,
      endY: e.clientY
    });
  };
  const handlePointerUp = (e) => {
    if (!isSelecting() || pointerId() !== e.pointerId) return;
    const box = selectionBox();
    if (box) {
      const dx = Math.abs(box.endX - box.startX);
      const dy = Math.abs(box.endY - box.startY);
      if (dx > MIN_DRAG_PX || dy > MIN_DRAG_PX) {
        applyZoomSelection(box);
      }
    }
    setIsSelecting(false);
    setSelectionBox(null);
    setPointerId(null);
    e.target.releasePointerCapture(e.pointerId);
  };
  const applyZoomSelection = (box) => {
    if (!gridWrapperRef) return;
    const wrapper = gridWrapperRef;
    const rect = wrapper.getBoundingClientRect();
    const scrollLeft = wrapper.scrollLeft;
    const scrollTop = wrapper.scrollTop;
    const cellW = cellSize();
    const cellH = cellSize();
    const selX1 = Math.min(box.startX, box.endX) - rect.left + scrollLeft;
    const selX2 = Math.max(box.startX, box.endX) - rect.left + scrollLeft;
    const selY1 = Math.min(box.startY, box.endY) - rect.top + scrollTop;
    const selY2 = Math.max(box.startY, box.endY) - rect.top + scrollTop;
    const n = totalColumns();
    const rowLabelWidth = cellW;
    const colStart = clamp(Math.floor((selX1 - rowLabelWidth) / cellW), 0, n - 1);
    const colEnd = clamp(Math.ceil((selX2 - rowLabelWidth) / cellW), 0, n - 1);
    const rowStart = clamp(Math.floor(selY1 / cellH), 0, n - 1);
    const rowEnd = clamp(Math.ceil(selY2 / cellH), 0, n - 1);
    const newZoom = clamp(wrapper.clientWidth / ((colEnd - colStart + 1) * cellW + rowLabelWidth) * zoomLevel(), 0.5, 4);
    setZoomLevel(newZoom);
    const newCellSize = Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, Math.round(BASE_CELL_SIZE * newZoom)));
    const contentWidth = (colEnd - colStart + 1) * newCellSize + newCellSize;
    const contentHeight = (rowEnd - rowStart + 1) * newCellSize;
    const targetScrollX = Math.max(0, (colStart - 1) * newCellSize + newCellSize - (wrapper.clientWidth - contentWidth) / 2);
    const targetScrollY = Math.max(0, rowStart * newCellSize - (wrapper.clientHeight - contentHeight) / 2);
    setVisibleRange({
      rowStart,
      rowEnd,
      colStart,
      colEnd
    });
    requestAnimationFrame(() => {
      wrapper.scrollLeft = targetScrollX;
      wrapper.scrollTop = targetScrollY;
    });
  };
  const handleDoubleClick = () => {
    setZoomLevel(1);
    setVisibleRange(null);
    if (gridWrapperRef) {
      gridWrapperRef.scrollLeft = 0;
      gridWrapperRef.scrollTop = 0;
    }
  };
  const selectionStyle = createMemo(() => {
    const box = selectionBox();
    if (!box) return {
      display: "none"
    };
    const left = Math.min(box.startX, box.endX);
    const top = Math.min(box.startY, box.endY);
    const width = Math.abs(box.endX - box.startX);
    const height = Math.abs(box.endY - box.startY);
    return {
      display: "block",
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`
    };
  });
  return (() => {
    var _el$ = _tmpl$9(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$0 = _el$3.nextSibling, _el$1 = _el$0.firstChild, _el$10 = _el$1.firstChild, _el$11 = _el$10.nextSibling, _el$12 = _el$1.nextSibling, _el$13 = _el$12.firstChild, _el$14 = _el$13.nextSibling, _el$15 = _el$14.nextSibling, _el$16 = _el$15.firstChild, _el$17 = _el$2.nextSibling;
    insert(_el$3, createComponent(Show, {
      get when() {
        return hasData();
      },
      get children() {
        var _el$5 = _tmpl$(), _el$6 = _el$5.firstChild, _el$8 = _el$6.nextSibling; _el$8.nextSibling;
        insert(_el$5, () => matrix().columns.length, _el$6);
        insert(_el$5, () => matrix().columns.length, _el$8);
        createRenderEffect(() => className(_el$5, styles.meta));
        return _el$5;
      }
    }), null);
    insert(_el$3, createComponent(Show, {
      get when() {
        return visibleRange();
      },
      get children() {
        var _el$9 = _tmpl$2();
        _el$9.$$click = handleDoubleClick;
        createRenderEffect(() => className(_el$9, styles.resetZoomBtn));
        return _el$9;
      }
    }), null);
    _el$11.addEventListener("change", (e) => setMetric(e.currentTarget.value));
    _el$14.$$input = (e) => setZoomLevel(parseFloat(e.currentTarget.value));
    insert(_el$15, () => Math.round(zoomLevel() * 100), _el$16);
    insert(_el$17, createComponent(Show, {
      get when() {
        return loadInFlight();
      },
      get children() {
        var _el$18 = _tmpl$3(), _el$19 = _el$18.firstChild, _el$20 = _el$19.nextSibling;
        createRenderEffect((_p$) => {
          var _v$ = styles.loadingOverlay, _v$2 = styles.spinner, _v$3 = styles.loadingLabel;
          _v$ !== _p$.e && className(_el$18, _p$.e = _v$);
          _v$2 !== _p$.t && className(_el$19, _p$.t = _v$2);
          _v$3 !== _p$.a && className(_el$20, _p$.a = _v$3);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$18;
      }
    }), null);
    insert(_el$17, createComponent(Show, {
      get when() {
        return memo(() => !!(!loadInFlight() && hasData()))() && matrix().columns.length === 0;
      },
      get children() {
        var _el$21 = _tmpl$4();
        createRenderEffect(() => className(_el$21, styles.empty));
        return _el$21;
      }
    }), null);
    insert(_el$17, createComponent(Show, {
      get when() {
        return memo(() => !!(!loadInFlight() && hasData()))() && matrix().columns.length > 0;
      },
      get children() {
        return [(() => {
          var _el$22 = _tmpl$5(), _el$23 = _el$22.firstChild, _el$24 = _el$23.firstChild, _el$25 = _el$23.nextSibling;
          _el$22.$$dblclick = handleDoubleClick;
          _el$22.$$pointerup = handlePointerUp;
          _el$22.$$pointermove = handlePointerMove;
          _el$22.$$pointerdown = handlePointerDown;
          _el$22.addEventListener("wheel", handleWheel);
          var _ref$ = gridWrapperRef;
          typeof _ref$ === "function" ? use(_ref$, _el$22) : gridWrapperRef = _el$22;
          insert(_el$23, createComponent(For, {
            get each() {
              return matrix().columns;
            },
            children: (col) => (() => {
              var _el$33 = _tmpl$0();
              insert(_el$33, col);
              createRenderEffect(() => className(_el$33, styles.headerCell));
              return _el$33;
            })()
          }), null);
          insert(_el$23, createComponent(For, {
            get each() {
              return matrix().columns;
            },
            children: (rowCol, rowIdx) => [(() => {
              var _el$34 = _tmpl$0();
              insert(_el$34, rowCol);
              createRenderEffect(() => className(_el$34, styles.rowLabel));
              return _el$34;
            })(), createComponent(For, {
              get each() {
                return matrix().columns;
              },
              children: (_, colIdx) => {
                const value = () => getValue(rowIdx(), colIdx());
                const bgColor = () => correlationColor(value(), uiStore.state.colorScale);
                const textColor = () => getContrastTextColor(bgColor());
                const isDiag = () => isDiagonal(rowIdx(), colIdx());
                return (() => {
                  var _el$35 = _tmpl$0();
                  _el$35.$$click = () => handleCellClick(rowIdx(), colIdx());
                  insert(_el$35, createComponent(Show, {
                    get when() {
                      return value() !== null;
                    },
                    get children() {
                      var _el$36 = _tmpl$1();
                      insert(_el$36, (() => {
                        var _c$ = memo(() => !!isDiag());
                        return () => _c$() ? "1.00" : value().toFixed(2);
                      })());
                      createRenderEffect((_p$) => {
                        var _v$32 = styles.cellValue, _v$33 = textColor();
                        _v$32 !== _p$.e && className(_el$36, _p$.e = _v$32);
                        _v$33 !== _p$.t && setStyleProperty(_el$36, "color", _p$.t = _v$33);
                        return _p$;
                      }, {
                        e: void 0,
                        t: void 0
                      });
                      return _el$36;
                    }
                  }));
                  createRenderEffect((_p$) => {
                    var _v$34 = `${styles.cell} ${isDiag() ? styles.diagonal : styles.clickable}`, _v$35 = bgColor(), _v$36 = isDiag() ? "" : `${matrix().columns[colIdx()]} vs ${rowCol}`;
                    _v$34 !== _p$.e && className(_el$35, _p$.e = _v$34);
                    _v$35 !== _p$.t && setStyleProperty(_el$35, "background", _p$.t = _v$35);
                    _v$36 !== _p$.a && setAttribute(_el$35, "title", _p$.a = _v$36);
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0,
                    a: void 0
                  });
                  return _el$35;
                })();
              }
            })]
          }), null);
          createRenderEffect((_p$) => {
            var _v$4 = styles.gridWrapper, _v$5 = isSelecting() ? "crosshair" : "default", _v$6 = styles.grid, _v$7 = `${cellSize()}px`, _v$8 = `var(--cell-size) repeat(${matrix().columns.length}, var(--cell-size))`, _v$9 = styles.cornerCell, _v$0 = styles.selectionOverlay, _v$1 = selectionStyle();
            _v$4 !== _p$.e && className(_el$22, _p$.e = _v$4);
            _v$5 !== _p$.t && setStyleProperty(_el$22, "cursor", _p$.t = _v$5);
            _v$6 !== _p$.a && className(_el$23, _p$.a = _v$6);
            _v$7 !== _p$.o && setStyleProperty(_el$23, "--cell-size", _p$.o = _v$7);
            _v$8 !== _p$.i && setStyleProperty(_el$23, "grid-template-columns", _p$.i = _v$8);
            _v$9 !== _p$.n && className(_el$24, _p$.n = _v$9);
            _v$0 !== _p$.s && className(_el$25, _p$.s = _v$0);
            _p$.h = style(_el$25, _v$1, _p$.h);
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
          return _el$22;
        })(), (() => {
          var _el$26 = _tmpl$6(), _el$27 = _el$26.firstChild, _el$28 = _el$27.nextSibling, _el$29 = _el$28.nextSibling, _el$30 = _el$29.nextSibling;
          createRenderEffect((_p$) => {
            var _v$10 = styles.legend, _v$11 = styles.legendLabel, _v$12 = getContrastTextColor(correlationColor(-1, uiStore.state.colorScale)), _v$13 = styles.legendGradient, _v$14 = getColorScaleGradientCSS(uiStore.state.colorScale), _v$15 = styles.legendLabel, _v$16 = getContrastTextColor(correlationColor(0, uiStore.state.colorScale)), _v$17 = styles.legendLabel, _v$18 = getContrastTextColor(correlationColor(1, uiStore.state.colorScale));
            _v$10 !== _p$.e && className(_el$26, _p$.e = _v$10);
            _v$11 !== _p$.t && className(_el$27, _p$.t = _v$11);
            _v$12 !== _p$.a && setStyleProperty(_el$27, "color", _p$.a = _v$12);
            _v$13 !== _p$.o && className(_el$28, _p$.o = _v$13);
            _v$14 !== _p$.i && setStyleProperty(_el$28, "background", _p$.i = _v$14);
            _v$15 !== _p$.n && className(_el$29, _p$.n = _v$15);
            _v$16 !== _p$.s && setStyleProperty(_el$29, "color", _p$.s = _v$16);
            _v$17 !== _p$.h && className(_el$30, _p$.h = _v$17);
            _v$18 !== _p$.r && setStyleProperty(_el$30, "color", _p$.r = _v$18);
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
          return _el$26;
        })(), (() => {
          var _el$31 = _tmpl$7();
          createRenderEffect(() => className(_el$31, styles.hint));
          return _el$31;
        })()];
      }
    }), null);
    insert(_el$17, createComponent(Show, {
      get when() {
        return memo(() => !!!loadInFlight())() && !hasData();
      },
      get children() {
        var _el$32 = _tmpl$8();
        createRenderEffect(() => className(_el$32, styles.empty));
        return _el$32;
      }
    }), null);
    createRenderEffect((_p$) => {
      var _v$19 = styles.page, _v$20 = styles.toolbar, _v$21 = styles.toolbarLeft, _v$22 = styles.title, _v$23 = styles.toolbarRight, _v$24 = styles.controlGroup, _v$25 = styles.label, _v$26 = styles.select, _v$27 = styles.controlGroup, _v$28 = styles.label, _v$29 = styles.slider, _v$30 = styles.sliderValue, _v$31 = styles.content;
      _v$19 !== _p$.e && className(_el$, _p$.e = _v$19);
      _v$20 !== _p$.t && className(_el$2, _p$.t = _v$20);
      _v$21 !== _p$.a && className(_el$3, _p$.a = _v$21);
      _v$22 !== _p$.o && className(_el$4, _p$.o = _v$22);
      _v$23 !== _p$.i && className(_el$0, _p$.i = _v$23);
      _v$24 !== _p$.n && className(_el$1, _p$.n = _v$24);
      _v$25 !== _p$.s && className(_el$10, _p$.s = _v$25);
      _v$26 !== _p$.h && className(_el$11, _p$.h = _v$26);
      _v$27 !== _p$.r && className(_el$12, _p$.r = _v$27);
      _v$28 !== _p$.d && className(_el$13, _p$.d = _v$28);
      _v$29 !== _p$.l && className(_el$14, _p$.l = _v$29);
      _v$30 !== _p$.u && className(_el$15, _p$.u = _v$30);
      _v$31 !== _p$.c && className(_el$17, _p$.c = _v$31);
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
      c: void 0
    });
    createRenderEffect(() => _el$11.value = metric());
    createRenderEffect(() => _el$14.value = zoomLevel());
    return _el$;
  })();
};
delegateEvents(["click", "input", "pointerdown", "pointermove", "pointerup", "dblclick"]);

export { HeatmapPage as default };
//# sourceMappingURL=HeatmapPage.4EpOTor8.js.map
