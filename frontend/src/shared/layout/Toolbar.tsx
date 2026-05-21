/**
 * Toolbar — generic horizontal toolbar for chart actions, filters, and controls.
 *
 * Composes a horizontal flex layout with:
 * - Optional title/section label on the left
 * - Action slots (icon buttons, dropdowns, etc.) on the right
 * - Optional divider between left and right sections
 *
 * @example
 * <Toolbar>
 *   <ToolbarLabel>Series</ToolbarLabel>
 *   <Chip label="temp" color="#ff0" onRemove={() => {}} />
 *   <ToolbarSpacer />
 *   <IconButton icon={<ZoomInIcon />} onClick={handleZoomIn} tooltip="Zoom in" />
 * </Toolbar>
 */
import { Component, JSX, For, Show } from 'solid-js';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
    children?: JSX.Element;
    class?: string;
}

export const Toolbar: Component<ToolbarProps> = (props) => (
    <div class={`${styles.toolbar} ${props.class ?? ''}`}>
        {props.children}
    </div>
);

export interface ToolbarLabelProps {
    children: JSX.Element;
}

export const ToolbarLabel: Component<ToolbarLabelProps> = (props) => (
    <span class={styles.toolbarLabel}>{props.children}</span>
);

export interface ToolbarSpacerProps { }

export const ToolbarSpacer: Component<ToolbarSpacerProps> = () => (
    <div class={styles.spacer} />
);

export interface ToolbarDividerProps { }

/** Vertical divider between toolbar sections */
export const ToolbarDivider: Component<ToolbarDividerProps> = () => (
    <div class={styles.divider} aria-hidden="true" />
);

export default Toolbar;