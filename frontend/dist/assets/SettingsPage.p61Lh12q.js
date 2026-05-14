import { i as insert, g as uiStore, m as memo, b as createRenderEffect, n as className, s as setStyleProperty, h as createComponent, A, t as template, k as delegateEvents } from './index.DjSmm6wY.js';
import { C as COLORMAPS, a as getColorScaleGradientCSS } from './colorScale.CLTVXB24.js';

const page = "_page_kdnz0_1";
const hero = "_hero_kdnz0_10";
const heroIcon = "_heroIcon_kdnz0_20";
const title = "_title_kdnz0_38";
const tagline = "_tagline_kdnz0_46";
const content = "_content_kdnz0_54";
const section = "_section_kdnz0_61";
const sectionTitle = "_sectionTitle_kdnz0_66";
const sectionCopy = "_sectionCopy_kdnz0_73";
const themeGrid = "_themeGrid_kdnz0_81";
const themeCard = "_themeCard_kdnz0_87";
const active = "_active_kdnz0_107";
const themeIcon = "_themeIcon_kdnz0_112";
const themeInfo = "_themeInfo_kdnz0_128";
const themeName = "_themeName_kdnz0_135";
const themeDesc = "_themeDesc_kdnz0_141";
const checkmark = "_checkmark_kdnz0_147";
const prefsGrid = "_prefsGrid_kdnz0_168";
const prefCard = "_prefCard_kdnz0_174";
const prefHeader = "_prefHeader_kdnz0_190";
const prefIcon = "_prefIcon_kdnz0_196";
const prefInfo = "_prefInfo_kdnz0_213";
const prefName = "_prefName_kdnz0_218";
const prefValue = "_prefValue_kdnz0_224";
const prefTag = "_prefTag_kdnz0_230";
const prefDesc = "_prefDesc_kdnz0_242";
const shortcutsGrid = "_shortcutsGrid_kdnz0_249";
const shortcutGroup = "_shortcutGroup_kdnz0_256";
const shortcutGroupTitle = "_shortcutGroupTitle_kdnz0_262";
const shortcutRow = "_shortcutRow_kdnz0_272";
const aboutGrid = "_aboutGrid_kdnz0_295";
const aboutCard = "_aboutCard_kdnz0_302";
const aboutIcon = "_aboutIcon_kdnz0_317";
const aboutInfo = "_aboutInfo_kdnz0_334";
const aboutName = "_aboutName_kdnz0_341";
const aboutVersion = "_aboutVersion_kdnz0_347";
const aboutDesc = "_aboutDesc_kdnz0_352";
const links = "_links_kdnz0_359";
const link = "_link_kdnz0_359";
const colorScaleGrid = "_colorScaleGrid_kdnz0_380";
const colorScaleCard = "_colorScaleCard_kdnz0_386";
const colorScalePreview = "_colorScalePreview_kdnz0_411";
const colorScaleInfo = "_colorScaleInfo_kdnz0_417";
const colorScaleName = "_colorScaleName_kdnz0_424";
const colorScaleDesc = "_colorScaleDesc_kdnz0_430";
const plotThemeGrid = "_plotThemeGrid_kdnz0_437";
const plotThemeCard = "_plotThemeCard_kdnz0_443";
const plotThemeIcon = "_plotThemeIcon_kdnz0_468";
const plotThemeInfo = "_plotThemeInfo_kdnz0_484";
const plotThemeName = "_plotThemeName_kdnz0_491";
const plotThemeDesc = "_plotThemeDesc_kdnz0_497";
const styles = {
	page: page,
	hero: hero,
	heroIcon: heroIcon,
	title: title,
	tagline: tagline,
	content: content,
	section: section,
	sectionTitle: sectionTitle,
	sectionCopy: sectionCopy,
	themeGrid: themeGrid,
	themeCard: themeCard,
	active: active,
	themeIcon: themeIcon,
	themeInfo: themeInfo,
	themeName: themeName,
	themeDesc: themeDesc,
	checkmark: checkmark,
	prefsGrid: prefsGrid,
	prefCard: prefCard,
	prefHeader: prefHeader,
	prefIcon: prefIcon,
	prefInfo: prefInfo,
	prefName: prefName,
	prefValue: prefValue,
	prefTag: prefTag,
	prefDesc: prefDesc,
	shortcutsGrid: shortcutsGrid,
	shortcutGroup: shortcutGroup,
	shortcutGroupTitle: shortcutGroupTitle,
	shortcutRow: shortcutRow,
	aboutGrid: aboutGrid,
	aboutCard: aboutCard,
	aboutIcon: aboutIcon,
	aboutInfo: aboutInfo,
	aboutName: aboutName,
	aboutVersion: aboutVersion,
	aboutDesc: aboutDesc,
	links: links,
	link: link,
	colorScaleGrid: colorScaleGrid,
	colorScaleCard: colorScaleCard,
	colorScalePreview: colorScalePreview,
	colorScaleInfo: colorScaleInfo,
	colorScaleName: colorScaleName,
	colorScaleDesc: colorScaleDesc,
	plotThemeGrid: plotThemeGrid,
	plotThemeCard: plotThemeCard,
	plotThemeIcon: plotThemeIcon,
	plotThemeInfo: plotThemeInfo,
	plotThemeName: plotThemeName,
	plotThemeDesc: plotThemeDesc
};

