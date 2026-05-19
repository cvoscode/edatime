import type { ToastMessage } from '../types';
import { uiStore } from '../stores/uiStore';

let _queue: ToastMessage[] = [];
const _timers = new Map<string, ReturnType<typeof setTimeout>>();

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

class ToastService {
  show(message: string, type: ToastMessage['type'] = 'info', duration: number = 3000): string {
    const id = genId();
    _queue.push({ id, message, type, duration });
    uiStore.setToasts([..._queue]);

    if (duration > 0) {
      const timer = setTimeout(() => this.dismiss(id), duration);
      _timers.set(id, timer);
    }

    return id;
  }

  dismiss(id: string): void {
    const timer = _timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      _timers.delete(id);
    }
    _queue = _queue.filter(t => t.id !== id);
    uiStore.setToasts([..._queue]);
  }

  clear(): void {
    for (const timer of _timers.values()) {
      clearTimeout(timer);
    }
    _timers.clear();
    _queue = [];
    uiStore.setToasts([..._queue]);
  }

  queue(): ToastMessage[] {
    return [..._queue];
  }

  setQueue(toasts: ToastMessage[]): void {
    // Clear existing timers for toasts being replaced
    for (const timer of _timers.values()) {
      clearTimeout(timer);
    }
    _timers.clear();

    _queue = [...toasts];
    uiStore.setToasts([..._queue]);
  }
}

declare const toastService: ToastService;
export { toastService, ToastService, ToastMessage };