/** Keep rich controls expanded on wide screens and compact them behind summaries on narrow screens. */
export function initResponsiveDisclosures(): () => void {
    const controller = new AbortController();
    const cleanups: Array<() => void> = [];
    document.querySelectorAll<HTMLDetailsElement>('details[data-responsive-collapse]').forEach((details) => {
        const breakpoint = Number(details.dataset.responsiveCollapse) || 640;
        const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
        let enteredCompact = false;
        const sync = () => {
            if (media.matches) {
                if (!enteredCompact) details.open = false;
                enteredCompact = true;
            } else {
                enteredCompact = false;
                details.open = true;
            }
        };
        media.addEventListener?.('change', sync, { signal: controller.signal });
        sync();
        cleanups.push(() => details.open = true);
    });
    return () => {
        controller.abort();
        cleanups.forEach((cleanup) => cleanup());
    };
}

/** Buttons with data-action-proxy forward to one canonical control without duplicating owner logic. */
export function initActionProxies(): () => void {
    const controller = new AbortController();
    document.addEventListener('click', (event) => {
        const proxy = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-action-proxy]');
        if (!proxy) return;
        document.getElementById(proxy.dataset.actionProxy ?? '')?.click();
    }, { signal: controller.signal });
    return () => controller.abort();
}
