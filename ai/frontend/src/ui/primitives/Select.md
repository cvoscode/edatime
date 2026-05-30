# frontend/src/ui/primitives/Select.ts
> Select dropdown component.

## Function: Select
- `Select(props: SelectProps): HTMLSelectElement`
  - Creates a labeled select element.

## SelectProps
- `id?: string`
- `label?: string`
- `value?: string`
- `options: Array<{ value: string; label: string }>`
- `onChange?: (value: string) => void`