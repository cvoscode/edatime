# ai/frontend/src/ui/composites/SeriesChip.md
> Renders a labeled, colorable checkbox chip representing a single time-series column.

## Interface: SeriesChipProps
```typescript
interface SeriesChipProps {
    column: string;
    checked: boolean;
    color: string;
    disabled?: boolean;
    adaptiveTarget?: boolean;
    menuLabel?: string;
    label?: string;
    title?: string;
    onToggle?: (checked: boolean) => void;
    onColorInput?: (color: string) => void;
    onMenuClick?: () => void;
}
```

## Function: SeriesChip
```typescript
function SeriesChip(props: SeriesChipProps): HTMLLabelElement
```
Creates a `<label>` chip with a hidden checkbox, a ColorInput, a display label, and an optional menu button; applies active/adaptive-target/disabled CSS classes and --chip-accent color.

---
[1]: primitives/ColorInput.md
[2]: index.md
  - Creates a labeled checkbox chip with color styling and menu trigger.

## SeriesChipProps
- `column: string`
- `checked: boolean`
- `color: string`
- `disabled?: boolean`
- `adaptiveTarget?: boolean`
- `menuLabel?: string`
- `label?: string`
- `title?: string`
- `onToggle?: (checked: boolean) => void`
- `onColorInput?: (color: string) => void`
- `onMenuClick?: () => void`