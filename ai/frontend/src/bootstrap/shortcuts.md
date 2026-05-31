# frontend/src/bootstrap/shortcuts.ts
> Keyboard shortcut binding — wires keydown events to command palette shortcuts and page-specific actions.

## Interface: ShortcutDefinition
```typescript
interface ShortcutDefinition {
    key: string;
    alt?: boolean;
    shift?: boolean;
    page?: string;
    action: () => void;
}
```

## Interface: ShortcutDeps
```typescript
interface ShortcutDeps {
    showPage: (pageName: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
    registerCleanup: (cleanup: () => void) => void;
}
```

## Module-Level State

```typescript
let _bound: boolean
const KEYBOARD_ONLY_SHORTCUTS: ReadonlyArray<ShortcutDefinition>
```

## Functions

### triggerActivePageCsvExport
- `triggerActivePageCsvExport(): void`
  - Triggers CSV export for the active page (scatter or main chart).

### isTypingTarget
- `isTypingTarget(target: EventTarget | null): boolean`
  - Returns `true` if the event target is an editable element (`input`, `textarea`, `select`, or `contentEditable`).

### currentPageName
- `currentPageName(): string`
  - Returns the `data-page-name` of the currently visible non-hidden `.page` element, defaulting to `'upload'`.

### matchesKeyboardShortcut
- `matchesKeyboardShortcut(shortcut: Pick<ShortcutDefinition, 'key' | 'alt' | 'shift' | 'page'>, key: string, pageName: string, options: Pick<ShortcutDefinition, 'alt' | 'shift'>): boolean`
  - Checks if a key event matches a shortcut definition.

### findMatchingShortcut
- `findMatchingShortcut(key: string, pageName: string, options: Pick<ShortcutDefinition, 'alt' | 'shift'>, commandDefs: ReadonlyArray<CommandDefinition>, deps: ShortcutDeps): ShortcutDefinition | undefined`
  - Finds the first matching command or keyboard-only shortcut for a key event.

### initKeyboardShortcuts
- `initKeyboardShortcuts(deps: ShortcutDeps, commandDefs: ReadonlyArray<CommandDefinition>): void`
  - Attaches the keydown listener once (`_bound` guard). Wires Alt+num navigation and Shift+R/Z shortcuts.

### __resetKeyboardShortcutsForTest
- `__resetKeyboardShortcutsForTest(): void`
  - Resets the `_bound` flag for test isolation.

---
[1]: ./commands.md
