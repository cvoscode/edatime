import { v as splitProps, w as spread, x as mergeProps, i as insert, m as memo, b as createRenderEffect, f as className, t as template } from './index.ejaTb3X2.js';

const wrapper = "_wrapper_1icaq_1";
const input = "_input_1icaq_8";
const track = "_track_1icaq_15";
const thumb = "_thumb_1icaq_25";
const label = "_label_1icaq_51";
const styles = {
	wrapper: wrapper,
	input: input,
	track: track,
	thumb: thumb,
	label: label
};

var _tmpl$ = /* @__PURE__ */ template(`<label><input type=checkbox><span><span>`), _tmpl$2 = /* @__PURE__ */ template(`<span>`);
const SwitchToggle = (props) => {
  const [local, rest] = splitProps(props, ["label", "class"]);
  return (() => {
    var _el$ = _tmpl$(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling, _el$4 = _el$3.firstChild;
    spread(_el$2, mergeProps({
      get ["class"]() {
        return styles.input;
      }
    }, rest), false, false);
    insert(_el$, (() => {
      var _c$ = memo(() => !!local.label);
      return () => _c$() && (() => {
        var _el$5 = _tmpl$2();
        insert(_el$5, () => local.label);
        createRenderEffect(() => className(_el$5, styles.label));
        return _el$5;
      })();
    })(), null);
    createRenderEffect((_p$) => {
      var _v$ = `${styles.wrapper} ${local.class ?? ""}`, _v$2 = styles.track, _v$3 = styles.thumb;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$3, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$4, _p$.a = _v$3);
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0
    });
    return _el$;
  })();
};

export { SwitchToggle as S };
//# sourceMappingURL=SwitchToggle.DmpyzbKN.js.map
