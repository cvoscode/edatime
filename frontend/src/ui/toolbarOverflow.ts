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

export interface ToolbarOverflowOptions {
    /** Selector for one segment's direct field container. */
    fieldsSelector?: string;
    /** Show the number of moved fields in the overflow summary. */
    showCount?: boolean;
}

function restoreInlineOrder(info: SegmentInfo): void {
    for (const child of info.inlineChildren) info.fields.insertBefore(child, info.overflow);
    info.popped = [];
    info.overflowMenu.replaceChildren();
}

function registerSegment(segment: HTMLElement, fieldsSelector: string): SegmentInfo | null {
    const fields = segment.querySelector<HTMLElement>(fieldsSelector);
    const overflow = fields?.querySelector<HTMLElement>(':scope > .scatter-toolbar__overflow');
    const overflowMenu = overflow?.querySelector<HTMLElement>('.scatter-toolbar__overflow-menu');
    if (!fields || !overflow || !overflowMenu) return null;
    const inlineChildren = Array.from(fields.children).filter(
        (child) => child !== overflow && child instanceof HTMLElement,
    ) as HTMLElement[];
    return { segment, fields, overflow, overflowMenu, inlineChildren, popped: [] };
}

function updateOverflowSummary(info: SegmentInfo, count: number, showCount: boolean): void {
    const summary = info.overflow.querySelector<HTMLElement>('.scatter-toolbar__overflow-btn');
    if (!summary) return;
    const label = count === 1 ? '1 hidden option' : `${count} hidden options`;
    summary.setAttribute('aria-label', label);
    summary.setAttribute('title', label);
    if (!showCount) return;

    let badge = summary.querySelector<HTMLElement>('.scatter-toolbar__overflow-count');
    if (!badge && count > 0) {
        badge = document.createElement('span');
        badge.className = 'scatter-toolbar__overflow-count';
        const icon = summary.querySelector('.scatter-toolbar__overflow-icon');
        if (icon) summary.insertBefore(badge, icon.nextSibling); else summary.appendChild(badge);
    }
    if (!badge) return;
    badge.textContent = String(count);
    badge.hidden = count === 0;
}

function rebalanceSegment(info: SegmentInfo, showCount: boolean): void {
    restoreInlineOrder(info);
    const firstTop = info.inlineChildren[0]?.offsetTop;
    if (firstTop == null) return;
    const wrapped = info.inlineChildren.filter((child) => child.offsetTop - firstTop > 4);
    if (wrapped.length === 0) {
        info.segment.removeAttribute('data-overflow');
        info.overflow.hidden = true;
        updateOverflowSummary(info, 0, showCount);
        return;
    }
    for (const child of wrapped) info.overflowMenu.appendChild(child);
    info.popped = wrapped;
    info.segment.setAttribute('data-overflow', 'true');
    info.overflow.hidden = false;
    updateOverflowSummary(info, wrapped.length, showCount);
}

/** Creates a toolbar-local controller, or `null` when no overflow popout exists. */
export function createToolbarOverflow(
    toolbar: HTMLElement,
    options: ToolbarOverflowOptions = {},
): ToolbarOverflowController | null {
    const fieldsSelector = options.fieldsSelector ?? ':scope > .scatter-toolbar__fields';
    const showCount = options.showCount ?? false;
    const segments = Array.from(toolbar.querySelectorAll<HTMLElement>('.scatter-toolbar__segment'))
        .map((segment) => registerSegment(segment, fieldsSelector))
        .filter((segment): segment is SegmentInfo => segment !== null);
    if (segments.length === 0) return null;

    let observer: ResizeObserver | null = null;
    let frameId: number | null = null;
    let disposed = false;
    const rebalanceNow = () => {
        if (disposed) return;
        for (const segment of segments) rebalanceSegment(segment, showCount);
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
