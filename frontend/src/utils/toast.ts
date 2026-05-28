/**
 * Shared toast notification system for EdaTime.
 *
 * The `toast(message, kind, opts)` signature stays stable for existing call sites,
 * while defaults and dedupe behavior are controlled centrally here.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
    /** Auto-dismiss delay in ms. 0 = sticky (manual dismiss only). */
    duration?: number;
    /** Optional action button. */
    action?: { label: string; onClick: () => void };
    /** Override dedupe key when identical text should still stack. */
    dedupeKey?: string;
}

interface ActiveToast {
    key: string;
    el: HTMLDivElement;
    messageEl: HTMLSpanElement;
    iconEl: HTMLSpanElement;
    actionBtn: HTMLButtonElement | null;
    closeBtn: HTMLButtonElement;
    timer: ReturnType<typeof setTimeout> | null;
    dismiss: () => void;
    refresh: (message: string, kind: ToastKind, opts: ToastOptions) => void;
}

const DEFAULT_DURATIONS: Record<ToastKind, number> = {
    success: 3200,
    info: 3800,
    warning: 5200,
    error: 0,
};

const TOAST_ICONS: Record<ToastKind, string> = {
    success: '✔',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
};

let container: HTMLElement | null = null;
const activeToasts = new Map<string, ActiveToast>();

function ensureContainer(): HTMLElement {
    if (container && container.isConnected) return container;
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', 'Notifications');
    container.setAttribute('data-position', 'top-right');
    document.body.appendChild(container);
    return container;
}

function normalizeOptions(durationOrOpts?: number | ToastOptions): ToastOptions {
    if (typeof durationOrOpts === 'number') return { duration: durationOrOpts };
    return durationOrOpts ?? {};
}

function resolveDuration(kind: ToastKind, opts: ToastOptions): number {
    if (typeof opts.duration === 'number') return opts.duration;
    return DEFAULT_DURATIONS[kind];
}

function clearToastTimer(toastState: ActiveToast): void {
    if (toastState.timer) {
        clearTimeout(toastState.timer);
        toastState.timer = null;
    }
}

function applyActionButton(toastState: ActiveToast, opts: ToastOptions): void {
    if (toastState.actionBtn) {
        toastState.actionBtn.remove();
        toastState.actionBtn = null;
    }
    if (!opts.action) return;

    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.action.label;
    btn.addEventListener('click', () => {
        opts.action?.onClick();
        toastState.dismiss();
    });
    toastState.el.insertBefore(btn, toastState.closeBtn);
    toastState.actionBtn = btn;
}

function scheduleDismiss(toastState: ActiveToast, kind: ToastKind, opts: ToastOptions): void {
    clearToastTimer(toastState);
    const duration = resolveDuration(kind, opts);
    if (duration <= 0) return;
    toastState.timer = setTimeout(() => toastState.dismiss(), duration);
}

function updateToastVisuals(toastState: ActiveToast, message: string, kind: ToastKind, opts: ToastOptions): void {
    toastState.el.className = `toast toast--${kind}`;
    toastState.el.classList.remove('toast--exit');
    toastState.messageEl.textContent = message;
    toastState.iconEl.textContent = TOAST_ICONS[kind];
    toastState.el.dataset.kind = kind;
    applyActionButton(toastState, opts);
    scheduleDismiss(toastState, kind, opts);
}

function createToast(key: string, message: string, kind: ToastKind, opts: ToastOptions): ActiveToast {
    const root = document.createElement('div');
    root.className = `toast toast--${kind}`;
    root.dataset.kind = kind;
    root.setAttribute('role', 'alert');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = TOAST_ICONS[kind];
    root.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    root.appendChild(text);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    root.appendChild(closeBtn);

    const toastState: ActiveToast = {
        key,
        el: root,
        messageEl: text,
        iconEl: icon,
        actionBtn: null,
        closeBtn,
        timer: null,
        dismiss: () => {
            clearToastTimer(toastState);
            const active = activeToasts.get(key);
            if (active === toastState) activeToasts.delete(key);
            toastState.el.classList.remove('toast--visible');
            toastState.el.classList.add('toast--exit');
            toastState.el.addEventListener('transitionend', () => toastState.el.remove(), { once: true });
            setTimeout(() => {
                if (toastState.el.parentNode) toastState.el.remove();
            }, 260);
        },
        refresh: (nextMessage, nextKind, nextOpts) => {
            updateToastVisuals(toastState, nextMessage, nextKind, nextOpts);
            requestAnimationFrame(() => toastState.el.classList.add('toast--visible'));
        },
    };

    closeBtn.addEventListener('click', toastState.dismiss);
    root.addEventListener('mouseenter', () => clearToastTimer(toastState));
    root.addEventListener('mouseleave', () => scheduleDismiss(toastState, kind, opts));

    updateToastVisuals(toastState, message, kind, opts);
    return toastState;
}

export function dismissAllToasts(): void {
    for (const toastState of Array.from(activeToasts.values())) {
        toastState.el.remove();
        clearToastTimer(toastState);
    }
    activeToasts.clear();
    container?.remove();
    container = null;
}

export function toast(message: string, kind: ToastKind = 'info', durationOrOpts?: number | ToastOptions): () => void {
    const opts = normalizeOptions(durationOrOpts);
    const key = opts.dedupeKey ?? `${kind}:${message}`;
    const existing = activeToasts.get(key);
    if (existing && existing.el.isConnected) {
        existing.refresh(message, kind, opts);
        return existing.dismiss;
    }

    const next = createToast(key, message, kind, opts);
    activeToasts.set(key, next);

    const host = ensureContainer();
    host.prepend(next.el);
    requestAnimationFrame(() => next.el.classList.add('toast--visible'));

    return next.dismiss;
}
