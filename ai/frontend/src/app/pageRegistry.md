# frontend/src/app/pageRegistry.ts
> Centralized page registration and lazy-loading with metadata readiness gating. Pages declaring `requiresMetadata: true` block their init until metadata is marked ready. Page-init failures are logged and re-thrown so the next navigation can retry.

## Module-Level State

```typescript
const loaded: Set<string>
const pages: Map<string, { requiresMetadata: boolean; init: () => Promise<void> }>
let metadataReady: boolean
let releaseMetadata: (() => void) | null
const metadataPromise: Promise<void>
```

## Functions

### register
- `register(name: string, page: { requiresMetadata: boolean; init: () => Promise<void> }): void`
  - Registers a page module. If `requiresMetadata` is true, `ensurePageModuleLoaded` will wait for `markMetadataReady()` before calling `page.init()`.

### ensurePageModuleLoaded
- `ensurePageModuleLoaded(name: string): Promise<void>`
  - Loads and initializes a page module once. Idempotent (checks `loaded` set first). On `page.init()` rejection, logs `[EdaTime] Failed to initialize page "${name}":` and rethrows so callers can show a friendly error; the page is NOT marked as loaded so the next navigation retries.

### markMetadataReady
- `markMetadataReady(): void`
  - Sets `metadataReady = true` and resolves the metadata promise, unblocking all pending page initializations.

### isMetadataReady
- `isMetadataReady(): boolean`
  - Returns current metadata readiness state.

### clearLoadedPageModules
- `clearLoadedPageModules(): void`
  - Clears the loaded set to allow re-initialization on revisit.

### createPageRegistry
- `createPageRegistry(): { register, ensurePageModuleLoaded, markMetadataReady, isMetadataReady, clearLoadedPageModules }`
  - Factory for isolated registry instances used in tests. The instance-scoped `ensurePageModuleLoaded` mirrors the module-level one: it logs page-init failures and rethrows.
