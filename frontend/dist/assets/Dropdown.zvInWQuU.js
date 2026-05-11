import { j as createEffect, a as onCleanup, e as createComponent, P as Portal, k as addEventListener, i as insert, S as Show, b as createRenderEffect, f as className, t as template, h as delegateEvents } from './index.ejaTb3X2.js';

const overlay = "_overlay_mfv0e_1";
const modal = "_modal_mfv0e_12";
const header = "_header_mfv0e_25";
const title = "_title_mfv0e_33";
const closeBtn = "_closeBtn_mfv0e_39";
const body = "_body_mfv0e_55";
const footer = "_footer_mfv0e_61";
const styles = {
	overlay: overlay,
	modal: modal,
	header: header,
	title: title,
	closeBtn: closeBtn,
	body: body,
	footer: footer
};

var _tmpl$ = /* @__PURE__ */ template(`<div><h2></h2><button aria-label=Close>×`), _tmpl$2 = /* @__PURE__ */ template(`<div>`), _tmpl$3 = /* @__PURE__ */ template(`<div><div><div>`);
const Modal = (props) => {
  createEffect(() => {
    if (props.open) {
      const handleKeyDown = (e) => {
        if (e.key === "Escape") props.onClose();
      };
      document.addEventListener("keydown", handleKeyDown);
      onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
    }
  });
  return createComponent(Show, {
    get when() {
      return props.open;
    },
    get children() {
      return createComponent(Portal, {
        get children() {
          var _el$ = _tmpl$3(), _el$2 = _el$.firstChild, _el$6 = _el$2.firstChild;
          addEventListener(_el$, "click", props.onClose, true);
          _el$2.$$click = (e) => e.stopPropagation();
          insert(_el$2, createComponent(Show, {
            get when() {
              return props.title;
            },
            get children() {
              var _el$3 = _tmpl$(), _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling;
              insert(_el$4, () => props.title);
              addEventListener(_el$5, "click", props.onClose, true);
              createRenderEffect((_p$) => {
                var _v$ = styles.header, _v$2 = styles.title, _v$3 = styles.closeBtn;
                _v$ !== _p$.e && className(_el$3, _p$.e = _v$);
                _v$2 !== _p$.t && className(_el$4, _p$.t = _v$2);
                _v$3 !== _p$.a && className(_el$5, _p$.a = _v$3);
                return _p$;
              }, {
                e: void 0,
                t: void 0,
                a: void 0
              });
              return _el$3;
            }
          }), _el$6);
          insert(_el$6, () => props.children);
          insert(_el$2, createComponent(Show, {
            get when() {
              return props.footer;
            },
            get children() {
              var _el$7 = _tmpl$2();
              insert(_el$7, () => props.footer);
              createRenderEffect(() => className(_el$7, styles.footer));
              return _el$7;
            }
          }), null);
          createRenderEffect((_p$) => {
            var _v$4 = styles.overlay, _v$5 = styles.modal, _v$6 = styles.body;
            _v$4 !== _p$.e && className(_el$, _p$.e = _v$4);
            _v$5 !== _p$.t && className(_el$2, _p$.t = _v$5);
            _v$6 !== _p$.a && className(_el$6, _p$.a = _v$6);
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0
          });
          return _el$;
        }
      });
    }
  });
};
delegateEvents(["click"]);

delegateEvents(["click"]);

delegateEvents(["click"]);

delegateEvents(["input"]);

delegateEvents(["click"]);

export { Modal as M };
//# sourceMappingURL=Dropdown.zvInWQuU.js.map
