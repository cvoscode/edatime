# frontend/src/app/runtime.test.md
> Tests for application runtime lifecycle management.

## Test Suite: app runtime

### it runs registered cleanups once when disposed
- `createAppRuntime(): { registerCleanup, dispose }`
  - Verifies cleanup is called exactly once even with double disposal.

## Test Suite: page registry

### it waits for metadata readiness before initializing a gated page
- `createPageRegistry(): { register, ensurePageModuleLoaded, markMetadataReady, ... }`
  - Verifies page init is deferred until markMetadataReady is called.