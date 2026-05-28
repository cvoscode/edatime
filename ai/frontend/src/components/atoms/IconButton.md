# IconButton.ts

Icon-only button.

## Functions

### IconButton

```typescript
function IconButton(props: IconButtonProps): HTMLButtonElement
```

**Props:**

```typescript
interface IconButtonProps extends Omit<ButtonProps, 'label'> {
    icon: string;
    label: string;
}
```
