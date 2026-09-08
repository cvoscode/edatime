/** Collapse secondary toolbar groups only when their rendered row overflows. */
export function initAdaptiveToolbarOverflow(root: ParentNode = document): () => void {
    const abort = new AbortController();
    const cleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLDetailsElement>('details[data-collapse-on-overflow]').forEach((details) => {
        const toolbar = details.closest<HTMLElement>('.scatter-toolbar');
        if (!toolbar) return;
        let frame: number | null = null;
        let lastWidth = -1;
        const measure = () => {
            frame = null;
            const width = Math.round(toolbar.getBoundingClientRect().width || toolbar.clientWidth);
            if (width <= 0 || width === lastWidth) return;
            lastWidth = width;
            details.open = true;
            const groups = Array.from(toolbar.querySelectorAll<HTMLElement>('.scatter-toolbar__segment'))
                .filter((group) => !group.hidden && group.getClientRects().length > 0);
            const firstTop = groups[0]?.getBoundingClientRect().top;
            const wrapped = firstTop !== undefined
                && groups.some((group) => Math.abs(group.getBoundingClientRect().top - firstTop) > 4);
            const overflowed = wrapped || toolbar.scrollWidth > toolbar.clientWidth + 1;
            details.dataset.toolbarOverflowed = String(overflowed);
            details.open = !overflowed;
        };
        const schedule = () => {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
        observer?.observe(toolbar);
        window.addEventListener('resize', schedule, { signal: abort.signal });
        schedule();
        cleanups.push(() => {
            observer?.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
            details.open = true;
            delete details.dataset.toolbarOverflowed;
        });
    });
    return () => {
        abort.abort();
        cleanups.forEach((cleanup) => cleanup());
    };
}
