# ai/frontend/src/ui/primitives/Select.md
> Thin wrapper around the `createDropdown` primitive that re-emits change events as a native `Event` for backwards compatibility.

## Interfaces
```typescript
interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface SelectProps {
    id?: string;
    label: string;
    value?: string;
    options: SelectOption[];
    className?: string;
    variant?: 'default' | 'compact' | 'chip';
    disabled?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    onChange?: (value: string, event: Event) => void;
}

type SelectController = DropdownController;
```

## Function: Select
```typescript
function Select(props: SelectProps): HTMLElement
```
Creates a `createDropdown` controller and returns its root element. `onChange` is invoked with a synthesized `Event('change')` so legacy handlers receive a real `Event` object.

## Notes
- `searchable: true` renders a filter input at the top of the menu (case-insensitive substring match) and is recommended for option lists with 50+ entries (e.g. column pickers). [deps: [Dropdown][1]]
- The wrapped `DropdownController` exposes the same `open` / `close` / `setValue` / `setOptions` surface as the underlying primitive.

---
[1]: Dropdown.md
