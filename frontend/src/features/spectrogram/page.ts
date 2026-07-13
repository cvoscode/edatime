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

export function disposeSpectrogramPage(): void {
    spectrogramPageCleanup?.();
    spectrogramPageCleanup = null;
    spectrogramRuntime = null;
    __resetSpectrogramChartRuntimeForTests();
}

export async function initSpectrogramPage(deps: SpectrogramPageDeps): Promise<() => void> {
    disposeSpectrogramPage();
    spectrogramRuntime = createSpectrogramChartRuntime(deps);
    const disposeRuntime = spectrogramRuntime.mount();
    // This feature can be loaded after the router has already displayed its
    // page. Activate its local lifecycle directly instead of relying on a
    // synthetic global page-change event.
    spectrogramRuntime.activate();
    // Page-level "?" help button. Idempotent so safe to call on every
    // page init.
    const disposeHelp = initSpectrogramHelp();
    spectrogramPageCleanup = () => {
        disposeHelp();
        disposeRuntime();
    };
    return disposeSpectrogramPage;
}

export function __resetSpectrogramPageForTests(): void {
    disposeSpectrogramPage();
}
