import { onNavigationChange } from '../platform/navigationEvents.js';

/** Shared disclosure behavior for the compact analysis toolbars. */
export function initToolbarPopovers(root: HTMLElement, {
    selector = '[data-toolbar-popover]',
    closeOnAction = '[data-toolbar-export] button',
}: { selector?: string; closeOnAction?: string } = {}) {
    const lifetime = new AbortController();
    const options = { signal: lifetime.signal };
    const popovers = Array.from(root.querySelectorAll<HTMLDetailsElement>(selector));
    const close = (popover: HTMLDetailsElement, restoreFocus = false) => {
        popover.open = false;
        popover.querySelector('summary')?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) popover.querySelector('summary')?.focus();
    };

    for (const popover of popovers) {
        const summary = popover.querySelector('summary');
        summary?.setAttribute('aria-expanded', String(popover.open));
        popover.addEventListener('toggle', () => {
            summary?.setAttribute('aria-expanded', String(popover.open));
            if (popover.open) {
                for (const other of popovers) if (other !== popover) close(other);
            }
        }, options);
    }

    const dismissOutside = (event: Event) => {
        if (!(event.target instanceof Node)) return;
        for (const popover of popovers) {
            if (popover.open && !popover.contains(event.target)) close(popover);
        }
    };
    document.addEventListener('pointerdown', dismissOutside, options);
    document.addEventListener('focusin', dismissOutside, options);
    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        // Close a nested select before its containing toolbar panel.
        if (event.target instanceof Element && event.target.closest('.dropdown--open')) return;
        const open = popovers.find((popover) => popover.open);
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        close(open, true);
    }, { ...options, capture: true });
    root.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const action = event.target.closest(closeOnAction);
        const popover = action?.closest<HTMLDetailsElement>(selector);
        // Return focus before an export action opens its own dialog.
        if (popover) close(popover, true);
    }, { ...options, capture: true });
    const disposeNavigation = onNavigationChange(() => popovers.forEach((popover) => close(popover)));

    return {
        close,
        dispose() {
            lifetime.abort();
            disposeNavigation();
            popovers.forEach((popover) => close(popover));
        },
    };
}
