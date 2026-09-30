/**
 * Spectrogram page — thin delegator to spectrogramChartRuntime.
 */
import { createSpectrogramChartRuntime } from './runtime.js';
import { initSpectrogramHelp } from './help.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

// Disposer of the mounted instance, so a re-init never leaves two instances
// bound to the same DOM. All page state lives in the runtime instance.
let disposeActiveInstance: (() => void) | null = null;

/** Release the current Spectrogram feature instance and its page-owned resources. */
export function disposeSpectrogramPage(): void {
    disposeActiveInstance?.();
}

export async function initSpectrogramPage(deps: SpectrogramPageDeps): Promise<() => void> {
    disposeSpectrogramPage();
    const runtime = createSpectrogramChartRuntime(deps);
    const disposeRuntime = runtime.mount();
    // This feature can be loaded after the router has already displayed its
    // page. Activate its local lifecycle directly instead of relying on a
    // synthetic global page-change event.
    runtime.activate();
    // Page-level "?" help button. Idempotent so safe to call on every
    // page init.
    const disposeHelp = initSpectrogramHelp();
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        if (disposeActiveInstance === dispose) disposeActiveInstance = null;
        disposeHelp();
        disposeRuntime();
    };
    disposeActiveInstance = dispose;
    return dispose;
}
