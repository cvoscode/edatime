import { Select } from '../primitives/Select.js';

export interface ColorBySelectProps {
    columns: string[];
    value: string | null;
    onChange?: (value: string | null) => void;
}

export function ColorBySelect(props: ColorBySelectProps): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'series-color-selector';
    const label = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = 'Color by';
    const select = Select({
        id: 'color-column-select',
        label: 'Color-by column',
        value: props.value ?? '',
        options: [
            { value: '', label: 'None' },
            ...props.columns.map((column) => ({ value: column, label: column })),
        ],
        onChange: (value) => props.onChange?.(value || null),
    });
    label.append(text, select);
    root.appendChild(label);
    return root;
}