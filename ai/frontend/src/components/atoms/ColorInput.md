# ColorInput.ts

Color picker input.

## Functions

### ColorInput

```typescript
function ColorInput(props: ColorInputProps): HTMLInputElement
```

**Props:**

```typescript
interface ColorInputProps {
    id?: string;
    label: string;
    value: string;
    className?: string;
    onInput?: (value: string, event: Event) => void;
}
```
