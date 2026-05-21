/**
 * LoadingOverlay — headless loading indicator that overlays a container.
 *
 * Renders a semi-transparent overlay with a spinner and optional label.
 * Controlled via isLoading signal prop — no internal state.
 *
 * @example
 * <LoadingOverlay isLoading={isLoading} label="Fetching data..." />
 */
import { Component, Show } from 'solid-js';
import styles from './LoadingOverlay.module.css';

export interface LoadingOverlayProps {
    /** Controlled loading state — Show renders nothing when false */
    isLoading: () => boolean;
    /** Optional label text below spinner */
    label?: string;
    /** Additional CSS class */
    class?: string;
}

export const LoadingOverlay: Component<LoadingOverlayProps> = (props) => {
    return (
        <Show when={props.isLoading()}>
            <div
                class={`${styles.overlay} ${props.class ?? ''}`}
                role="status"
                aria-live="polite"
                aria-label={props.label ?? 'Loading'}
            >
                <div class={styles.spinner} />
                <Show when={props.label}>
                    <span class={styles.label}>{props.label}</span>
                </Show>
            </div>
        </Show>
    );
};

export default LoadingOverlay;