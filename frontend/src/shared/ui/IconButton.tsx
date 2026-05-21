/**
 * IconButton — headless icon-only button with optional tooltip wrapper.
 *
 * Renders a button that contains only an icon (no text label).
 * Optionally wraps in a Tooltip for accessibility hint.
 * No internal state — controlled via props + onClick.
 *
 * @example
 * <IconButton
 *   icon={<ZoomInIcon />}
 *   onClick={handleZoomIn}
 *   tooltip="Zoom in"
 *   variant="ghost"
 *   size="md"
 * />
 */
import { Component, JSX, splitProps, Show } from 'solid-js';
import { Tooltip } from './Tooltip';
import styles from './IconButton.module.css';

export interface IconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Icon element (JSX) — rendered inside the button */
    icon: JSX.Element;
    /** Size preset */
    size?: 'sm' | 'md' | 'lg';
    /** Visual variant */
    variant?: 'primary' | 'secondary' | 'ghost';
    /** Tooltip text — if provided, button is wrapped in Tooltip component */
    tooltip?: string;
    /** Tooltip position */
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
    /** Additional CSS class */
    class?: string;
}

export const IconButton: Component<IconButtonProps> = (props) => {
    const [local, rest] = splitProps(props, ['icon', 'size', 'variant', 'tooltip', 'tooltipPosition', 'class']);

    const size = () => local.size ?? 'md';
    const variant = () => local.variant ?? 'ghost';

    const button = (
        <button
            class={`${styles.iconButton} ${styles[size()]} ${styles[variant()]} ${local.class ?? ''}`}
            type="button"
            {...rest}
        >
            {local.icon}
        </button>
    );

    return (
        <Show
            when={local.tooltip}
            fallback={button}
            children={
                <Tooltip content={local.tooltip!} position={local.tooltipPosition ?? 'top'}>
                    {button}
                </Tooltip>
            }
        />
    );
};

export default IconButton;