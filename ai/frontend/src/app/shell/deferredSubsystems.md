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
- `'upload-panel'`
- `'column-profiles'`
- `'analytics-overlay'`
- `'analytics-listeners'`
- `'annotation-subsystems'`
- `'guided-workflow'`
- `'workflow-modals'`
- `'provenance'`
- `'settings-panel'`
- `'analysis-controls'`
- `'command-palette'`
- `'sample-datasets'`
- `'home-top-correlations'`
- `'app-commands'`

## Functions
- `ensureUploadSubsystems(deps: DeferredShellDeps): Promise<void>`
- `ensureTimeseriesShell(deps: DeferredShellDeps): Promise<void>`
- `ensureSettingsPanel(deps: DeferredShellDeps): Promise<void>`
- `ensureCommands(deps: DeferredShellDeps): Promise<void>`
- `ensureHomeSubsystems(deps: DeferredShellDeps): Promise<void>`
  - Loads both `'sample-datasets'` and `'home-top-correlations'` for the home page.
- `ensureAll(deps: DeferredShellDeps): Promise<void>`
- `_resetDeferredSubsystems(): void`
