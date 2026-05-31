# ai/frontend/src/ui/primitives/Select.md
> Renders a labeled dropdown select element with options and a change handler.

## Interfaces
```typescript
interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps {
    id?: string;
    label: string;
    value?: string;
    options: SelectOption[];
    className?: string;
    onChange?: (value: string, event: Event) => void;
}
```

## Function: Select
```typescript
function Select(props: SelectProps): HTMLSelectElement
```
Creates a native `<select>` element populated with the given options and a change handler.

---
[1]: index.md
  - Creates a labeled select element.

## SelectProps
- `id?: string`
- `label?: string`
- `value?: string`
- `options: Array<{ value: string; label: string }>`
- `onChange?: (value: string) => void`