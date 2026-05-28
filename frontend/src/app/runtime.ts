export function createAppRuntime() {
    const cleanups = new Set<() => void>();
    let disposed = false;
    return {
        registerCleanup(fn: () => void) {
            if (disposed) return () => {};
            cleanups.add(fn);
            return () => cleanups.delete(fn);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const fn of cleanups) fn();
            cleanups.clear();
        },
    };
}