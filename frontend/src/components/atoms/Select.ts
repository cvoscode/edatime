export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectProps {
    id?: string;
    label: string;
    value?: string;
    options: SelectOption[];
    className?: string;
    onChange?: (value: string, event: Event) => void;
}

export function Select(props: SelectProps): HTMLSelectElement {
    const select = document.createElement('select');
    if (props.id) select.id = props.id;
    select.setAttribute('aria-label', props.label);
    if (props.className) select.className = props.className;
    for (const option of props.options) {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        el.selected = option.value === props.value;
        select.appendChild(el);
    }
    if (props.onChange) {
        select.addEventListener('change', (event) => props.onChange?.(select.value, event));
    }
    return select;
}
