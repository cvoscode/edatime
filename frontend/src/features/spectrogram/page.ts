/**
 * Spectrogram page — thin delegator to spectrogramChartRuntime.
 */
import { createSpectrogramChartRuntime, __resetSpectrogramChartRuntimeForTests } from './runtime.js';
import { initSpectrogramHelp } from './help.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

let spectrogramRuntime: ReturnType<typeof createSpectrogramChartRuntime> | null = null;
let spectrogramPageCleanup: (() => void) | null = null;

export async function initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void> {
    spectrogramPageCleanup?.();
    spectrogramRuntime = createSpectrogramChartRuntime(deps);
    spectrogramPageCleanup = spectrogramRuntime.mount();
    // This feature can be loaded after the router has already displayed its
    // page. Activate its local lifecycle directly instead of relying on a
    // synthetic global page-change event.
    spectrogramRuntime.activate();
    // Page-level "?" help button. Idempotent so safe to call on every
    // page init.
    initSpectrogramHelp();
}

export function __resetSpectrogramPageForTests(): void {
    spectrogramPageCleanup?.();
    spectrogramPageCleanup = null;
    spectrogramRuntime = null;
    __resetSpectrogramChartRuntimeForTests();
}
