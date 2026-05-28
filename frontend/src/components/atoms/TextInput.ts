export interface TextInputProps {
    id?: string;
    label: string;
    value?: string;
    placeholder?: string;
    className?: string;
    onInput?: (value: string, event: Event) => void;
}

export function TextInput(props: TextInputProps): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    if (props.id) input.id = props.id;
    input.setAttribute('aria-label', props.label);
    input.value = props.value ?? '';
    if (props.placeholder) input.placeholder = props.placeholder;
    if (props.className) input.className = props.className;
    if (props.onInput) input.addEventListener('input', (event) => props.onInput?.(input.value, event));
    return input;
}
