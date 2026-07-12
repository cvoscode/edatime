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

export async function initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void> {
    spectrogramRuntime = createSpectrogramChartRuntime(deps);
    spectrogramRuntime.mount();
    // Page-level "?" help button. Idempotent so safe to call on every
    // page init.
    initSpectrogramHelp();
}

export function __resetSpectrogramPageForTests(): void {
    spectrogramRuntime = null;
    __resetSpectrogramChartRuntimeForTests();
}
