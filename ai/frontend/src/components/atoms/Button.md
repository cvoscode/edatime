# Button.ts

Reusable button component.

## Functions

### Button

```typescript
function Button(props: ButtonProps): HTMLButtonElement
```

**Props:**

```typescript
interface ButtonProps {
    label: string;
    className?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onClick?: (event: MouseEvent) => void;
}
```
