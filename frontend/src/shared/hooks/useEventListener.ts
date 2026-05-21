/**
 * useEventListener — registers a global event listener with automatic cleanup.
 *
 * Shorthand for addEventListener + onCleanup(removeEventListener).
 * Works for window, document, or any EventTarget.
 *
 * @example
 * useEventListener(window, 'keydown', handleKeyDown);
 * useEventListener(document, 'mousedown', handleOutsideClick);
 */
import { createEffect, onCleanup } from 'solid-js';

export function useEventListener(
    target: EventTarget | (() => EventTarget | null),
    event: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions
): void {
    const handlerFn = (e: Event) => handler(e);

    createEffect(() => {
        const el = typeof target === 'function' ? target() : target;
        if (!el) return;

        el.addEventListener(event, handlerFn, options);
        onCleanup(() => el.removeEventListener(event, handlerFn, options));
    });
}