# palette.ts

Command palette (Ctrl+K) for fuzzy-searchable access to pages, shortcuts, and actions.

## Interfaces

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

```typescript
function registerCommands(commands: PaletteCommand[]): void
```

Register the full command list. Call once during app init.

```typescript
function openPalette(): void
```

Open the command palette.

```typescript
function initCommandPalette(): void
```

Bind Ctrl+K to open the palette.