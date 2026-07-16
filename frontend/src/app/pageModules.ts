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

import type { FeatureRegistry } from './featureRegistry.js';
import type { CleaningPlanStore } from '../cleaning/store.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';
import { ensureStyleModule, type StyleModuleName } from '../utils/pageStyles.js';

export interface PageDescriptorInitDeps {
    getRenderTimeseries: () => void;
    showPage: (name: string) => void;
    chipColor: (col: string, idx: number) => string;
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    onCleaningPlanChanged: () => void;
    cleaningPlanStore: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage'>;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'subscribe'>;
}

export interface PageDescriptor {
    name: string;
    requiresMetadata: boolean;
    cssModules?: readonly StyleModuleName[];
    load(deps: PageDescriptorInitDeps): Promise<{
        init: () => void | (() => void) | Promise<void | (() => void)>;
    }>;
}

/**
 * Built-in descriptor registry. Each entry is metadata-only and never
 * triggers a page implementation import at registration time.
 */
const PAGE_DESCRIPTORS: readonly PageDescriptor[] = [
    {
        name: 'prepare',
        requiresMetadata: true,
        async load(deps) {
            const { initPreparePage } = await import('../features/prepare/index.js');
            return { init: () => initPreparePage({ onPlanChanged: deps.onCleaningPlanChanged }) };
        },
    },
    {
        name: 'fft',
        requiresMetadata: true,
        async load(deps) {
            const { initFftPage } = await import('../features/fft/index.js');
            return { init: () => initFftPage({ renderTimeseries: deps.getRenderTimeseries, workspace: deps.workspace }) };
        },
    },
    {
        name: 'heatmap',
        requiresMetadata: true,
        async load(deps) {
            const { initHeatmapPage } = await import('../features/heatmap/index.js');
            return {
                init: () => initHeatmapPage({
                    showPage: deps.showPage,
                    cleaningPlanStore: deps.cleaningPlanStore,
                    onPlanChanged: deps.onCleaningPlanChanged,
                }),
            };
        },
    },
    {
        name: 'scatter',
        requiresMetadata: true,
        // Page-owned stylesheet is preloaded alongside the descriptor to avoid
        // an unsightly flash of unstyled content on first navigation.
        cssModules: ['scatter'],
        async load(deps) {
            const { initScatterPage } = await import('../features/scatter/index.js');
            const metadata = deps.workspace.getSnapshot().dataset.metadata;
            return { init: () => metadata ? initScatterPage(metadata, { workspace: deps.workspace }) : undefined };
        },
    },
    {
        name: 'spectrogram',
        requiresMetadata: true,
        async load(deps) {
            const { initSpectrogramPage } = await import('../features/spectrogram/index.js');
            return { init: () => initSpectrogramPage({ setLoading: deps.setLoading, workspace: deps.workspace }) };
        },
    },
    {
        name: 'causal',
        requiresMetadata: true,
        async load(deps) {
            const { initCausalPage } = await import('../features/causal/index.js');
            return {
                init: () => initCausalPage({
                    workspace: deps.workspace,
                    chipColor: deps.chipColor,
                    setLoading: deps.setLoading,
                }),
            };
        },
    },
    {
        name: 'drift',
        requiresMetadata: true,
        cssModules: ['drift'],
        async load(deps) {
            const { initDriftPage } = await import('../features/drift/index.js');
            const metadata = deps.workspace.getSnapshot().dataset.metadata;
            return { init: () => initDriftPage(metadata, { workspace: deps.workspace }) };
        },
    },
];

/**
 * Register all built-in page descriptors. The descriptors are registered
 * eagerly but their modules are not loaded until the page is navigated to.
 */
export async function loadPageDescriptors(registry: FeatureRegistry, deps: PageDescriptorInitDeps): Promise<void> {
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
                return entry.init();
            },
        });
    }
}
