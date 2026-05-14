import { e as createSignal, c as createEffect, l as addEventListener, i as insert, m as memo, b as createRenderEffect, n as className, D as classList, t as template, k as delegateEvents } from './index.DjSmm6wY.js';

const drawer = "_drawer_1oxxv_1";
const open = "_open_1oxxv_17";
const header = "_header_1oxxv_21";
const title = "_title_1oxxv_29";
const closeBtn = "_closeBtn_1oxxv_35";
const body = "_body_1oxxv_52";
const section = "_section_1oxxv_61";
const sectionTitle = "_sectionTitle_1oxxv_67";
const field = "_field_1oxxv_75";
const hint = "_hint_1oxxv_104";
const styles = {
	drawer: drawer,
	open: open,
	header: header,
	title: title,
	closeBtn: closeBtn,
	body: body,
	section: section,
	sectionTitle: sectionTitle,
	field: field,
	hint: hint
};

var _tmpl$ = /* @__PURE__ */ template(`<div><div><span>Chart Labels</span><button aria-label=Close>×</button></div><div><div><div>Axis Labels</div><div><label for=x-axis-label-input>X-Axis</label><input type=text id=x-axis-label-input placeholder="X-axis label"></div><div><label for=y-axis-label-input>Y-Axis</label><input type=text id=y-axis-label-input placeholder="Y-axis label"></div></div><div><div>Title</div><div><label for=chart-title-input>Chart Title</label><input type=text id=chart-title-input placeholder="Chart title">`), _tmpl$2 = /* @__PURE__ */ template(`<div>Title is not supported in WebGPU mode. Axis labels are supported.`);
const LabelsDrawer = (props) => {
  const [localTitle, setLocalTitle] = createSignal("");
  const [localXAxisLabel, setLocalXAxisLabel] = createSignal("");
  const [localYAxisLabel, setLocalYAxisLabel] = createSignal("");
  createEffect(() => {
    if (props.open) {
      setLocalTitle(props.title);
      setLocalXAxisLabel(props.xAxisLabel);
      setLocalYAxisLabel(props.yAxisLabel);
    }
  });
  const handleTitleChange = (value) => {
    setLocalTitle(value);
    props.onChange(value, localXAxisLabel(), localYAxisLabel());
  };
  const handleXAxisChange = (value) => {
    setLocalXAxisLabel(value);
    props.onChange(localTitle(), value, localYAxisLabel());
  };
  const handleYAxisChange = (value) => {
    setLocalYAxisLabel(value);
    props.onChange(localTitle(), localXAxisLabel(), value);
  };
  return (() => {
    var _el$ = _tmpl$(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$2.nextSibling, _el$6 = _el$5.firstChild, _el$7 = _el$6.firstChild, _el$8 = _el$7.nextSibling, _el$9 = _el$8.firstChild, _el$0 = _el$9.nextSibling, _el$1 = _el$8.nextSibling, _el$10 = _el$1.firstChild, _el$11 = _el$10.nextSibling, _el$12 = _el$6.nextSibling, _el$13 = _el$12.firstChild, _el$14 = _el$13.nextSibling, _el$15 = _el$14.firstChild, _el$16 = _el$15.nextSibling;
    addEventListener(_el$4, "click", props.onClose, true);
    _el$0.$$input = (e) => handleXAxisChange(e.currentTarget.value);
    _el$11.$$input = (e) => handleYAxisChange(e.currentTarget.value);
    _el$16.$$input = (e) => handleTitleChange(e.currentTarget.value);
    insert(_el$12, (() => {
      var _c$ = memo(() => props.engineName === "ChartGPU");
      return () => _c$() && (() => {
        var _el$17 = _tmpl$2();
        createRenderEffect(() => className(_el$17, styles.hint));
        return _el$17;
      })();
    })(), null);
    createRenderEffect((_p$) => {
      var _v$ = styles.drawer, _v$2 = {
        [styles.open]: props.open
      }, _v$3 = styles.header, _v$4 = styles.title, _v$5 = styles.closeBtn, _v$6 = styles.body, _v$7 = styles.section, _v$8 = styles.sectionTitle, _v$9 = styles.field, _v$0 = styles.field, _v$1 = styles.section, _v$10 = styles.sectionTitle, _v$11 = styles.field;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _p$.t = classList(_el$, _v$2, _p$.t);
      _v$3 !== _p$.a && className(_el$2, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$3, _p$.o = _v$4);
      _v$5 !== _p$.i && className(_el$4, _p$.i = _v$5);
      _v$6 !== _p$.n && className(_el$5, _p$.n = _v$6);
      _v$7 !== _p$.s && className(_el$6, _p$.s = _v$7);
      _v$8 !== _p$.h && className(_el$7, _p$.h = _v$8);
      _v$9 !== _p$.r && className(_el$8, _p$.r = _v$9);
      _v$0 !== _p$.d && className(_el$1, _p$.d = _v$0);
      _v$1 !== _p$.l && className(_el$12, _p$.l = _v$1);
      _v$10 !== _p$.u && className(_el$13, _p$.u = _v$10);
      _v$11 !== _p$.c && className(_el$14, _p$.c = _v$11);
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
    createRenderEffect(() => _el$0.value = localXAxisLabel());
    createRenderEffect(() => _el$11.value = localYAxisLabel());
    createRenderEffect(() => _el$16.value = localTitle());
    return _el$;
  })();
};
delegateEvents(["click", "input"]);

export { LabelsDrawer as L };
//# sourceMappingURL=LabelsDrawer.BSE15MTV.js.map
