/**
 * SwitchToggle — headless toggle/switch checkbox input.
 *
 * Renders a styled checkbox input with a sliding thumb.
 * No internal state — fully controlled via props.checked + onChange.
 *
 * @example
 * <SwitchToggle
 *   checked={isEnabled()}
 *   onChange={e => setIsEnabled(e.currentTarget.checked)}
 *   label="Enable rolling"
 * />
 */
import { Component, JSX, splitProps } from 'solid-js';
import styles from './SwitchToggle.module.css';

export interface SwitchToggleProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    /** Label text rendered beside the toggle */
    label?: string;
    /** Additional CSS class */
    class?: string;
}

export const SwitchToggle: Component<SwitchToggleProps> = (props) => {
    const [local, rest] = splitProps(props, ['label', 'class']);

    return (
        <label class={`${styles.wrapper} ${local.class ?? ''}`}>
            <input type="checkbox" class={styles.input} {...rest} />
            <span class={styles.track}>
                <span class={styles.thumb} />
            </span>
            {local.label && <span class={styles.label}>{local.label}</span>}
        </label>
    );
};

export default SwitchToggle;