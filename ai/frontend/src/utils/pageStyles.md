# ai/frontend/src/utils/pageStyles.md

> Dynamic CSS module loader for per-page stylesheets (drift, home).

## Constants
- `STYLE_MODULES: Record<StyleModuleName, string>` — maps page names to stylesheet URLs.

## Types
```typescript
type StyleModuleName = 'drift' | 'home';
```

## Functions
- `pageStyleModulesFor(pageName: string): StyleModuleName[]`
  - Returns the list of style module names required for a given page.
- `ensureStyleModule(name: StyleModuleName): HTMLLinkElement | null`
  - Ensures a stylesheet link is present in `<head>`, deduplicating if already loaded.
- `preloadPageStyles(pageName: string): void`
  - Preloads all style modules for a page by calling `ensureStyleModule` for each.