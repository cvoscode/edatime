# frontend/src/app/pageRegistry.md
> Centralized page registration and lazy-loading with metadata readiness tracking.

## Functions

### register
- `register(name: string, page: { requiresMetadata: boolean; init: () => Promise<void> }): void`
  - Registers a page module with its initialization requirements.

### ensurePageModuleLoaded
- `ensurePageModuleLoaded(name: string): Promise<void>`
  - Loads and initializes a page module (once). Waits for metadata if required.

### markMetadataReady
- `markMetadataReady(): void`
  - Marks metadata as ready, unblocking gated page initializations.

### isMetadataReady
- `isMetadataReady(): boolean`
  - Returns true if metadata has been marked ready.

### clearLoadedPageModules
- `clearLoadedPageModules(): void`
  - Clears the loaded page cache for re-initialization on next visit.

### createPageRegistry
- `createPageRegistry(): { register, ensurePageModuleLoaded, markMetadataReady, isMetadataReady, clearLoadedPageModules }`
  - Creates an isolated page registry instance for testing.