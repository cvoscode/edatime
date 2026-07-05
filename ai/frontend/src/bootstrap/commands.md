# frontend/src/bootstrap/commands.md
> Command palette definitions for navigation, chart, export, session, and analysis commands. Session actions now lazy-import `utils/session` when invoked.

## Interface: CommandDeps
```typescript
interface CommandDeps {
    showPage: (pageName: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
}
```

## Interface: CommandDefinition
```typescript
interface CommandDefinition {
    id: string;
    label: string;
    shortcut?: string;
    category: PaletteCommand['category'];
    action: (deps: CommandDeps) => void | Promise<void>;
    keyboard?: { key: string; alt?: boolean; shift?: boolean; page?: string };
}
```

## Constants

### APP_COMMAND_DEFINITIONS
- `APP_COMMAND_DEFINITIONS: ReadonlyArray<CommandDefinition>`
  - All command definitions including:
    - Navigation (Alt+1-9,0) → showPage, including `Alt+7` for `correlations`
    - Chart controls (Shift+R/Z/C) → resetZoom, zoomOut, triggerAdaptiveFilterClear
    - Exports (CSV/JSON/PNG/Parquet) → window.__edatime.exportChartFilteredData, chart.exportPNG, `#export-data-parquet-btn` click
    - Session (save/load) → async helpers `exportSession()` / `importSession()` dynamically import `../utils/session.js` before calling `exportSessionToFile` / `importSessionFromFile`
    - Analysis: provenance, command palette, settings (each triggers `ensureSubsystem(...)` via `window.__edatime.ensureSubsystem`)
    - Workflow: `enableGuidedWorkflow`, `disableGuidedWorkflow`, `goToNextGuidedStep` (each ensures the timeseries-shell subsystem and dynamically imports `'../ui/guidedWorkflow.js'`)

## Functions

### exportChartFilteredData
- `exportChartFilteredData(format: 'csv' | 'json'): void`
  - Triggers chart data export via `window.__edatime.exportChartFilteredData`.

### triggerAdaptiveFilterClear
- `triggerAdaptiveFilterClear(): void`
  - Clicks the `#adaptive-clear-btn` element.

### ensureSubsystem
- `ensureSubsystem(name: string): Promise<void>`
  - Internal helper. Delegates to `window.__edatime.ensureSubsystem` for cross-module lazy loading.

### exportSession
- `exportSession(): Promise<void>`
  - Dynamically imports `../utils/session.js` and calls `exportSessionToFile()`.

### importSession
- `importSession(): Promise<void>`
  - Dynamically imports `../utils/session.js` and calls `importSessionFromFile()`.

### buildPaletteCommands
- `buildPaletteCommands(deps: CommandDeps): PaletteCommand[]`
  - Maps `APP_COMMAND_DEFINITIONS` to `PaletteCommand` shape for the palette registry. Wraps each `definition.action(deps)` in a thunk that returns `void | Promise<void>`.

### registerAppCommands
- `registerAppCommands(deps: CommandDeps): Promise<void>`
  - Async. Dynamically imports `'../utils/palette.js'`, calls `registerCommands(buildPaletteCommands(deps))`.

---
[1]: ../utils/palette.md
