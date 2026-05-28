import { Button, type ButtonProps } from './Button.js';

export interface IconButtonProps extends Omit<ButtonProps, 'label'> {
    icon: string;
    label: string;
}

export function IconButton(props: IconButtonProps): HTMLButtonElement {
    const button = Button({ ...props, label: '' });
    button.setAttribute('aria-label', props.label);
    button.title = props.label;
    button.textContent = props.icon;
    return button;
}