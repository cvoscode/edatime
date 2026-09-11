const DATA_UPDATED_EVENT = 'edatime:data-updated';

export function markDataUpdated(at = Date.now()): void {
    window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT, { detail: { at } }));
}

/** Keep the shell's freshness label relative without coupling analyses to it. */
export function initDataFreshnessIndicator(): () => void {
    const indicator = document.getElementById('data-freshness-indicator');
    const label = indicator?.querySelector<HTMLElement>('.data-freshness-time');
    let updatedAt = 0;

    const render = () => {
        if (!indicator || !label || !updatedAt) return;
        const minutes = Math.floor((Date.now() - updatedAt) / 60_000);
        label.textContent = minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`;
        indicator.hidden = false;
        indicator.setAttribute('aria-label', `Data ${label.textContent.toLowerCase()}`);
    };
    const onUpdated = (event: Event) => {
        updatedAt = Number((event as CustomEvent<{ at?: number }>).detail?.at) || Date.now();
        render();
    };
    window.addEventListener(DATA_UPDATED_EVENT, onUpdated);
    const interval = window.setInterval(render, 30_000);
    return () => {
        window.removeEventListener(DATA_UPDATED_EVENT, onUpdated);
        window.clearInterval(interval);
    };
}
