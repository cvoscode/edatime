/**
 * Input — headless text input with optional label and error state.
 *
 * Renders a native <input> element. All HTML input attributes passed through.
 * No internal state — value is controlled via props.value + onInput.
 *
 * @example
 * <Input
 *   label="Column Name"
 *   value={name()}
 *   onInput={e => setName(e.currentTarget.value)}
 *   error={errors().name}
 *   placeholder="e.g., temperature"
 * />
 */
import { Component, JSX, splitProps } from 'solid-js';
import styles from './Input.module.css';

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
    /** Label text rendered above the input */
    label?: string;
    /** Error message rendered below the input */
    error?: string;
    /** Additional wrapper CSS class */
    class?: string;
}

export const Input: Component<InputProps> = (props) => {
    const [local, rest] = splitProps(props, ['label', 'error', 'class']);

    return (
        <div class={`${styles.wrapper} ${local.class ?? ''}`}>
            {local.label && <label class={styles.label}>{local.label}</label>}
            <input
                class={`${styles.input} ${local.error ? styles.hasError : ''}`}
                {...rest}
            />
            {local.error && <span class={styles.error}>{local.error}</span>}
        </div>
    );
};

export default Input;