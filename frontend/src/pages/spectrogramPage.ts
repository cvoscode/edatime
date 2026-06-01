/**
 * Spectrogram page — thin delegator to spectrogramChartRuntime.
 */
import { createSpectrogramChartRuntime } from './spectrogramChartRuntime.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

let spectrogramRuntime: ReturnType<typeof createSpectrogramChartRuntime> | null = null;

export async function initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void> {
    spectrogramRuntime = createSpectrogramChartRuntime(deps);
    spectrogramRuntime.mount();
}