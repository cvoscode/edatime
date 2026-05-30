# frontend/src/app/pageLifecycle.ts
> Shared page lifecycle wiring — replaces repeated init patterns with a declarative manager supporting `always-react` and `visible-only` activation modes.

## Interface: PageLifecycleOptions
```typescript
interface PageLifecycleOptions {
    page: string;                                              // matched against edatime:page-change detail.page
    init(): (() => void) | void;                              // called once on first trigger; may return cleanup
    onEveryPageChange?: () => void;                            // fires on every page change, even before init
    onVisible?: () => void;                                    // fires only when registered page becomes active
}
```

## Function: createPageLifecycle
- `createPageLifecycle(options: PageLifecycleOptions): () => void`
  - Registers a `edatime:page-change` event listener.
  - Returns unregister cleanup function.

## Function: createPageRegistry (test helper)
- `createPageRegistry(): PageRegistryInstance`
  - Creates isolated registry instance for testing.

### PageRegistryInstance
- `register(name: string, page: { requiresMetadata: boolean; init: () => Promise<void> }): void`
- `ensurePageModuleLoaded(name: string): Promise<void>`
- `markMetadataReady(): void`
- `isMetadataReady(): boolean`
- `clearLoadedPageModules(): void`

---
[1]: ./shell.md