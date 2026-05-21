/**
 * Badge — headless status/category badge with optional color.
 *
 * @example
 * <Badge color="#ff0055">Hot</Badge>
 * <Badge>Default</Badge>
 */
import { Component, Show } from 'solid-js';
import styles from './Badge.module.css';

export interface BadgeProps {
    label: string;
    color?: string;
    class?: string;
}

export const Badge: Component<BadgeProps> = (props) => {
    return (
        <span
            class={`${styles.badge} ${props.class ?? ''}`}
            style={props.color ? { '--badge-color': props.color } as any : undefined}
        >
            <Show when={props.color}>
                <span class={styles.dot} style={{ background: props.color }} />
            </Show>
            {props.label}
        </span>
    );
};

export default Badge;