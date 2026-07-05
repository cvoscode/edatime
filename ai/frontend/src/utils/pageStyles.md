# ai/frontend/src/utils/pageStyles.md
> Dynamic CSS module loader for page-owned stylesheets. `pageStyleModulesFor` maps page names to CSS modules, and `ensureStyleModule` injects a single `<link data-edatime-style>` per module.

## Types
- `StyleModuleName = 'drift' | 'home' | 'scatter'`
- `PageName = keyof typeof PAGE_STYLE_MODULES`

## Constants
- `PAGE_STYLE_MODULES` (readonly) — `as const satisfies Record<string, readonly StyleModuleName[]>`; maps `correlations → ['scatter']`, `drift → ['drift']`, `home → ['home']`, `heatmap → ['scatter']`, `scatter → ['scatter']`, `scattermatrix → ['scatter']`.
- `STYLE_HREFS: Record<string, string>` — eager `import.meta.glob('../../css/modules/*.css', { query: '?url' })` URL map.

## Functions
- `pageStyleModulesFor(pageName: string): readonly StyleModuleName[]`
  - Returns the list of style modules required for a page (uses `as PageName` cast).
- `ensureStyleModule(name: StyleModuleName): HTMLLinkElement | null`
  - Returns the existing `<link>` if present, otherwise appends a stylesheet link for the resolved module URL.
- `preloadPageStyles(pageName: string): void`
  - Preloads every style module mapped to `pageName`.
