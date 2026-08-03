# Frontend Architecture

## Source, Build, and Runtime

Editable browser code lives in frontend/src/; frontend/index.html is the Vite
entry document. Production output is generated into
crates/edatime-bin/frontend/dist/ and is deliberately not tracked. Build it
with npm run build:prod; make run builds it before starting the Rust server.

The local ChartGPU fork is the single chartgpu file dependency at
frontend/libs/chartgpu/. Application code imports chartgpu, never its compiled
distribution by relative path.

## Runtime Ownership

- app.ts is the composition root. It creates the application lifetime, wires
  Timeseries, registers page descriptors, and owns cleanup.
- app/shell/ provides the small always-on shell and demand-loads optional
  subsystems such as upload tools, workflow guidance, provenance, commands,
  and settings.
- app/pageModules.ts registers metadata-only page descriptors. Advanced page
  implementations are dynamically imported on first navigation.
- features/<name>/ owns each product capability and its page lifecycle. Keep
  feature internals private behind that feature's index.ts.
- services/api/ is the sole browser transport boundary. It owns fetch,
  response handling, and wire-format decoding.
- contracts/api/v1/ owns shared API path and DTO identities; decoded Arrow
  projections belong in types/api.ts, not in the transport contract.
- workspace/workspaceStore.ts owns cross-feature dataset identity, selection,
  filters, and viewport intent. Use selector subscriptions for a specific
  slice and getSnapshot() only when a defensive full copy is required.
- store/ holds local renderer and UI state. Do not mirror persisted workspace
  fields into a focused store.
- chart/ and charts/ own chart adapters and registration. Feature controllers
  own individual adapter instances and dispose them on unmount.

## Page and CSS Loading

The shell keeps navigation and initial layout eagerly available. Heavy pages
are feature-loaded from descriptors, and page styles are requested through
utils/pageStyles.ts before the page initializes. The cleaning workbench is
loaded only when its trigger is first used.

When adding a page:

1. Add a descriptor in app/pageModules.ts with the minimal dependency contract
   and any page-owned style modules.
2. Put DOM event binding and request/controller lifetime in the feature.
3. Return a disposer that removes listeners, subscriptions, and renderer
   resources.
4. Keep server calls in services/api/ and add the canonical route to
   contracts/api/v1/routes.ts.

## Extension Rules

- Do not add compatibility shims, legacy import barrels, or module-global
  mutable controller state.
- Prefer an instance factory or mount function for feature-local runtime state.
- Keep pure data transformations DOM-free and test them without network mocks.
- Use npm run check:frontend:all to enforce type, architecture, reachability,
  size, and asset-graph checks.
- Use npm run bench:app:artifacts for bundle measurements and npm run
  bench:workspace for workspace publication measurements.
