import type { ChartInstance } from '../types/chart.js';

/** Owns the primary renderer resource; analysis intent belongs to WorkspaceStore. */
export function createChartResource() {
    let current: ChartInstance | null = null;
    const listeners = new Set<() => void>();
    const replace = (next: ChartInstance | null) => {
        if (current === next) return;
        const previous = current;
        current = next;
        if (previous) {
            const disposable = previous as ChartInstance & { deepDispose?: () => void; dispose?: () => void };
            try {
                if (disposable.deepDispose) disposable.deepDispose();
                else if (disposable.destroy) disposable.destroy();
                else disposable.dispose?.();
            } catch (error) {
                console.warn('[edatime:chart] renderer disposal failed:', error);
            }
        }
        for (const listener of listeners) listener();
    };
    return {
        get current() { return current; },
        replace,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        dispose() { replace(null); listeners.clear(); },
    };
}

/** The browser's primary chart slot, released by the application lifetime. */
export const primaryChart = createChartResource();
export const setPrimaryChartInstance = primaryChart.replace;
