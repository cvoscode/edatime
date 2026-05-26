/**
 * Toast notification system for EdaTime.
 *
 * Usage:
 *   import { toast } from './utils/toast.js';
 *   toast('Exported chart.png', 'success');
 *   toast('Upload failed: file too large', 'error');
 *   toast('Computing FFT…', 'info', 0);  // sticky until dismissed
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
    /** Auto-dismiss delay in ms. 0 = sticky (manual dismiss only). Default 4000. */
    duration?: number;
    /** Optional action button. */
    action?: { label: string; onClick: () => void };
}

let _container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
    if (_container && _container.isConnected) return _container;
    _container = document.createElement('div');
    _container.className = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('role', 'status');
    document.body.appendChild(_container);
    return _container;
}

export function toast(message: string, kind: ToastKind = 'info', durationOrOpts?: number | ToastOptions): () => void {
    const opts: ToastOptions = typeof durationOrOpts === 'number'
        ? { duration: durationOrOpts }
        : (durationOrOpts ?? {});
    const duration = opts.duration ?? 4000;

    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.setAttribute('role', 'alert');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = kind === 'success' ? '✔' : kind === 'error' ? '✕' : kind === 'warning' ? '⚠' : 'ℹ';
    el.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    el.appendChild(text);

    if (opts.action) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = opts.action.label;
        btn.addEventListener('click', () => { opts.action!.onClick(); dismiss(); });
        el.appendChild(btn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.addEventListener('click', dismiss);
    el.appendChild(closeBtn);

    container.appendChild(el);

    // Trigger enter animation
    requestAnimationFrame(() => el.classList.add('toast--visible'));

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (duration > 0) {
        timer = setTimeout(dismiss, duration);
        // Pause on hover
        el.addEventListener('mouseenter', () => { if (timer) { clearTimeout(timer); timer = null; } });
        el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2000); });
    }

    function dismiss() {
        if (timer) clearTimeout(timer);
        el.classList.remove('toast--visible');
        el.classList.add('toast--exit');
        el.addEventListener('transitionend', () => el.remove(), { once: true });
        // Fallback if transitionend doesn't fire
        setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
    }

    return dismiss;
}
