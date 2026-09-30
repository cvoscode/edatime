# ai/frontend/src/ui/primitives/TextInput.md
> Renders a labeled text input with optional placeholder and input handler.

## Interface: TextInputProps
```typescript
interface TextInputProps {
    id?: string;
    label: string;
    value?: string;
    placeholder?: string;
    className?: string;
    onInput?: (value: string, event: Event) => void;
}
```

## Function: TextInput
```typescript
function TextInput(props: TextInputProps): HTMLInputElement
```
Creates a native `<input type="text">` with aria-label, optional placeholder, and an input handler.

---
[1]: index.md
  - Creates a labeled text input element.

## TextInputProps
- `label?: string`
- `value?: string`
- `placeholder?: string`
- `type?: string`
- `onChange?: (value: string) => void`