# ai/frontend/src/app/bootstrap/globalShortcuts.md
> Global keyboard shortcuts that are always active. Handles top-level navigation and palette/settings access without importing the full command registry into `app.ts`.

## Interface: GlobalShortcutsDeps
- `showPage: (page: string) => void`
- `registerCleanup: (cleanup: () => void) => void`

## Functions

### isTypingTarget
- `isTypingTarget(target: EventTarget | null): boolean`
  - Returns true if the event target is an input, textarea, select, or contenteditable element.

### waitForEdatimeKey
- `waitForEdatimeKey<K extends string>(key: K, options?: { timeoutMs?: number }): Promise<void>`
  - Polls `window.__edatime` every 10ms (default timeout 250ms) until the bridge key appears.

### initGlobalShortcuts
- `initGlobalShortcuts(deps: GlobalShortcutsDeps): void`
  - Idempotent (guarded by `__edatime.globalShortcutsBound`). Wires `Alt+1/2/3/4/6/7/8/9/0` page navigation, plus `Ctrl+K` (`ensureSubsystem('commands')` + `openPalette`) and `Ctrl+,` (`ensureSubsystem('settings')` + `openSettingsModal`). Registers cleanup on `deps.registerCleanup` to detach the `keydown` listener.

---
[1]: ../shell/core.md
