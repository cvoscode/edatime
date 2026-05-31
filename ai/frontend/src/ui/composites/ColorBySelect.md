# ai/frontend/src/ui/composites/ColorBySelect.md
> Renders a "Color by" column selector using a Select dropdown.

## Interface: ColorBySelectProps
```typescript
interface ColorBySelectProps {
    columns: string[];
    value: string | null;
    onChange?: (value: string | null) => void;
}
```

## Function: ColorBySelect
```typescript
function ColorBySelect(props: ColorBySelectProps): HTMLDivElement
```
Creates a div containing a "Color by" label and a Select with a "None" option plus one entry per column; clears selection when empty string is chosen.

---
[1]: primitives/Select.md
[2]: index.md
  - Creates a labeled select dropdown for choosing a color-by column.

## ColorBySelectProps
- `columns: string[]`
- `value: string | null`
- `onChange?: (value: string | null) => void`