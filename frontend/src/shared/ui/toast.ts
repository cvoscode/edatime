/**
 * Toast - headless toast notification system (add/remove only, no render).
 *
 * This module exports a toast action and a ToastContainer presenter.
 * The addToast action is called by services/hooks; ToastContainer renders the queue.
 *
 * Usage:
 *   import { addToast } from '@/shared/ui';
 *   addToast({ message: 'Upload complete', type: 'success', duration: 3000 });
 *
 * ToastContainer is rendered once in AppShell.
 *
 * @module
 */
import { createStore } from 'solid-js/store';
import type { ToastMessage } from '@/types/domains';

interface ToastState {
    toasts: ToastMessage[];
}

const [toastState, setToastState] = createStore<ToastState>({ toasts: [] });

function generateId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/**
 * addToast - enqueue a toast notification.
 * Duration=0 means the toast stays until dismissed.
 */
export function addToast(toast: Omit<ToastMessage, 'id'>): string {
    const id = generateId();
    const msg: ToastMessage = { id, ...toast };
    setToastState('toasts', (t) => [...t, msg]);

    if (toast.duration !== 0) {
        setTimeout(() => removeToast(id), toast.duration ?? 4000);
    }

    return id;
}

/**
 * removeToast - dismiss a toast by id.
 */
export function removeToast(id: string): void {
    setToastState('toasts', (t) => t.filter((msg) => msg.id !== id));
}

/** Expose current toasts for ToastContainer */
export function useToasts() {
    return {
        toasts: () => toastState.toasts,
        remove: removeToast,
    };
}
