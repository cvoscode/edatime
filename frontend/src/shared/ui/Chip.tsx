/**
 * Chip — headless series/data chip with optional color dot and remove action.
 *
 * Renders a button element. Accepts label, optional color, selected state,
 * and optional remove callback. No internal state — selected state is
 * controlled via props.
 *
 * @example
 * <Chip
 *   label="temperature"
 *   color="#ff0055"
 *   selected={isSelected()}
 *   onClick={() => setSelected(!isSelected())}
 *   onRemove={isRemovable ? () => handleRemove(id) : undefined}
 * />
 */
import { Component, Show } from 'solid-js';
import styles from './Chip.module.css';

export interface ChipProps {
    /** Display label */
    label: string;
    /** Optional dot color (CSS color string) */
    color?: string;
    /** Whether the chip is in selected state */
    selected?: boolean;
    /** Click handler — chip itself is a button */
    onClick?: () => void;
    /** Optional remove handler — renders an × button */
    onRemove?: () => void;
    /** Additional CSS class */
    class?: string;
    /** data-column attribute for event delegation */
    'data-column'?: string;
}

export const Chip: Component<ChipProps> = (props) => {
    return (
        <button
            class={`${styles.chip} ${props.selected ? styles.selected : ''} ${props.class ?? ''}`}
            style={props.color ? { '--chip-color': props.color } as any : undefined}
            onClick={props.onClick}
            data-column={props['data-column']}
            type="button"
        >
            <Show when={props.color}>
                <span class={styles.dot} style={{ background: props.color }} />
            </Show>
            <span class={styles.label}>{props.label}</span>
            <Show when={props.onRemove}>
                <span
                    class={styles.remove}
                    onClick={(e) => {
                        e.stopPropagation();
                        props.onRemove?.();
                    }}
                >
                    ×
                </span>
            </Show>
        </button>
    );
};

export default Chip;