import { f as createMemo, i as insert, h as createComponent, j as setAttribute, b as createRenderEffect, n as className, s as setStyleProperty, F as For, t as template, k as delegateEvents } from './index.C65iRSEf.js';

const chips = "_chips_1bvwe_1";
const chip = "_chip_1bvwe_1";
const selected = "_selected_1bvwe_28";
const label = "_label_1bvwe_35";
const checkbox = "_checkbox_1bvwe_39";
const colorPicker = "_colorPicker_1bvwe_46";
const menuBtn = "_menuBtn_1bvwe_75";
const styles = {
	chips: chips,
	chip: chip,
	selected: selected,
	label: label,
	checkbox: checkbox,
	colorPicker: colorPicker,
	menuBtn: menuBtn
};

var _tmpl$ = /* @__PURE__ */ template(`<div>`), _tmpl$2 = /* @__PURE__ */ template(`<label><input type=checkbox><input type=color><span></span><button type=button><svg viewBox="0 0 16 16"fill=currentColor><circle cx=8 cy=3 r=1.5></circle><circle cx=8 cy=8 r=1.5></circle><circle cx=8 cy=13 r=1.5>`);
const SERIES_COLORS = ["#00a8ff", "#ff6b6b", "#51cf66", "#ffd43b", "#cc5de8", "#ff922b", "#22b8cf", "#f06595", "#94d82d", "#748ffc"];
const ColumnChips = (props) => {
  const filteredColumns = createMemo(() => {
    if (!props.filter) return props.columns;
    const lower = props.filter.toLowerCase();
    return props.columns.filter((col) => col.toLowerCase().includes(lower));
  });
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
    var _el$ = _tmpl$();
    insert(_el$, createComponent(For, {
      get each() {
        return filteredColumns();
      },
      children: (col, idx) => (() => {
        var _el$2 = _tmpl$2(), _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$4.nextSibling, _el$6 = _el$5.nextSibling;
        _el$2.$$click = () => toggle(col);
        _el$3.$$click = (e) => e.stopPropagation();
        _el$3.addEventListener("change", () => toggle(col));
        _el$4.$$input = (e) => handleColorChange(col, e);
        _el$4.$$click = (e) => e.stopPropagation();
        _el$4.$$mousedown = handleColorPointerDown;
        _el$4.$$pointerdown = handleColorPointerDown;
        setAttribute(_el$4, "title", `Color for ${col}`);
        setAttribute(_el$4, "aria-label", `Color for ${col}`);
        insert(_el$5, col);
        _el$6.$$click = (e) => handleMenuClick(col, e);
        setAttribute(_el$6, "title", `Filter range for ${col}`);
        setAttribute(_el$6, "aria-label", `Filter range for ${col}`);
        createRenderEffect((_p$) => {
          var _v$ = `${styles.chip} ${isSelected(col) ? styles.selected : ""}`, _v$2 = props.colors?.[col] ?? props.colorScalePalette?.[idx() % (props.colorScalePalette?.length ?? 1)] ?? SERIES_COLORS[idx() % SERIES_COLORS.length], _v$3 = styles.checkbox, _v$4 = styles.colorPicker, _v$5 = styles.label, _v$6 = styles.menuBtn;
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
        createRenderEffect(() => _el$4.value = props.colors?.[col] ?? props.colorScalePalette?.[idx() % (props.colorScalePalette?.length ?? 1)] ?? SERIES_COLORS[idx() % SERIES_COLORS.length]);
        return _el$2;
      })()
    }));
    createRenderEffect(() => className(_el$, styles.chips));
    return _el$;
  })();
};
delegateEvents(["click", "pointerdown", "mousedown", "input"]);

export { ColumnChips as C };
//# sourceMappingURL=ColumnChips.Bi6Jm6lU.js.map
