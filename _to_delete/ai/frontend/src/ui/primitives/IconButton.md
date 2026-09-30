# ai/frontend/src/ui/primitives/IconButton.md
> Renders a button displaying an icon glyph with an aria-label, built on top of Button.

## Interface: IconButtonProps
```typescript
interface IconButtonProps extends Omit<ButtonProps, 'label'> {
    icon: string;
    label: string;
}
```

## Function: IconButton
```typescript
function IconButton(props: IconButtonProps): HTMLButtonElement
```
Creates a Button with no text label but with aria-label and title set to the provided label string.

---
[1]: Button.md
[2]: index.md
  - Creates an icon button with optional tooltip.

## IconButtonProps
- `icon: string`
- `ariaLabel: string`
- `onClick?: () => void`
- `className?: string`
- `title?: string`