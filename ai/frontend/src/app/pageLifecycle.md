# frontend/src/app/pageLifecycle.ts
> Shared page lifecycle wiring — replaces repeated init patterns.

## Interface: PageLifecycleOptions
```typescript
interface PageLifecycleOptions {
    page: string;
    init(): (() => void) | void;
    onEveryPageChange?: () => void;
    onVisible?: () => void;
}
```

## Function: createPageLifecycle
- `createPageLifecycle(options: PageLifecycleOptions): () => void`
  - Registers page lifecycle with event listener on `edatime:page-change`.
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