var _tmpl$ = /* @__PURE__ */ template(`<svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M14 10.5A7 7 0 1 1 5.5 2a5 5 0 0 0 8.5 8.5z">`), _tmpl$2 = /* @__PURE__ */ template(`<svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><circle cx=8 cy=8 r=3></circle><line x1=8 y1=1 x2=8 y2=3></line><line x1=8 y1=13 x2=8 y2=15></line><line x1=1 y1=8 x2=3 y2=8></line><line x1=13 y1=8 x2=15 y2=8></line><line x1=3 y1=3 x2=4.5 y2=4.5></line><line x1=11.5 y1=11.5 x2=13 y2=13></line><line x1=3 y1=13 x2=4.5 y2=11.5></line><line x1=11.5 y1=4.5 x2=13 y2=3>`), _tmpl$3 = /* @__PURE__ */ template(`<svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=2 y=2 width=12 height=10 rx=1.5></rect><polyline points="6,14 8,16 10,14">`), _tmpl$4 = /* @__PURE__ */ template(`<svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-.5 1.9l2.1 2.1a4 4 0 0 1-5.6 5.6l-2.1-2.1A4 4 0 0 1 2 8a4 4 0 0 1 10-6z"></path><path d="M12 2v4"></path><path d="M12 10v4"></path><path d="M4.93 4.93l2.83 2.83"></path><path d="M8.24 11.76l2.83 2.83"></path><path d="M2 8h4"></path><path d="M10 8h4">`), _tmpl$5 = /* @__PURE__ */ template(`<div><div><div><svg viewBox="0 0 24 24"fill=none stroke=currentColor stroke-width=1.6 stroke-linecap=round stroke-linejoin=round><circle cx=12 cy=12 r=3></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div><h1>Settings</h1><p>Tweak things until it feels just right. Changes happen instantly.</p></div><div><div><h2>Make it yours</h2><p>Pick a theme that works for you. Your eyes will thank you.</p><div></div></div><div><h2>Color scale</h2><p>Sets the palette for heatmaps, scatter plots, and charts. Pick what feels right for your data.</p><div></div></div><div><h2>Plot appearance</h2><p>Controls the background and colors of charts. Independent of the UI theme — set it however you like.</p><div></div></div><div><h2>Chart settings</h2><p>Under the hood stuff. ChartGPU handles the heavy lifting — you just get to tune how it looks.</p><div></div></div><div><h2>Keyboard shortcuts</h2><p>Once you memorize these, you'll feel like a pro. No cap.</p><div><div><h4>Navigation</h4><div><kbd>⌥1</kbd><span>Upload</span></div><div><kbd>⌥2</kbd><span>Timeseries</span></div><div><kbd>⌥3</kbd><span>Scatter</span></div><div><kbd>⌥4</kbd><span>Matrix view</span></div></div><div><h4>Chart</h4><div><kbd>Dbl-click</kbd><span>Reset zoom</span></div><div><kbd>Ctrl+click</kbd><span>Set adaptive filter</span></div><div><kbd>Drag</kbd><span>Pan / draw</span></div></div><div><h4>Session</h4><div><kbd>Ctrl+S</kbd><span>Save session</span></div><div><kbd>Ctrl+O</kbd><span>Import session</span></div><div><kbd>Ctrl+K</kbd><span>Command palette</span></div></div></div></div><div><h2>About</h2><div><div><div><svg viewBox="0 0 24 24"fill=none stroke=currentColor stroke-width=1.6 stroke-linecap=round stroke-linejoin=round><polyline points="2,18 7,10 12,22 17,6 22,16 30,12 30,12"></polyline></svg></div><div><div>EdaTime</div><div>v0.1.0</div></div></div><div><div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,10 4,6 7,12 10,3 13,8 15,7"></polyline></svg></div><div><div>ChartGPU</div><div>WebGPU rendering</div></div></div></div><p>Upload your data, explore patterns, and export insights. Built for people who actually work with time series.</p><div>`), _tmpl$6 = /* @__PURE__ */ template(`<button type=button><div></div><div><div></div><div>`), _tmpl$7 = /* @__PURE__ */ template(`<div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=2.5 stroke-linecap=round stroke-linejoin=round><polyline points="3,8 6,12 13,4">`), _tmpl$8 = /* @__PURE__ */ template(`<div><div><div><svg viewBox="0 0 16 16"fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><polyline points="1,10 4,6 7,12 10,3 13,8 15,7"></polyline></svg></div><div><div></div><div></div></div><span></span></div><p>`);
const SettingsPage = () => {
  const currentTheme = () => uiStore.state.theme;
  const currentColorScale = () => uiStore.state.colorScale;
  const currentPlotTheme = () => uiStore.state.plotTheme;
  const themeOptions = [{
    id: "dark",
    name: "Dark Mode",
    desc: "Easy on the eyes during late-night analysis sessions.",
    icon: _tmpl$()
  }, {
    id: "light",
    name: "Light Mode",
    desc: "Clean and crisp for daytime viewing.",
    icon: _tmpl$2()
  }, {
    id: "system",
    name: "Follow System",
    desc: "Matches whatever your computer is set to. Zero effort.",
    icon: _tmpl$3()
  }];
  const displayOptions = [{
    id: "renderMode",
    name: "Render Mode",
    value: "auto",
    desc: "ChartGPU decides when to show more or fewer points — keeps things snappy.",
    tag: "ChartGPU"
  }, {
    id: "animations",
    name: "Animations",
    value: "on",
    desc: "Smooth transitions when zooming and switching views. Toggle off if you prefer instant.",
    tag: "ChartGPU"
  }];
  const plotThemeOptions = [{
    id: "auto",
    name: "Auto",
    desc: "Follows your UI theme setting. Syncs nicely.",
    icon: _tmpl$4()
  }, {
    id: "light",
    name: "Light",
    desc: "Light background, dark text. Easier on the eyes in bright environments.",
    icon: _tmpl$2()
  }, {
    id: "dark",
    name: "Dark",
    desc: "Dark background, light text. Puts focus on your data.",
    icon: _tmpl$()
  }];
  return (() => {
    var _el$7 = _tmpl$5(), _el$8 = _el$7.firstChild, _el$9 = _el$8.firstChild, _el$0 = _el$9.nextSibling, _el$1 = _el$0.nextSibling, _el$10 = _el$8.nextSibling, _el$11 = _el$10.firstChild, _el$12 = _el$11.firstChild, _el$13 = _el$12.nextSibling, _el$14 = _el$13.nextSibling, _el$15 = _el$11.nextSibling, _el$16 = _el$15.firstChild, _el$17 = _el$16.nextSibling, _el$18 = _el$17.nextSibling, _el$19 = _el$15.nextSibling, _el$20 = _el$19.firstChild, _el$21 = _el$20.nextSibling, _el$22 = _el$21.nextSibling, _el$23 = _el$19.nextSibling, _el$24 = _el$23.firstChild, _el$25 = _el$24.nextSibling, _el$26 = _el$25.nextSibling, _el$27 = _el$23.nextSibling, _el$28 = _el$27.firstChild, _el$29 = _el$28.nextSibling, _el$30 = _el$29.nextSibling, _el$31 = _el$30.firstChild, _el$32 = _el$31.firstChild, _el$33 = _el$32.nextSibling, _el$34 = _el$33.nextSibling, _el$35 = _el$34.nextSibling, _el$36 = _el$35.nextSibling, _el$37 = _el$31.nextSibling, _el$38 = _el$37.firstChild, _el$39 = _el$38.nextSibling, _el$40 = _el$39.nextSibling, _el$41 = _el$40.nextSibling, _el$42 = _el$37.nextSibling, _el$43 = _el$42.firstChild, _el$44 = _el$43.nextSibling, _el$45 = _el$44.nextSibling, _el$46 = _el$45.nextSibling, _el$47 = _el$27.nextSibling, _el$48 = _el$47.firstChild, _el$49 = _el$48.nextSibling, _el$50 = _el$49.firstChild, _el$51 = _el$50.firstChild, _el$52 = _el$51.nextSibling, _el$53 = _el$52.firstChild, _el$54 = _el$53.nextSibling, _el$55 = _el$50.nextSibling, _el$56 = _el$55.firstChild, _el$57 = _el$56.nextSibling, _el$58 = _el$57.firstChild, _el$59 = _el$58.nextSibling, _el$60 = _el$49.nextSibling, _el$61 = _el$60.nextSibling;
    insert(_el$14, () => themeOptions.map((theme) => (() => {
      var _el$62 = _tmpl$6(), _el$63 = _el$62.firstChild, _el$64 = _el$63.nextSibling, _el$65 = _el$64.firstChild, _el$66 = _el$65.nextSibling;
      _el$62.$$click = () => uiStore.setTheme(theme.id);
      insert(_el$63, () => theme.icon);
      insert(_el$65, () => theme.name);
      insert(_el$66, () => theme.desc);
      insert(_el$62, (() => {
        var _c$ = memo(() => currentTheme() === theme.id);
        return () => _c$() && (() => {
          var _el$67 = _tmpl$7();
          createRenderEffect(() => className(_el$67, styles.checkmark));
          return _el$67;
        })();
      })(), null);
      createRenderEffect((_p$) => {
        var _v$56 = `${styles.themeCard} ${currentTheme() === theme.id ? styles.active : ""}`, _v$57 = styles.themeIcon, _v$58 = styles.themeInfo, _v$59 = styles.themeName, _v$60 = styles.themeDesc;
        _v$56 !== _p$.e && className(_el$62, _p$.e = _v$56);
        _v$57 !== _p$.t && className(_el$63, _p$.t = _v$57);
        _v$58 !== _p$.a && className(_el$64, _p$.a = _v$58);
        _v$59 !== _p$.o && className(_el$65, _p$.o = _v$59);
        _v$60 !== _p$.i && className(_el$66, _p$.i = _v$60);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0,
        i: void 0
      });
      return _el$62;
    })()));
    insert(_el$18, () => Object.keys(COLORMAPS).map((id) => (() => {
      var _el$68 = _tmpl$6(), _el$69 = _el$68.firstChild, _el$70 = _el$69.nextSibling, _el$71 = _el$70.firstChild, _el$72 = _el$71.nextSibling;
      _el$68.$$click = () => uiStore.setColorScale(id);
      insert(_el$71, () => COLORMAPS[id].label);
      insert(_el$72, () => COLORMAPS[id].desc);
      insert(_el$68, (() => {
        var _c$2 = memo(() => currentColorScale() === id);
        return () => _c$2() && (() => {
          var _el$73 = _tmpl$7();
          createRenderEffect(() => className(_el$73, styles.checkmark));
          return _el$73;
        })();
      })(), null);
      createRenderEffect((_p$) => {
        var _v$61 = `${styles.colorScaleCard} ${currentColorScale() === id ? styles.active : ""}`, _v$62 = styles.colorScalePreview, _v$63 = getColorScaleGradientCSS(id), _v$64 = styles.colorScaleInfo, _v$65 = styles.colorScaleName, _v$66 = styles.colorScaleDesc;
        _v$61 !== _p$.e && className(_el$68, _p$.e = _v$61);
        _v$62 !== _p$.t && className(_el$69, _p$.t = _v$62);
        _v$63 !== _p$.a && setStyleProperty(_el$69, "background", _p$.a = _v$63);
        _v$64 !== _p$.o && className(_el$70, _p$.o = _v$64);
        _v$65 !== _p$.i && className(_el$71, _p$.i = _v$65);
        _v$66 !== _p$.n && className(_el$72, _p$.n = _v$66);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0,
        i: void 0,
        n: void 0
      });
      return _el$68;
    })()));
    insert(_el$22, () => plotThemeOptions.map((opt) => (() => {
      var _el$74 = _tmpl$6(), _el$75 = _el$74.firstChild, _el$76 = _el$75.nextSibling, _el$77 = _el$76.firstChild, _el$78 = _el$77.nextSibling;
      _el$74.$$click = () => uiStore.setPlotTheme(opt.id);
      insert(_el$75, () => opt.icon);
      insert(_el$77, () => opt.name);
      insert(_el$78, () => opt.desc);
      insert(_el$74, (() => {
        var _c$3 = memo(() => currentPlotTheme() === opt.id);
        return () => _c$3() && (() => {
          var _el$79 = _tmpl$7();
          createRenderEffect(() => className(_el$79, styles.checkmark));
          return _el$79;
        })();
      })(), null);
      createRenderEffect((_p$) => {
        var _v$67 = `${styles.plotThemeCard} ${currentPlotTheme() === opt.id ? styles.active : ""}`, _v$68 = styles.plotThemeIcon, _v$69 = styles.plotThemeInfo, _v$70 = styles.plotThemeName, _v$71 = styles.plotThemeDesc;
        _v$67 !== _p$.e && className(_el$74, _p$.e = _v$67);
        _v$68 !== _p$.t && className(_el$75, _p$.t = _v$68);
        _v$69 !== _p$.a && className(_el$76, _p$.a = _v$69);
        _v$70 !== _p$.o && className(_el$77, _p$.o = _v$70);
        _v$71 !== _p$.i && className(_el$78, _p$.i = _v$71);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0,
        i: void 0
      });
      return _el$74;
    })()));
    insert(_el$26, () => displayOptions.map((opt) => (() => {
      var _el$80 = _tmpl$8(), _el$81 = _el$80.firstChild, _el$82 = _el$81.firstChild, _el$83 = _el$82.nextSibling, _el$84 = _el$83.firstChild, _el$85 = _el$84.nextSibling, _el$86 = _el$83.nextSibling, _el$87 = _el$81.nextSibling;
      insert(_el$84, () => opt.name);
      insert(_el$85, () => opt.value);
      insert(_el$86, () => opt.tag);
      insert(_el$87, () => opt.desc);
      createRenderEffect((_p$) => {
        var _v$72 = styles.prefCard, _v$73 = styles.prefHeader, _v$74 = styles.prefIcon, _v$75 = styles.prefInfo, _v$76 = styles.prefName, _v$77 = styles.prefValue, _v$78 = styles.prefTag, _v$79 = styles.prefDesc;
        _v$72 !== _p$.e && className(_el$80, _p$.e = _v$72);
        _v$73 !== _p$.t && className(_el$81, _p$.t = _v$73);
        _v$74 !== _p$.a && className(_el$82, _p$.a = _v$74);
        _v$75 !== _p$.o && className(_el$83, _p$.o = _v$75);
        _v$76 !== _p$.i && className(_el$84, _p$.i = _v$76);
        _v$77 !== _p$.n && className(_el$85, _p$.n = _v$77);
        _v$78 !== _p$.s && className(_el$86, _p$.s = _v$78);
        _v$79 !== _p$.h && className(_el$87, _p$.h = _v$79);
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
      return _el$80;
    })()));
    insert(_el$61, createComponent(A, {
      href: "/",
      get ["class"]() {
        return styles.link;
      },
      children: "Documentation"
    }), null);
    insert(_el$61, createComponent(A, {
      href: "/",
      get ["class"]() {
        return styles.link;
      },
      children: "GitHub"
    }), null);
    insert(_el$61, createComponent(A, {
      href: "/",
      get ["class"]() {
        return styles.link;
      },
      children: "Report an issue"
    }), null);
    createRenderEffect((_p$) => {
      var _v$ = styles.page, _v$2 = styles.hero, _v$3 = styles.heroIcon, _v$4 = styles.title, _v$5 = styles.tagline, _v$6 = styles.content, _v$7 = styles.section, _v$8 = styles.sectionTitle, _v$9 = styles.sectionCopy, _v$0 = styles.themeGrid, _v$1 = styles.section, _v$10 = styles.sectionTitle, _v$11 = styles.sectionCopy, _v$12 = styles.colorScaleGrid, _v$13 = styles.section, _v$14 = styles.sectionTitle, _v$15 = styles.sectionCopy, _v$16 = styles.plotThemeGrid, _v$17 = styles.section, _v$18 = styles.sectionTitle, _v$19 = styles.sectionCopy, _v$20 = styles.prefsGrid, _v$21 = styles.section, _v$22 = styles.sectionTitle, _v$23 = styles.sectionCopy, _v$24 = styles.shortcutsGrid, _v$25 = styles.shortcutGroup, _v$26 = styles.shortcutGroupTitle, _v$27 = styles.shortcutRow, _v$28 = styles.shortcutRow, _v$29 = styles.shortcutRow, _v$30 = styles.shortcutRow, _v$31 = styles.shortcutGroup, _v$32 = styles.shortcutGroupTitle, _v$33 = styles.shortcutRow, _v$34 = styles.shortcutRow, _v$35 = styles.shortcutRow, _v$36 = styles.shortcutGroup, _v$37 = styles.shortcutGroupTitle, _v$38 = styles.shortcutRow, _v$39 = styles.shortcutRow, _v$40 = styles.shortcutRow, _v$41 = styles.section, _v$42 = styles.sectionTitle, _v$43 = styles.aboutGrid, _v$44 = styles.aboutCard, _v$45 = styles.aboutIcon, _v$46 = styles.aboutInfo, _v$47 = styles.aboutName, _v$48 = styles.aboutVersion, _v$49 = styles.aboutCard, _v$50 = styles.aboutIcon, _v$51 = styles.aboutInfo, _v$52 = styles.aboutName, _v$53 = styles.aboutVersion, _v$54 = styles.aboutDesc, _v$55 = styles.links;
      _v$ !== _p$.e && className(_el$7, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$8, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$9, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$0, _p$.o = _v$4);
      _v$5 !== _p$.i && className(_el$1, _p$.i = _v$5);
      _v$6 !== _p$.n && className(_el$10, _p$.n = _v$6);
      _v$7 !== _p$.s && className(_el$11, _p$.s = _v$7);
      _v$8 !== _p$.h && className(_el$12, _p$.h = _v$8);
      _v$9 !== _p$.r && className(_el$13, _p$.r = _v$9);
      _v$0 !== _p$.d && className(_el$14, _p$.d = _v$0);
      _v$1 !== _p$.l && className(_el$15, _p$.l = _v$1);
      _v$10 !== _p$.u && className(_el$16, _p$.u = _v$10);
      _v$11 !== _p$.c && className(_el$17, _p$.c = _v$11);
      _v$12 !== _p$.w && className(_el$18, _p$.w = _v$12);
      _v$13 !== _p$.m && className(_el$19, _p$.m = _v$13);
      _v$14 !== _p$.f && className(_el$20, _p$.f = _v$14);
      _v$15 !== _p$.y && className(_el$21, _p$.y = _v$15);
      _v$16 !== _p$.g && className(_el$22, _p$.g = _v$16);
      _v$17 !== _p$.p && className(_el$23, _p$.p = _v$17);
      _v$18 !== _p$.b && className(_el$24, _p$.b = _v$18);
      _v$19 !== _p$.T && className(_el$25, _p$.T = _v$19);
      _v$20 !== _p$.A && className(_el$26, _p$.A = _v$20);
      _v$21 !== _p$.O && className(_el$27, _p$.O = _v$21);
      _v$22 !== _p$.I && className(_el$28, _p$.I = _v$22);
      _v$23 !== _p$.S && className(_el$29, _p$.S = _v$23);
      _v$24 !== _p$.W && className(_el$30, _p$.W = _v$24);
      _v$25 !== _p$.C && className(_el$31, _p$.C = _v$25);
      _v$26 !== _p$.B && className(_el$32, _p$.B = _v$26);
      _v$27 !== _p$.v && className(_el$33, _p$.v = _v$27);
      _v$28 !== _p$.k && className(_el$34, _p$.k = _v$28);
      _v$29 !== _p$.x && className(_el$35, _p$.x = _v$29);
      _v$30 !== _p$.j && className(_el$36, _p$.j = _v$30);
      _v$31 !== _p$.q && className(_el$37, _p$.q = _v$31);
      _v$32 !== _p$.z && className(_el$38, _p$.z = _v$32);
      _v$33 !== _p$.P && className(_el$39, _p$.P = _v$33);
      _v$34 !== _p$.H && className(_el$40, _p$.H = _v$34);
      _v$35 !== _p$.F && className(_el$41, _p$.F = _v$35);
      _v$36 !== _p$.M && className(_el$42, _p$.M = _v$36);
      _v$37 !== _p$.D && className(_el$43, _p$.D = _v$37);
      _v$38 !== _p$.R && className(_el$44, _p$.R = _v$38);
      _v$39 !== _p$.E && className(_el$45, _p$.E = _v$39);
      _v$40 !== _p$.L && className(_el$46, _p$.L = _v$40);
      _v$41 !== _p$.N && className(_el$47, _p$.N = _v$41);
      _v$42 !== _p$.G && className(_el$48, _p$.G = _v$42);
      _v$43 !== _p$.U && className(_el$49, _p$.U = _v$43);
      _v$44 !== _p$.K && className(_el$50, _p$.K = _v$44);
      _v$45 !== _p$.V && className(_el$51, _p$.V = _v$45);
      _v$46 !== _p$.Y && className(_el$52, _p$.Y = _v$46);
      _v$47 !== _p$.J && className(_el$53, _p$.J = _v$47);
      _v$48 !== _p$.Q && className(_el$54, _p$.Q = _v$48);
      _v$49 !== _p$.Z && className(_el$55, _p$.Z = _v$49);
      _v$50 !== _p$.X && className(_el$56, _p$.X = _v$50);
      _v$51 !== _p$._ && className(_el$57, _p$._ = _v$51);
      _v$52 !== _p$.$ && className(_el$58, _p$.$ = _v$52);
      _v$53 !== _p$.te && className(_el$59, _p$.te = _v$53);
      _v$54 !== _p$.tt && className(_el$60, _p$.tt = _v$54);
      _v$55 !== _p$.ta && className(_el$61, _p$.ta = _v$55);
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
      ta: void 0
    });
    return _el$7;
  })();
};
delegateEvents(["click"]);

export { SettingsPage as default };
//# sourceMappingURL=SettingsPage.p61Lh12q.js.map
