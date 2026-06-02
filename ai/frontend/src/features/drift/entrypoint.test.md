# ai/frontend/src/features/drift/entrypoint.test.md
> Tests `createDriftEntrypoint` for explicit init ownership, idempotence, and metadata handoff.

## Tests
- **explicit init surface**
  - Verifies the entrypoint returns an `init` function.
- **no eager page init**
  - Verifies drift page init is not called before `init()`.
- **single init**
  - Verifies repeated `init()` calls only initialize the drift page once.
- **metadata handoff**
  - Verifies `init()` calls `initDriftPage` with `getMetadata()`.
