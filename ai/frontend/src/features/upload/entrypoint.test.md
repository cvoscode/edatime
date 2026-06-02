# ai/frontend/src/features/upload/entrypoint.test.md
> Tests `createUploadEntrypoint` idempotence and dependency handoff to `initUploadPanel`.

## Tests
- **explicit init surface**
  - Verifies the entrypoint returns an `init` function.
- **no eager init**
  - Verifies `initUploadPanel` is not called before `init()`.
- **dependency handoff**
  - Verifies `init()` passes profile callbacks and upload deps through to `initUploadPanel`.
- **single init**
  - Verifies repeated `init()` calls only invoke `initUploadPanel` once.
