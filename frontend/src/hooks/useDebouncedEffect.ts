import { createEffect, onCleanup } from 'solid-js';

export function useDebouncedEffect<T>(
  source: () => T,
  fn: (value: T) => void,
  delay: number
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    const value = source();
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(value);
    }, delay);
  });

  onCleanup(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}