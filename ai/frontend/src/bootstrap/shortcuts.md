# ai/frontend/src/bootstrap/shortcuts.md
> Keyboard shortcut registration and handling — maps key events to app commands.

## Functions
- `findMatchingShortcut(key: string, pageName: string, options: Pick<ShortcutDefinition, 'alt' | 'shift'>, commandDefs: ReadonlyArray<CommandDefinition>, deps: ShortcutDeps): ShortcutDefinition | undefined`
  - Find a matching shortcut definition for a given key, page, and modifier combination.
- `initKeyboardShortcuts(deps: ShortcutDeps, commandDefs: ReadonlyArray<CommandDefinition>): void`
  - Register global keyboard event listener for Alt+key and Shift+key shortcuts.
- `__resetKeyboardShortcutsForTest(): void`
  - Reset bound state for testing purposes.

## Interfaces
- `ShortcutDefinition`
  - `key: string`
  - `alt?: boolean`
  - `shift?: boolean`
  - `page?: string`
  - `action: () => void`

- `ShortcutDeps`
  - `showPage: (pageName: string) => void`
  - `zoomOut: () => void`
  - `resetZoom: () => void`
  - `registerCleanup: (cleanup: () => void) => void`
