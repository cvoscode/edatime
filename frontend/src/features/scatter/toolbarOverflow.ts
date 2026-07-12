/**
 * Per-segment overflow popout for the scatter toolbar.
 *
 * Each `.scatter-toolbar__segment` that has more than one field is
 * given a `<details class="scatter-toolbar__overflow">` element with
 * an empty menu. When the segment wraps to multiple rows, the
 * overflowing fields are moved into the popout menu and the
 * "⋯" button is shown by toggling `data-overflow="true"` on the
 * segment. When the segment fits everything on one row, the fields
 * are restored to the inline row and the button is hidden.
 *
 * This is purely a presentation concern — the underlying field
 * markup, ids, and event listeners are preserved when fields are
 * moved between the inline row and the popout.
 *
 * The rebalance is driven by a single ResizeObserver on the
 * toolbar element, so resizing the window or any segment width
 * change updates the overflow state without per-element listeners.
 *
 * Activation is a no-op when the page is hidden (e.g. the user is
 * on a different page), so the observer does not run on inactive
 * segments.
 */

const OVERFLOW_BTN_LABEL = 'More options';

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

function restoreInlineOrder(info: SegmentInfo): void {
    for (const child of info.inlineChildren) {
        info.fields.insertBefore(child, info.overflow);
    }
    info.popped = [];
    info.overflowMenu.replaceChildren();
}

/** Find all `<details class="scatter-toolbar__overflow">` blocks within
 *  the given segment and register the segment for overflow handling.
 *
 *  Returns true when at least one overflow popout was registered. */
function registerSegment(segment: HTMLElement): boolean {
    const fields = segment.querySelector<HTMLElement>(':scope > .scatter-toolbar__fields');
    if (!fields) return false;
    const overflow = segment.querySelector<HTMLElement>(':scope > .scatter-toolbar__fields > .scatter-toolbar__overflow');
    if (!overflow) return false;
    const overflowMenu = overflow.querySelector<HTMLElement>('.scatter-toolbar__overflow-menu');
    if (!overflowMenu) return false;

    // Snapshot the original field children in document order. These
    // are the elements that participate in overflow — anything we
    // append to the popout must come from this set, and they must
    // be restored to their original positions when no longer
    // overflowing.
    const inlineChildren = Array.from(fields.children).filter(
        (child) => child !== overflow && child instanceof HTMLElement,
    ) as HTMLElement[];

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
 *  the inline row.
 *
 *  The threshold for "wrapped" is the top offset of the first
 *  inline child plus 4px of slop. This is intentionally tolerant
 *  of sub-pixel rounding that varies between viewports. */
function rebalanceSegment(info: SegmentInfo): void {
    if (info.inlineChildren.length === 0) {
        info.segment.removeAttribute('data-overflow');
        info.overflow.hidden = true;
        return;
    }
    // Popped fields live inside an absolute details menu, where offsetTop no
    // longer describes their position in the inline toolbar row. Restore first
    // so every measurement below comes from the same layout context.
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
    // Move wrapped fields into the popout, in their original row order.
    for (const child of wrapped) {
        info.overflowMenu.appendChild(child);
    }
    info.popped = wrapped;
    info.segment.setAttribute('data-overflow', 'true');
    info.overflow.hidden = false;
    // Update the summary label so screen readers know how many
    // fields are in the popout.
    const summary = info.overflow.querySelector<HTMLElement>('.scatter-toolbar__overflow-btn');
    if (summary) {
        const label = wrapped.length === 1 ? '1 hidden option' : `${wrapped.length} hidden options`;
        summary.setAttribute('aria-label', label);
        summary.setAttribute('title', label);
    }
}

let observer: ResizeObserver | null = null;
/** True when a rebalance is queued for the next animation frame.
 *  Tracked as a boolean rather than the rAF handle because the
 *  handle is a positive integer and `null` checks don't reliably
 *  distinguish "no frame scheduled" from "frame scheduled with
 *  handle 0" — using a boolean keeps the guard simple. */
let scheduled = false;

/** Schedule a rebalance on the next animation frame so we don't
 *  thrash the layout on every ResizeObserver tick. */
function scheduleRebalance(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        for (const info of segments) rebalanceSegment(info);
    });
}

/** Walk the scatter toolbar and register every segment that hosts
 *  an overflow popout. Idempotent — safe to call after the page
 *  content is rebuilt.
 *
 *  Returns true if at least one segment was registered. */
export function initToolbarOverflow(toolbar: HTMLElement): boolean {
    if (segments.length > 0) return true;
    const list = toolbar.querySelectorAll<HTMLElement>('.scatter-toolbar__segment');
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
    observer.observe(toolbar);
    scheduleRebalance();
    return true;
}

/** Legacy alias preserved so existing scatter / timeseries callers
 *  continue to compile without churn. Prefer `initToolbarOverflow`
 *  for any new page (e.g. the heatmap). */
export const initScatterToolbarOverflow = initToolbarOverflow;

/** Test/teardown helper — re-runs the rebalance pass over every
 *  registered segment. Used after the density sub-group or other
 *  dynamically-toggled fields change visibility, so the wrap
 *  detection sees the new layout. */
export function refreshScatterToolbarOverflow(): void {
    scheduleRebalance();
}

/** Test helper — run the rebalance synchronously, bypassing the
 *  requestAnimationFrame debounce. Not used in production code. */
export function _runScatterToolbarOverflowNowForTests(): void {
    for (const info of segments) rebalanceSegment(info);
}

/** Test helper — tear down the registered segments and the
 *  ResizeObserver so subsequent `initScatterToolbarOverflow` calls
 *  start from a clean slate. Not used in production code. */
export function _resetScatterToolbarOverflowForTests(): void {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    scheduled = false;
    // Restore any popped fields to their original parents so the
    // host document is in a clean state for the next test.
    for (const info of segments) {
        for (const child of info.popped) {
            info.fields.insertBefore(child, info.overflow);
        }
        info.popped = [];
    }
    segments.length = 0;
}

/** Close any open overflow popouts. Used before the user clicks
 *  the chart so the popout doesn't overlap the click target. */
export function closeScatterToolbarOverflow(): void {
    for (const info of segments) {
        if (info.overflow.hasAttribute('open')) info.overflow.removeAttribute('open');
    }
}
