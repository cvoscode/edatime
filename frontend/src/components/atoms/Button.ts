export interface ButtonProps {
    label: string;
    className?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onClick?: (event: MouseEvent) => void;
}

export function Button(props: ButtonProps): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = props.type ?? 'button';
    button.textContent = props.label;
    if (props.className) button.className = props.className;
    if (props.disabled != null) button.disabled = props.disabled;
    if (props.onClick) button.addEventListener('click', props.onClick);
    return button;
}
