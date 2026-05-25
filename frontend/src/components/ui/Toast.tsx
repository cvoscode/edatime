import { Component, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useToasts } from '@/shared/ui/toast';
import styles from './Toast.module.css';

const ToastContainer: Component = () => {
  const { toasts, remove } = useToasts();

  const iconFor = (type: string) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      default: return 'ℹ';
    }
  };

  return (
    <Portal>
      <div class={styles.container}>
        <For each={toasts()}>
          {(toast) => (
            <div class={`${styles.toast} ${styles[toast.type]}`}>
              <span class={styles.icon}>{iconFor(toast.type)}</span>
              <span class={styles.message}>{toast.message}</span>
              <button
                class={styles.dismiss}
                onClick={() => remove(toast.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
};

export default ToastContainer;