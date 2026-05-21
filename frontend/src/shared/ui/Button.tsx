/**
 * Button — headless button primitive.
 *
 * Renders a native <button> element with variant/size styling.
 * All props passed through via splitProps; no internal state.
 *
 * @example
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Save
 * </Button>
 */
import { Component, JSX, splitProps } from 'solid-js';
import styles from './Button.module.css';

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Visual style variant */
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    /** Size preset */
    size?: 'sm' | 'md' | 'lg';
}

export const Button: Component<ButtonProps> = (props) => {
    const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'children']);

    const variant = () => local.variant ?? 'primary';
    const size = () => local.size ?? 'md';

    return (
        <button
            class={`${styles.button} ${styles[variant()]} ${styles[size()]} ${local.class ?? ''}`}
            {...rest}
        >
            {local.children}
        </button>
    );
};

export default Button;