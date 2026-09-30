# ai/frontend/src/app/shell/deferredSubsystems.md
> Lazy subsystem registry. Each subsystem declares its own dynamic import chain and is loaded on first call to `window.__edatime.ensureSubsystem(name)`.

## Interface `RefreshDatasetOptions`
- `selectedColumn?: string`

## Interface `DeferredShellDeps`
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

## Subsystems
- `'upload-panel'` — also wires the page-level Upload `?` help button via `initUploadHelp`.
- `'column-profiles'`
- `'analytics-overlay'`
- `'analytics-listeners'`
- `'annotation-subsystems'`
- `'guided-workflow'`
- `'workflow-modals'`
- `'provenance'`
- `'settings-panel'`
- `'analysis-controls'` — also wires the page-level Timeseries `?` help button via `initTimeseriesHelp`.
- `'command-palette'`
- `'sample-datasets'`
- `'page-help'` — wires the Home `?` help button via `initHomePage`; other pages opt in by adding a `<pageId>-help-btn` trigger and importing `initPageHelp` from their own page module.
- `'app-commands'`

## Functions
- `ensureUploadSubsystems(deps: DeferredShellDeps): Promise<void>`
  - Awaits `'upload-panel'` (which also wires the Upload `?` help button) and `'column-profiles'`.
- `ensureTimeseriesShell(deps: DeferredShellDeps): Promise<void>`
- `ensureSettingsPanel(deps: DeferredShellDeps): Promise<void>`
- `ensureCommands(deps: DeferredShellDeps): Promise<void>`
- `ensureHomeSubsystems(deps: DeferredShellDeps): Promise<void>`
  - Loads `'sample-datasets'` and `'page-help'` for the home page.
- `ensureAll(deps: DeferredShellDeps): Promise<void>`
- `_resetDeferredSubsystems(): void`

---
[1]: ../../pages/uploadPage.md
[2]: ../../pages/timeseriesHelp.md
[3]: ../../pages/homePage.md
[4]: ../ui/pageHelp.md
