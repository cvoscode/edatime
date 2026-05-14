import { i as insert, b as createRenderEffect, n as className, t as template } from './index.C65iRSEf.js';

const page = "_page_1i63e_1";
const title = "_title_1i63e_5";
const placeholder = "_placeholder_1i63e_11";
const styles = {
	page: page,
	title: title,
	placeholder: placeholder
};

var _tmpl$ = /* @__PURE__ */ template(`<div><h1></h1><p>Page not yet migrated`);
const PlaceholderPage = (props) => (() => {
  var _el$ = _tmpl$(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling;
  insert(_el$2, () => props.title);
  createRenderEffect((_p$) => {
    var _v$ = styles.page, _v$2 = styles.title, _v$3 = styles.placeholder;
    _v$ !== _p$.e && className(_el$, _p$.e = _v$);
    _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
    _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
    return _p$;
  }, {
    e: void 0,
    t: void 0,
    a: void 0
  });
  return _el$;
})();

export { PlaceholderPage as default };
//# sourceMappingURL=PlaceholderPage.BkCXBEBv.js.map
