# Select.ts

Dropdown select component.

## Types

```typescript
interface SelectOption {
    value: string;
    label: string;
}
```

## Functions

### Select

```typescript
function Select(props: SelectProps): HTMLSelectElement
```

**Props:**

```typescript
interface SelectProps {
    id?: string;
    label: string;
    value?: string;
    options: SelectOption[];
    className?: string;
    onChange?: (value: string, event: Event) => void;
}
```
