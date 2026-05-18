import { Component, Show } from 'solid-js';

export interface LoadingOverlayProps {
  isLoading: () => boolean;
  label?: string;
}

export const LoadingOverlay: Component<LoadingOverlayProps> = (props) => {
  return (
    <Show when={props.isLoading()}>
      <div class="loading-overlay" role="status" aria-live="polite">
        <div class="loading-spinner" />
        <span class="loading-label">{props.label ?? 'Loading data…'}</span>
      </div>
    </Show>
  );
};