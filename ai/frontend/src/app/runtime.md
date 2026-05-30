# frontend/src/app/runtime.ts
> Manages application lifecycle with cleanup registration and disposal.

## Function: createAppRuntime
- `createAppRuntime(): { registerCleanup, dispose }`
  - Creates runtime with cleanup tracking and disposal.

### Methods on returned object

#### registerCleanup
- `registerCleanup(fn: () => void): () => void`
  - Registers a cleanup function to run on disposal. Returns unsubscribe function (removes from cleanups set).

#### dispose
- `dispose(): void`
  - Marks runtime as disposed and runs all registered cleanups. Idempotent — safe to call multiple times.