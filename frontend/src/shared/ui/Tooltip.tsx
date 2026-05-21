/**
 * Tooltip — headless hover tooltip with position control.
 *
 * Shows tooltip on mouse enter/hide on mouse leave.
 * Uses CSS positioning — no portal needed.
 *
 * @example
 * <Tooltip content="Press Ctrl+Click to add filter" position="top">
 *   <button>Help</button>
 * </Tooltip>
 */
import { Component, createSignal, Show } from 'solid-js';
import styles from './Tooltip.module.css';

export interface TooltipProps {
    /** Tooltip text or JSX content */
    content: string | any;
    /** Trigger element — passed as children */
    children: any;
    /** Tooltip position relative to trigger */
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: Component<TooltipProps> = (props) => {
    const [visible, setVisible] = createSignal(false);
    const pos = () => props.position ?? 'top';

    return (
        <div
            class={styles.wrapper}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {props.children}
            <Show when={visible()}>
                <div class={`${styles.tooltip} ${styles[pos()]}`}>
                    {props.content}
                </div>
            </Show>
        </div>
    );
};

export default Tooltip;