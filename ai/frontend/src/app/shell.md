# ai/frontend/src/app/shell.md
> Composes the shared app shell by delegating to `core` (eager init) and `deferredSubsystems` (lazy registry). Exposes `window.__edatime.ensureSubsystem(name)` for cross-module lazy loading.

## Interface: RefreshDatasetOptions
- `selectedColumn?: string`

## Interface: AppShellDeps
- `ensurePageModuleLoaded: (page: string) => Promise<void>`
- `showPage: (pageName: string) => void`
- `fetchAndRender: () => void`
- `renderCurrentData: () => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `buildTimeseriesColumns: () => void`
- `buildTimeseriesRanges: () => void`
- `zoomOut: () => void`
- `resetZoom: () => void`
- `refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>`
- `registerCleanup: (cleanup: () => void) => void`

## Functions

### initAppShell
- `initAppShell(deps: AppShellDeps): void` [deps: [initShellCore][1], [ensureUploadSubsystems/ensureHomeSubsystems/...][2]]
  - Calls `initShellCore({ showPage })` for eager init. Installs `window.__edatime.ensurePageModuleLoaded` and `window.__edatime.ensureSubsystem` as global bridges for cross-module lazy loading. The `ensureSubsystem` switch handles `'upload'`, `'home'`, `'timeseries-shell'`, `'settings'`, and `'commands'` (each maps to the matching helper in [deferredSubsystems][2]) and throws `Unknown deferred subsystem: ${name}` for anything else.

## Layout
- `app.ts` calls `initAppShell` once at startup.
- The `core` module handles form-control accessibility, page routing, settings, theme, accessibility shortcuts, and home navigation cards.
- The `deferredSubsystems` module exposes `ensureSubsystem(name)` (via the global bridge) plus named helpers like `ensureUploadSubsystems`, `ensureTimeseriesShell`, `ensureSettingsPanel`, `ensureCommands`, `ensureHomeSubsystems`, `ensureAll`.
- `globalShortcuts` and the command palette's `Ctrl+K` / `Ctrl+,` handlers call `ensureSubsystem` on demand (after a small `waitForEdatimeKey` race-guard).

---
[1]: ./shell/core.md
[2]: ./shell/deferredSubsystems.md
[3]: ./bootstrap/globalShortcuts.md
