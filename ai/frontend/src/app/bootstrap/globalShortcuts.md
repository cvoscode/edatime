# ai/frontend/src/app/bootstrap/globalShortcuts.md
> Global keyboard shortcuts that are always active. Extracted from app.ts to keep the orchestrator slim.

## Interface: GlobalShortcutsDeps
```ts
interface GlobalShortcutsDeps {
    showPage: (page: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
    registerCleanup: (cleanup: () => void) => void;
    chartExportPng: () => void;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
}
```

## Functions
- `isTypingTarget(target: EventTarget | null): boolean`
  - Returns true if the event target is an input, textarea, select, or contenteditable element.
- `currentPageName(): string`
  - Returns `data-page-name` of the currently visible non-hidden `.page` element.
- `matchesShortcut(key: string, options: { alt?: boolean; shift?: boolean }, def: CommandDefinition['keyboard'], pageName: string): boolean`
  - Returns true if the key combination matches a command definition for the current page.
- `initGlobalShortcuts(deps: GlobalShortcutsDeps, commandDefs: ReadonlyArray<CommandDefinition>): void`
  - Wires Alt+[0-9] navigation shortcuts and Shift-only timeseries shortcuts; registers cleanup on `deps.registerCleanup`.