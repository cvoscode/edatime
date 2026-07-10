/**
 * Page module registration via lazy descriptors.
 *
 * Each page is registered as a lightweight descriptor (no module imports).
 * The page implementation is dynamically imported the first time the page
 * is requested via `ensurePageModuleLoaded`. This keeps heavy page code
 * (e.g. scatter's ECharts / ChartGPU / Apache Arrow imports) out of the
 * initial app chunk.
 *
 * Public contract for a PageDescriptor:
 *   - name: unique page identifier (matches route)
 *   - requiresMetadata: whether the page needs dataset metadata before init
 *   - cssModules: optional list of CSS module names to preload (see utils/pageStyles.ts)
 *   - load: async factory returning an Initializer { init(): void | Promise<void> }
 *
 * Consumers (e.g. app.ts) call `loadPageDescriptors` once at startup to
 * register every descriptor; the underlying module is fetched on first
 * navigation. The `init` callback receives only the dependencies it
 * declared, so no descriptor pulls in the rest of the app graph.
 */

import type { PageRegistry } from './pageRegistry.js';
import type { DatasetMetadata } from '../types.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';
import { ensureStyleModule, type StyleModuleName } from '../utils/pageStyles.js';

export interface PageDescriptorInitDeps {
    getRenderTimeseries: () => void;
    showPage: (name: string) => void;
    getMetadata: () => DatasetMetadata | null;
    chipColor: (col: string, idx: number) => string;
    numericColumns: () => string[];
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    initDriftPage: (metadata: unknown) => void;
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
}

export interface PageDescriptor {
    name: string;
    requiresMetadata: boolean;
    cssModules?: readonly StyleModuleName[];
    load(deps: PageDescriptorInitDeps): Promise<{ init: () => void | Promise<void> }>;
}

/**
 * Built-in descriptor registry. Each entry is metadata-only and never
 * triggers a page implementation import at registration time.
 */
const PAGE_DESCRIPTORS: readonly PageDescriptor[] = [
    {
        name: 'fft',
        requiresMetadata: true,
        async load(deps) {
            const { createFftEntrypoint } = await import('../features/fft/entrypoint.js');
            return createFftEntrypoint({ getRenderTimeseries: deps.getRenderTimeseries, workspace: deps.workspace });
        },
    },
    {
        name: 'heatmap',
        requiresMetadata: true,
        async load(deps) {
            const { createHeatmapEntrypoint } = await import('../features/heatmap/entrypoint.js');
            return createHeatmapEntrypoint({ showPage: deps.showPage });
        },
    },
    {
        name: 'scatter',
        requiresMetadata: true,
        // Page-owned stylesheet is preloaded alongside the descriptor to avoid
        // an unsightly flash of unstyled content on first navigation.
        cssModules: ['scatter'],
        async load(deps) {
            const { createScatterEntrypoint } = await import('../features/scatter/entrypoint.js');
            return createScatterEntrypoint({
                getMetadata: () => deps.getMetadata()!,
                workspace: deps.workspace,
            });
        },
    },
    {
        name: 'spectrogram',
        requiresMetadata: true,
        async load(deps) {
            const { createSpectrogramEntrypoint } = await import('../features/spectrogram/entrypoint.js');
            return createSpectrogramEntrypoint({ setLoading: deps.setLoading, workspace: deps.workspace });
        },
    },
    {
        name: 'causal',
        requiresMetadata: true,
        async load(deps) {
            const { createCausalEntrypoint } = await import('../features/causal/entrypoint.js');
            return createCausalEntrypoint({
                workspace: deps.workspace,
                chipColor: deps.chipColor,
                setLoading: deps.setLoading,
            });
        },
    },
    {
        name: 'drift',
        requiresMetadata: true,
        cssModules: ['drift'],
        async load(deps) {
            const { createDriftEntrypoint } = await import('../features/drift/entrypoint.js');
            return createDriftEntrypoint({
                initDriftPage: deps.initDriftPage,
                getMetadata: () => deps.getMetadata()!,
            });
        },
    },
];

/**
 * Register all built-in page descriptors. The descriptors are registered
 * eagerly but their modules are not loaded until the page is navigated to.
 */
export async function loadPageDescriptors(registry: PageRegistry, deps: PageDescriptorInitDeps): Promise<void> {
    for (const descriptor of PAGE_DESCRIPTORS) {
        registry.register(descriptor.name, {
            requiresMetadata: descriptor.requiresMetadata,
            init: async () => {
                // Preload any page-owned CSS modules before initializing the page.
                if (descriptor.cssModules?.length) {
                    for (const moduleName of descriptor.cssModules) {
                        ensureStyleModule(moduleName);
                    }
                }
                const entry = await descriptor.load(deps);
                await entry.init();
            },
        });
    }
}
