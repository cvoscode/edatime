import { v as splitProps, w as spread, x as mergeProps, i as insert, t as template, e as createComponent, q as uiStore, b as createRenderEffect, f as className } from './index.ejaTb3X2.js';
import './Dropdown.zvInWQuU.js';

const button = "_button_5bhlf_1";
const primary = "_primary_5bhlf_18";
const secondary = "_secondary_5bhlf_27";
const ghost = "_ghost_5bhlf_37";
const danger = "_danger_5bhlf_46";
const sm = "_sm_5bhlf_56";
const md = "_md_5bhlf_61";
const lg = "_lg_5bhlf_66";
const styles$1 = {
	button: button,
	primary: primary,
	secondary: secondary,
	ghost: ghost,
	danger: danger,
	sm: sm,
	md: md,
	lg: lg
};

var _tmpl$$1 = /* @__PURE__ */ template(`<button>`);
const Button = (props) => {
  const [local, rest] = splitProps(props, ["variant", "size", "class", "children"]);
  const variant = () => local.variant ?? "primary";
  const size = () => local.size ?? "md";
  return (() => {
    var _el$ = _tmpl$$1();
    spread(_el$, mergeProps({
      get ["class"]() {
        return `${styles$1.button} ${styles$1[variant()]} ${styles$1[size()]} ${local.class ?? ""}`;
      }
    }, rest), false, true);
    insert(_el$, () => local.children);
    return _el$;
  })();
};

const page = "_page_yvcy9_1";
const title = "_title_yvcy9_6";
const section = "_section_yvcy9_12";
const sectionTitle = "_sectionTitle_yvcy9_16";
const themeButtons = "_themeButtons_yvcy9_25";
const about = "_about_yvcy9_30";
const styles = {
	page: page,
	title: title,
	section: section,
	sectionTitle: sectionTitle,
	themeButtons: themeButtons,
	about: about
};

var _tmpl$ = /* @__PURE__ */ template(`<div><h1>Settings</h1><div><h2>Theme</h2><div></div></div><div><h2>About</h2><p>edatime v0.1.0</p><p>Analytics for time series data`);
const SettingsPage = () => {
  return (() => {
    var _el$ = _tmpl$(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$6 = _el$3.nextSibling, _el$7 = _el$6.firstChild, _el$8 = _el$7.nextSibling, _el$9 = _el$8.nextSibling;
    insert(_el$5, createComponent(Button, {
      get variant() {
        return uiStore.state.theme === "dark" ? "primary" : "secondary";
      },
      onClick: () => uiStore.setTheme("dark"),
      children: "Dark"
    }), null);
    insert(_el$5, createComponent(Button, {
      get variant() {
        return uiStore.state.theme === "light" ? "primary" : "secondary";
      },
      onClick: () => uiStore.setTheme("light"),
      children: "Light"
    }), null);
    insert(_el$5, createComponent(Button, {
      get variant() {
        return uiStore.state.theme === "system" ? "primary" : "secondary";
      },
      onClick: () => uiStore.setTheme("system"),
      children: "System"
    }), null);
    createRenderEffect((_p$) => {
      var _v$ = styles.page, _v$2 = styles.title, _v$3 = styles.section, _v$4 = styles.sectionTitle, _v$5 = styles.themeButtons, _v$6 = styles.section, _v$7 = styles.sectionTitle, _v$8 = styles.about, _v$9 = styles.about;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$4, _p$.o = _v$4);
      _v$5 !== _p$.i && className(_el$5, _p$.i = _v$5);
      _v$6 !== _p$.n && className(_el$6, _p$.n = _v$6);
      _v$7 !== _p$.s && className(_el$7, _p$.s = _v$7);
      _v$8 !== _p$.h && className(_el$8, _p$.h = _v$8);
      _v$9 !== _p$.r && className(_el$9, _p$.r = _v$9);
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
    return _el$;
  })();
};

export { SettingsPage as default };
//# sourceMappingURL=SettingsPage.C81n3RFT.js.map
