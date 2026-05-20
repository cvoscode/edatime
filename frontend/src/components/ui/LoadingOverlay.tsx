import { Component, Show } from 'solid-js';
import styles from './LoadingOverlay.module.css';

export interface LoadingOverlayProps {
  isLoading: () => boolean;
  label?: string;
}

export const LoadingOverlay: Component<LoadingOverlayProps> = (props) => {
  return (
    <Show when={props.isLoading()}>
      <div class={styles.overlay} role="status" aria-live="polite">
        <div class={styles.spinner} />
        <span class={styles.label}>{props.label ?? 'Loading data…'}</span>
      </div>
    </Show>
  );
};