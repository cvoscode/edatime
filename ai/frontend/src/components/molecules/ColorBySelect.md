# ColorBySelect.ts

Color-by column selector.

## Functions

### ColorBySelect

```typescript
function ColorBySelect(props: ColorBySelectProps): HTMLDivElement
```

**Props:**

```typescript
interface ColorBySelectProps {
    columns: string[];
    value: string | null;
    onChange?: (value: string | null) => void;
}
```
