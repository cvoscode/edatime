import { Component, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: any;
  footer?: any;
}

const Modal: Component<ModalProps> = (props) => {
  createEffect(() => {
    if (props.open) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') props.onClose();
      };
      document.addEventListener('keydown', handleKeyDown);
      onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
    }
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class={styles.overlay} onClick={props.onClose}>
          <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
            <Show when={props.title}>
              <div class={styles.header}>
                <h2 class={styles.title}>{props.title}</h2>
                <button class={styles.closeBtn} onClick={props.onClose} aria-label="Close">
                  ×
                </button>
              </div>
            </Show>
            <div class={styles.body}>{props.children}</div>
            <Show when={props.footer}>
              <div class={styles.footer}>{props.footer}</div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default Modal;