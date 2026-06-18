# ai/frontend/src/app/shell/deferredSubsystems.md
> Lazy subsystem registry. Each subsystem declares its own dynamic import chain and is loaded on first call to `window.__edatime.ensureSubsystem(name)`.

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

## Subsystems
- `'upload-panel'` - lazy-imports `ui/profile` and `ui/upload`.
- `'column-profiles'` - lazy-imports `ui/profile`.
- `'analytics-overlay'` - lazy-imports `ui/analyticsDrawer`.
- `'analytics-listeners'` - lazy-imports `bootstrap/analyticsOverlay`.
- `'annotation-subsystems'` - lazy-imports `chart/annotations` and `ui/annotationPanel`.
- `'guided-workflow'` - lazy-imports `ui/guidedWorkflow`.
- `'workflow-modals'` - lazy-imports `ui/dataMutationModals`.
- `'provenance'` - lazy-imports `utils/provenance`.
- `'settings-panel'` - lazy-imports `ui/settingsPanel`.
- `'analysis-controls'` - lazy-imports `ui/toolbar`.
- `'command-palette'` - lazy-imports `utils/palette`.
- `'sample-datasets'` - lazy-imports `./sampleDatasets`.
- `'app-commands'` - lazy-imports `bootstrap/commands` and registers the command palette definitions after the palette subsystem is ready.

## Functions

## Functions
- `registerSubsystem(name: string, init: (deps: DeferredShellDeps) => void | Promise<void>): void`
- `ensureSubsystem(name: string, deps: DeferredShellDeps): Promise<void>`
- `ensureUploadSubsystems(deps: DeferredShellDeps): Promise<void>`
- `ensureTimeseriesShell(deps: DeferredShellDeps): Promise<void>`
- `ensureSettingsPanel(deps: DeferredShellDeps): Promise<void>`
- `ensureCommands(deps: DeferredShellDeps): Promise<void>`
- `ensureHomeSubsystems(deps: DeferredShellDeps): Promise<void>`
- `ensureAll(deps: DeferredShellDeps): Promise<void>`
- `_resetDeferredSubsystems(): void`

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
