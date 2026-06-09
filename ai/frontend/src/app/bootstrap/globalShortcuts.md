# ai/frontend/src/app/bootstrap/globalShortcuts.md
> Global keyboard shortcuts that are always active. Extracted from app.ts to keep the orchestrator slim. Lazy-loads the commands and settings subsystems on demand when the user invokes `Ctrl+K` or `Ctrl+,`. Defends against a startup race where `initGlobalShortcuts` may be wired up before `initAppShell` populates `window.__edatime.ensureSubsystem`.

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

### isTypingTarget
- `isTypingTarget(target: EventTarget | null): boolean`
  - Returns true if the event target is an input, textarea, select, or contenteditable element.

### currentPageName
- `currentPageName(): string`
  - Returns `data-page-name` of the currently visible non-hidden `.page` element. Defaults to `'upload'`.

### waitForEdatimeKey
- `waitForEdatimeKey<K extends string>(key: K, options?: { timeoutMs?: number }): Promise<void>`
  - Polls `window.__edatime` every 10ms (default timeout 250ms) until `key in window.__edatime` is true. Used before invoking `ensureSubsystem` from a `Ctrl+K` / `Ctrl+,` handler to handle the case where the shell bridge has not been populated yet. Resolves silently on timeout so the listener still works if the bridge never appears.

### matchesShortcut
- `matchesShortcut(key: string, options: { alt?: boolean; shift?: boolean }, def: CommandDefinition['keyboard'], pageName: string): boolean`
  - Returns true if the key combination matches a command definition for the current page. Alt and shift are normalized via `Boolean()`.

### initGlobalShortcuts
- `initGlobalShortcuts(deps: GlobalShortcutsDeps, commandDefs: ReadonlyArray<CommandDefinition>): void`
  - Idempotent (guarded by `__edatime.globalShortcutsBound`). Wires Alt+[0-9] navigation shortcuts and Shift-only timeseries shortcuts from the command definitions, plus `Ctrl+K` (commands → `ensureSubsystem('commands')` + `openPalette`) and `Ctrl+,` (settings → `ensureSubsystem('settings')` + `openSettingsModal`). The async handlers call `waitForEdatimeKey('ensureSubsystem')` first. Registers cleanup on `deps.registerCleanup` to detach the `keydown` listener.

---
[1]: ../shell/core.md
[2]: ../../bootstrap/commands.md#commanddefinition
