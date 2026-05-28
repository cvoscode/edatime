# TextInput.ts

Text input field.

## Functions

### TextInput

```typescript
function TextInput(props: TextInputProps): HTMLInputElement
```

**Props:**

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
