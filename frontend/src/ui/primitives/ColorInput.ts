export interface ColorInputProps {
    id?: string;
    label: string;
    value: string;
    className?: string;
    onInput?: (value: string, event: Event) => void;
}

export function ColorInput(props: ColorInputProps): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'color';
    if (props.id) input.id = props.id;
    input.setAttribute('aria-label', props.label);
    input.title = props.label;
    input.value = props.value;
    if (props.className) input.className = props.className;
    if (props.onInput) input.addEventListener('input', (event) => props.onInput?.(input.value, event));
    return input;
}