/** Phone-only overflow for app-level actions that cannot fit in the top bar. */
export function initMobileHeaderMenu(): () => void {
    const root = document.getElementById('mobile-header-menu');
    const toggle = document.getElementById('mobile-header-menu-btn') as HTMLButtonElement | null;
    const popover = document.getElementById('mobile-header-menu-popover') as HTMLElement | null;
    if (!root || !toggle || !popover) return () => {};

    const controller = new AbortController();
    const options = { signal: controller.signal };
    const items = Array.from(popover.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

    const setOpen = (open: boolean, restoreFocus = false) => {
        popover.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close app actions' : 'Open app actions');
        if (open) queueMicrotask(() => items[0]?.focus());
        if (!open && restoreFocus) toggle.focus();
    };

    toggle.addEventListener('click', () => setOpen(popover.hidden), options);
    popover.addEventListener('click', (event) => {
        const item = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
            '[data-mobile-header-action], [data-mobile-header-page]',
        );
        if (!item) return;
        const page = item.dataset.mobileHeaderPage;
        const target = page
            ? document.querySelector<HTMLElement>(`.sidebar .nav-item[data-page="${page}"]`)
            : document.getElementById(item.dataset.mobileHeaderAction ?? '');
        setOpen(false);
        target?.click();
    }, options);
    popover.addEventListener('keydown', (event) => {
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            items[(index + delta + items.length) % items.length]?.focus();
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
        }
    }, options);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !popover.hidden) {
            event.preventDefault();
            setOpen(false, true);
        }
    }, options);
    document.addEventListener('pointerdown', (event) => {
        if (!popover.hidden && !root.contains(event.target as Node)) setOpen(false);
    }, options);

    return () => {
        controller.abort();
        setOpen(false);
    };
}
