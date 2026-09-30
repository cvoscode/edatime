# ai/frontend/src/utils/palette.md

> Command palette (Ctrl+K) providing fuzzy-searchable access to pages, shortcuts, and actions.

## Interface: PaletteCommand
```typescript
interface PaletteCommand {
    id: string;
    label: string;
    hint?: string;
    shortcut?: string;
    category: 'Navigation' | 'Export' | 'Session' | 'Chart' | 'Analysis';
    action: () => void;
}
```

## Functions
- `registerCommands(commands: PaletteCommand[]): void`
  - Registers the full command list. Call once during app init.
- `openPalette(): void`
  - Opens the command palette and focuses the input field.
- `initCommandPalette(): void`
  - Builds DOM and binds Ctrl+K to toggle the palette.