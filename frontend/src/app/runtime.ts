import { createLifecycleScope } from '../platform/lifecycleScope.js';

export function createAppRuntime() {
    const scope = createLifecycleScope();
    return {
        signal: scope.signal,
        registerCleanup(fn: () => void) {
            return scope.add(fn);
        },
        dispose() {
            scope.dispose();
        },
    };
}
