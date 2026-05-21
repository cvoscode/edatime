/**
 * useResizeObserver — observes an element's size and calls callback on changes.
 *
 * Uses ResizeObserver with a cleanup function returned.
 * The callback receives the ResizeObserverEntry array.
 *
 * @example
 * const { observe, unobserve } = useResizeObserver((entries) => {
 *   const { width, height } = entries[0].contentRect;
 *   chartController.resize(width, height);
 * });
 * observe(containerRef());
 */
import { onCleanup } from 'solid-js';

export interface ResizeObserverEntry {
    target: Element;
    contentRect: { width: number; height: number; x: number; y: number };
}

export interface UseResizeObserverResult {
    observe: (element: Element) => void;
    unobserve: (element: Element) => void;
    disconnect: () => void;
}

export function useResizeObserver(
    callback: (entries: ResizeObserverEntry[]) => void
): UseResizeObserverResult {
    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver((entries) => {
            callback(
                entries.map((e) => ({
                    target: e.target,
                    contentRect: {
                        width: e.contentRect.width,
                        height: e.contentRect.height,
                        x: e.contentRect.x,
                        y: e.contentRect.y,
                    },
                }))
            );
        });
    }

    onCleanup(() => {
        observer?.disconnect();
    });

    return {
        observe: (element) => observer?.observe(element),
        unobserve: (element) => observer?.unobserve(element),
        disconnect: () => observer?.disconnect(),
    };
}