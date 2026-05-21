/**
 * ToastContainer — renders the toast notification queue from toast.ts.
 *
 * Must be rendered once in AppShell (or equivalent root layout).
 * Uses Portal to render at document body level.
 *
 * @example
 * // In AppShell or root layout:
 * <ToastContainer />
 */
import { Component, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { addToast, removeToast, useToasts } from './toast';
import styles from './Toast.module.css';

export { addToast, removeToast };

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
            <div class={styles.container} aria-live="polite">
                <For each={toasts()}>
                    {(toast) => (
                        <div
                            class={`${styles.toast} ${styles[toast.type]}`}
                            role="alert"
                        >
                            <span class={styles.icon}>{iconFor(toast.type)}</span>
                            <span class={styles.message}>{toast.message}</span>
                            <button
                                class={styles.dismiss}
                                onClick={() => remove(toast.id)}
                                aria-label="Dismiss notification"
                                type="button"
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