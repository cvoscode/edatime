# ai/frontend/src/app/shell/deferredSubsystems.md
> Lazy subsystem registry. Each subsystem declares its own dynamic import chain and is loaded on first call to `window.__edatime.ensureSubsystem(name)`. The shell's `core` module mounts this registry and exposes the global bridge. All subsystem initializers are async, so the chunk for the actual module is only fetched on first use.

## Interface: DeferredShellDeps
- `showPage: (pageName: string) => void`
- `ensurePageModuleLoaded: (page: string) => Promise<void>`
- `fetchAndRender: () => void`
- `refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>`
- `buildTimeseriesColumns: () => void`
- `buildTimeseriesRanges: () => void`
- `zoomOut: () => void`
- `resetZoom: () => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `registerCleanup: (cleanup: () => void) => void`

## Interface: RefreshDatasetOptions
- `selectedColumn?: string`

## Subsystems (registered lazily, each `async (deps) => void | Promise<void>`)
- `'upload-panel'` — dynamic-imports `ui/profile` and `ui/upload`; wires `initUploadPanel` with build/range refresh hooks.
- `'column-profiles'` — dynamic-imports `ui/profile`; calls `initColumnProfilesGrid`.
- `'analytics-overlay'` — dynamic-imports `ui/analyticsDrawer`; calls `initAnalyticsDrawer`.
- `'analytics-listeners'` — dynamic-imports `bootstrap/analyticsOverlay`; calls `initAnalyticsListeners` with a closure that proxies to `window.__edatime.runAnalytics?.()`.
- `'annotation-subsystems'` — dynamic-imports `chart/annotations` and `ui/annotationPanel`; calls `initAnnotations` and `initAnnotationPanel`.
- `'guided-workflow'` — dynamic-imports `ui/guidedWorkflow`; calls `initGuidedWorkflow`.
- `'workflow-modals'` — dynamic-imports `ui/dataMutationModals`; calls `initTransformModal` and `initOutlierModal` with `refreshDataset: deps.refreshDatasetAfterMutation`.
- `'provenance'` — dynamic-imports `utils/provenance`; calls `initProvenance`.
- `'settings-panel'` — dynamic-imports `ui/settingsPanel`; calls `initSettingsPanel` and stashes `openSettingsModal` on `window.__edatime`.
- `'analysis-controls'` — dynamic-imports `ui/toolbar`; calls `initAnalysisControls(deps.fetchAndRender)` and `initChartPageFilterGesture`.
- `'command-palette'` — dynamic-imports `utils/palette`; calls `initCommandPalette` and stashes `openPalette` on `window.__edatime`.
- `'sample-datasets'` — dynamic-imports `./sampleDatasets`; calls `wireSampleDatasetCards` with `showPage` and a refresh callback.
- `'app-commands'` — dynamic-imports `bootstrap/commands`; awaits `registerAppCommands({ showPage, zoomOut, resetZoom })`.

## Functions

### registerSubsystem
- `registerSubsystem(name: string, init: (deps: DeferredShellDeps) => void | Promise<void>): void`
  - Internal helper that registers a subsystem name and async initializer.

### ensureSubsystem
- `ensureSubsystem(name: string, deps: DeferredShellDeps): Promise<void>`
  - Loads a subsystem by name. Idempotent: subsequent calls return the same in-flight promise. Throws `Unknown deferred subsystem: ${name}` for unknown names.

### ensureUploadSubsystems
- `ensureUploadSubsystems(deps: DeferredShellDeps): Promise<void>`
  - Ensures `upload-panel` and `column-profiles` are loaded.

### ensureTimeseriesShell
- `ensureTimeseriesShell(deps: DeferredShellDeps): Promise<void>`
  - Ensures `analysis-controls`, `analytics-overlay`, `analytics-listeners`, `annotation-subsystems`, `guided-workflow`, `workflow-modals`, and `provenance` are loaded.

### ensureSettingsPanel
- `ensureSettingsPanel(deps: DeferredShellDeps): Promise<void>`
  - Ensures `settings-panel` is loaded.

### ensureCommands
- `ensureCommands(deps: DeferredShellDeps): Promise<void>`
  - Ensures `command-palette` and `app-commands` are loaded.

### ensureHomeSubsystems
- `ensureHomeSubsystems(deps: DeferredShellDeps): Promise<void>`
  - Ensures `sample-datasets` is loaded.

### ensureAll
- `ensureAll(deps: DeferredShellDeps): Promise<void>`
  - Convenience that runs every page-ensure helper in order: home, upload, timeseries, settings, commands.

### _resetDeferredSubsystems
- `_resetDeferredSubsystems(): void`
  - Test-only: clears `loaded` and `pending` for every entry in the registry.

---
[1]: ./core.md
[2]: ../../bootstrap/commands.md#registerAppCommands
[3]: ../../ui/upload.md#initUploadPanel
[4]: ../../ui/profile.md#initColumnProfilesGrid
[5]: ../../ui/analyticsDrawer.md#initAnalyticsDrawer
[6]: ../../ui/annotationPanel.md#initAnnotationPanel
[7]: ../../ui/dataMutationModals.md
[8]: ../../ui/settingsPanel.md#initSettingsPanel
[9]: ../../ui/toolbar.md#initAnalysisControls
[10]: ../../utils/palette.md#initCommandPalette
[11]: ./sampleDatasets.md#wireSampleDatasetCards
[12]: ../../utils/provenance.md#initProvenance
