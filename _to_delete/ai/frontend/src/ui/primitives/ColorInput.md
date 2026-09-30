# ai/frontend/src/ui/primitives/ColorInput.md
> Renders a color picker input bound to a label and an input handler.

## Interface: ColorInputProps
```typescript
interface ColorInputProps {
    id?: string;
    label: string;
    value: string;
    className?: string;
    onInput?: (value: string, event: Event) => void;
}
```

## Function: ColorInput
```typescript
function ColorInput(props: ColorInputProps): HTMLInputElement
```
Creates a native `<input type="color">` with aria-label and a change handler.

---
[1]: index.md
  - Creates an `<input type="color">` with label.

## ColorInputProps
- `label?: string`
- `value?: string`
- `onChange?: (color: string) => void`