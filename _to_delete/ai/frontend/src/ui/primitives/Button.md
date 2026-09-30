# ai/frontend/src/ui/primitives/Button.md
> Renders a labeled button element with optional click handler.

## Interface: ButtonProps
```typescript
interface ButtonProps {
    label: string;
    className?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onClick?: (event: MouseEvent) => void;
}
```

## Function: Button
```typescript
function Button(props: ButtonProps): HTMLButtonElement
```
Creates a native `<button>` element with the given label and event handler.

---
[1]: index.md
  - Creates a styled button element.

## ButtonProps
- `label: string`
- `className?: string`
- `onClick?: () => void`
- `disabled?: boolean`
- `type?: 'button' | 'submit' | 'reset'`