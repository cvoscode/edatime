/** Generic function helpers with no DOM dependency. */

/** Delays `fn` until `ms` milliseconds after the most recent call. */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(...args); }, ms);
    }) as unknown as T;
}
