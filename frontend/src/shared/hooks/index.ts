/**
 * shared/hooks — cross-feature reusable hooks.
 *
 * Usage:
 *   import { useAbortController, useDebounce } from '@/shared/hooks';
 */
export { useAbortController, type AbortControllerResult } from './useAbortController';
export { useDebounce } from './useDebounce';
export { useResizeObserver, type UseResizeObserverResult } from './useResizeObserver';
export { useEventListener } from './useEventListener';