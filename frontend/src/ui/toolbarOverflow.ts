/** Disposable overflow controller for a toolbar using the shared toolbar markup. */

interface SegmentInfo {
    segment: HTMLElement;
    fields: HTMLElement;
    overflow: HTMLElement;
    overflowMenu: HTMLElement;
    inlineChildren: HTMLElement[];
    popped: HTMLElement[];
}

export interface ToolbarOverflowController {
    refresh(): void;
    close(): void;
    dispose(): void;
    rebalanceNow(): void;
}

function restoreInlineOrder(info: SegmentInfo): void {
    for (const child of info.inlineChildren) info.fields.insertBefore(child, info.overflow);
    info.popped = [];
    info.overflowMenu.replaceChildren();
}

function registerSegment(segment: HTMLElement): SegmentInfo | null {
    const fields = segment.querySelector<HTMLElement>(':scope > .scatter-toolbar__fields');
    const overflow = fields?.querySelector<HTMLElement>(':scope > .scatter-toolbar__overflow');
    const overflowMenu = overflow?.querySelector<HTMLElement>('.scatter-toolbar__overflow-menu');
    if (!fields || !overflow || !overflowMenu) return null;
    const inlineChildren = Array.from(fields.children).filter(
        (child) => child !== overflow && child instanceof HTMLElement,
    ) as HTMLElement[];
    return { segment, fields, overflow, overflowMenu, inlineChildren, popped: [] };
}

function rebalanceSegment(info: SegmentInfo): void {
    restoreInlineOrder(info);
    const firstTop = info.inlineChildren[0]?.offsetTop;
    if (firstTop == null) return;
    const wrapped = info.inlineChildren.filter((child) => child.offsetTop - firstTop > 4);
    if (wrapped.length === 0) {
        info.segment.removeAttribute('data-overflow');
        info.overflow.hidden = true;
        return;
    }
    for (const child of wrapped) info.overflowMenu.appendChild(child);
    info.popped = wrapped;
    info.segment.setAttribute('data-overflow', 'true');
    info.overflow.hidden = false;
    const summary = info.overflow.querySelector<HTMLElement>('.scatter-toolbar__overflow-btn');
    if (summary) {
        const label = wrapped.length === 1 ? '1 hidden option' : `${wrapped.length} hidden options`;
        summary.setAttribute('aria-label', label);
        summary.setAttribute('title', label);
    }
}

/** Creates a toolbar-local controller, or `null` when no overflow popout exists. */
export function createToolbarOverflow(toolbar: HTMLElement): ToolbarOverflowController | null {
    const segments = Array.from(toolbar.querySelectorAll<HTMLElement>('.scatter-toolbar__segment'))
        .map(registerSegment)
        .filter((segment): segment is SegmentInfo => segment !== null);
    if (segments.length === 0) return null;

    let observer: ResizeObserver | null = null;
    let frameId: number | null = null;
    let disposed = false;
    const rebalanceNow = () => {
        if (disposed) return;
        for (const segment of segments) rebalanceSegment(segment);
    };
    const refresh = () => {
        if (disposed || frameId !== null) return;
        frameId = requestAnimationFrame(() => {
            frameId = null;
            rebalanceNow();
        });
    };
    if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(refresh);
        observer.observe(toolbar);
    }
    refresh();

    return {
        refresh,
        rebalanceNow,
        close() { for (const segment of segments) segment.overflow.removeAttribute('open'); },
        dispose() {
            if (disposed) return;
            disposed = true;
            observer?.disconnect();
            observer = null;
            if (frameId !== null) cancelAnimationFrame(frameId);
            frameId = null;
            for (const segment of segments) restoreInlineOrder(segment);
        },
    };
}
