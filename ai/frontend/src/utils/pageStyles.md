# ai/frontend/src/utils/pageStyles.md
> Dynamic CSS module loader for page-owned stylesheets. `pageStyleModulesFor` maps page names to CSS modules, and `ensureStyleModule` injects a single `<link data-edatime-style>` per module.

## Types
- `StyleModuleName = 'drift' | 'home' | 'scatter'`

## Constants
- `PAGE_STYLE_MODULES: Record<string, StyleModuleName[]>` - maps `drift`, `home`, `scatter`, and `scattermatrix` to page-owned style modules.
- `STYLE_HREFS: Record<string, string>` - eager `import.meta.glob('../../css/modules/*.css', { query: '?url' })` URL map.

## Functions
- `pageStyleModulesFor(pageName: string): StyleModuleName[]`
  - Returns the list of style modules required for a page.
- `ensureStyleModule(name: StyleModuleName): HTMLLinkElement | null`
  - Returns the existing `<link>` if present, otherwise appends a stylesheet link for the resolved module URL.
- `preloadPageStyles(pageName: string): void`
  - Preloads every style module mapped to `pageName`.
