# router.ts

URL hash routing for EdaTime pages. Maps `#page=timeseries` to sidebar navigation with browser back/forward and deep-link support.

## Functions

```typescript
function getHashPage(): string | null
```

Read the current page from the URL hash.

```typescript
function resolvePageAlias(page: string): string
```

Resolve a page name applying any aliases.

```typescript
function initHashRouting(): void
```

Bind hash routing to the page navigation system.