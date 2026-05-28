# pageStyles.ts

Page styling utilities for dynamic CSS module loading.

## Types

```typescript
type StyleModuleName = 'drift' | 'home'
```

## Functions

```typescript
function pageStyleModulesFor(pageName: string): StyleModuleName[]
```

Get style module names required for a page.

```typescript
function ensureStyleModule(name: StyleModuleName): HTMLLinkElement | null
```

Ensure a style module is loaded in the document head.

```typescript
function preloadPageStyles(pageName: string): void
```

Preload page styles for a given page name.