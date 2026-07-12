/**
 * Per-segment overflow popout for the timeseries utility shelf.
 *
 * Mirrors `frontend/src/scatter/toolbarOverflow.ts`: each
 * `.scatter-toolbar__segment` inside the timeseries shelf that
 * carries a `<details class="scatter-toolbar__overflow">` popout
 * is registered. When its field row wraps to a second line, the
 * overflowing fields are moved into the popout and the
 * "⋯ N hidden" pill is shown via `data-overflow="true"`. When
 * the row fits on one line, fields are restored and the pill is
 * hidden.
 *
 * The rebalance is driven by a single ResizeObserver on the
 * shelf element so resizing the window or any segment width
 * change updates the overflow state automatically.
 *
 * This is intentionally a separate module from the scatter one
 * because they own independent segment registries. The shared CSS
 * (`.scatter-toolbar__overflow`, `.scatter-toolbar__overflow-btn`,
 * `.scatter-toolbar__overflow-menu`, `.scatter-toolbar__overflow-count`)
 * lives in `toolbar.css` and is reused by both pages.
 */

interface SegmentInfo {
    segment: HTMLElement;
    fields: HTMLElement;
    overflow: HTMLElement;
    overflowMenu: HTMLElement;
    /** Original parents of fields, in their original DOM order. */
    inlineChildren: HTMLElement[];
    /** Fields currently sitting inside the popout menu. */
    popped: HTMLElement[];
}

const segments: SegmentInfo[] = [];
let observer: ResizeObserver | null = null;
let scheduled = false;

function restoreInlineOrder(info: SegmentInfo): void {
    for (const child of info.inlineChildren) {
        info.fields.insertBefore(child, info.overflow);
    }
    info.popped = [];
    info.overflowMenu.replaceChildren();
}

/** Find one `<details class="scatter-toolbar__overflow">` inside
 *  the given segment and register it for overflow handling.
 *  Returns true on success.
 *
 *  The overflow popout lives inside the segment's field row
 *  (`.scatter-toolbar__fields` or `.scatter-toolbar__controls`).
 *  The scatter page uses `.scatter-toolbar__fields`; some
 *  timeseries segments (e.g. EXPORT, QUICK RANGE) only have
 *  `.scatter-toolbar__controls`. Both are accepted here. */
function registerSegment(segment: HTMLElement): boolean {
    const fields = segment.querySelector<HTMLElement>(
        ':scope > .scatter-toolbar__fields, :scope > .scatter-toolbar__controls'
    );
    if (!fields) return false;
    const overflow = fields.querySelector<HTMLElement>(':scope > .scatter-toolbar__overflow');
    if (!overflow) return false;
    const overflowMenu = overflow.querySelector<HTMLElement>('.scatter-toolbar__overflow-menu');
    if (!overflowMenu) return false;

    const inlineChildren = Array.from(fields.children).filter(
        (child) => child !== overflow && child instanceof HTMLElement,
    ) as HTMLElement[];

    if (inlineChildren.length === 0) return false;

    segments.push({
        segment,
        fields,
        overflow,
        overflowMenu,
        inlineChildren,
        popped: [],
    });
    return true;
}

/** Inspect the segment's field row. Any field whose top offset is
 *  beyond the first row (i.e. wrapped onto a second line) is moved
 *  into the overflow popout. The remaining fields are restored to
 *  the inline row. */
function rebalanceSegment(info: SegmentInfo): void {
    if (info.inlineChildren.length === 0) {
        info.segment.removeAttribute('data-overflow');
        info.overflow.hidden = true;
        return;
    }
    // Popped fields live inside an absolute details menu where offsetTop no
    // longer describes their position in the inline toolbar row. Restore
    // first so every measurement below comes from the same layout context.
    restoreInlineOrder(info);
    const firstTop = info.inlineChildren[0].offsetTop;
    const wrapped: HTMLElement[] = [];
    for (const child of info.inlineChildren) {
        if (child.offsetTop - firstTop > 4) {
            wrapped.push(child);
        }
    }
    if (wrapped.length === 0) {
        info.segment.removeAttribute('data-overflow');
        info.overflow.hidden = true;
        return;
    }
    for (const child of wrapped) {
        info.overflowMenu.appendChild(child);
    }
    info.popped = wrapped;
    info.segment.setAttribute('data-overflow', 'true');
    info.overflow.hidden = false;
    const summary = info.overflow.querySelector<HTMLElement>('.scatter-toolbar__overflow-btn');
    if (summary) {
        const label = wrapped.length === 1 ? '1 hidden option' : `${wrapped.length} hidden options`;
        summary.setAttribute('aria-label', label);
        summary.setAttribute('title', label);
        let badge = summary.querySelector<HTMLElement>('.scatter-toolbar__overflow-count');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'scatter-toolbar__overflow-count';
            const icon = summary.querySelector('.scatter-toolbar__overflow-icon');
            if (icon) summary.insertBefore(badge, icon.nextSibling);
            else summary.appendChild(badge);
        }
        badge.textContent = String(wrapped.length);
        badge.hidden = false;
    }
}

function scheduleRebalance(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        for (const info of segments) rebalanceSegment(info);
    });
}

/** Walk the timeseries utility shelf and register every segment
 *  that hosts an overflow popout. Idempotent — safe to call after
 *  the page content is rebuilt.
 *
 *  Returns true if at least one segment was registered. */
export function initTimeseriesToolbarOverflow(shelf: HTMLElement): boolean {
    if (segments.length > 0) return true;
    const list = shelf.querySelectorAll<HTMLElement>('.scatter-toolbar__segment');
    let registered = false;
    list.forEach((segment) => {
        if (registerSegment(segment)) registered = true;
    });
    if (!registered) return false;
    if (typeof ResizeObserver === 'undefined') {
        // Best-effort fallback: do a single rebalance on the next
        // frame, then give up. The layout will still work — the
        // overflow popout simply won't react to resize.
        scheduleRebalance();
        return true;
    }
    observer = new ResizeObserver(() => scheduleRebalance());
    observer.observe(shelf);
    scheduleRebalance();
    return true;
}

/** Re-run the rebalance pass over every registered segment. Used
 *  after dynamically-toggled fields change visibility. */
export function refreshTimeseriesToolbarOverflow(): void {
    scheduleRebalance();
}

/** Close any open overflow popouts. Used before the user clicks
 *  the chart so the popout doesn't overlap the click target. */
export function closeTimeseriesToolbarOverflow(): void {
    for (const info of segments) {
        if (info.overflow.hasAttribute('open')) info.overflow.removeAttribute('open');
    }
}

/** Test/teardown helper. */
export function _resetTimeseriesToolbarOverflowForTests(): void {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    scheduled = false;
    for (const info of segments) {
        for (const child of info.popped) {
            info.fields.insertBefore(child, info.overflow);
        }
        info.popped = [];
    }
    segments.length = 0;
}
