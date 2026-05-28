# ColumnFilterModal.ts

Column filtering modal.

## Functions

### ColumnFilterModal

```typescript
function ColumnFilterModal(props: ColumnFilterModalProps): HTMLDivElement
```

**Props:**

```typescript
interface ColumnFilterModalProps {
    column: string;
    from: string;
    to: string;
    onApply: (from: string, to: string) => void;
    onCancel?: () => void;
}
```
