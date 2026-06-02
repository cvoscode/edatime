/**
 * Page module registration.
 * Consumed by app.ts to register all analysis page entrypoints.
 */

import { register } from './pageRegistry.js';
import type { DatasetMetadata } from '../types.js';

type EntrypointCreator = (deps: Record<string, unknown>) => { init: () => void | Promise<void> };

// Lazy-loaded so tree-shaking works for pages the user never opens.
export async function loadEntrypoints(deps: {
    getRenderTimeseries: () => void;
    showPage: (name: string) => void;
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    getMetadata: () => DatasetMetadata | null;
    chipColor: (col: string, idx: number) => string;
    numericColumns: () => string[];
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    initDriftPage: (metadata: unknown) => void;
}): Promise<void> {
    const [
        { createFftEntrypoint },
        { createHeatmapEntrypoint },
        { createScatterEntrypoint },
        { createSpectrogramEntrypoint },
        { createCausalEntrypoint },
        { createDriftEntrypoint },
    ] = await Promise.all([
        import('../features/fft/entrypoint.js'),
        import('../features/heatmap/entrypoint.js'),
        import('../features/scatter/entrypoint.js'),
        import('../features/spectrogram/entrypoint.js'),
        import('../features/causal/entrypoint.js'),
        import('../features/drift/entrypoint.js'),
    ]);

    register('fft', {
        requiresMetadata: true,
        init: createFftEntrypoint({ getRenderTimeseries: deps.getRenderTimeseries }).init,
    });
    register('heatmap', {
        requiresMetadata: true,
        init: createHeatmapEntrypoint({ showPage: deps.showPage }).init,
    });
    register('scatter', {
        requiresMetadata: true,
        init: createScatterEntrypoint({
            initScatterPage: deps.initScatterPage,
            getMetadata: () => deps.getMetadata()!,
        }).init,
    });
    register('spectrogram', {
        requiresMetadata: true,
        init: createSpectrogramEntrypoint({ setLoading: deps.setLoading }).init,
    });
    register('causal', {
        requiresMetadata: true,
        init: createCausalEntrypoint({
            getMetadata: deps.getMetadata,
            chipColor: deps.chipColor,
            numericColumns: deps.numericColumns,
            setLoading: deps.setLoading,
        }).init,
    });
    register('drift', {
        requiresMetadata: true,
        init: createDriftEntrypoint({ initDriftPage: deps.initDriftPage, getMetadata: () => deps.getMetadata()! }).init,
    });
}