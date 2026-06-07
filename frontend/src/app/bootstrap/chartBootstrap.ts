/**
 * chartBootstrap — lazy chart module loading and chart type registration.
 *
 * Extracted from app.ts to keep the orchestrator slim.
 * The `ensureReady()` call is idempotent: safe to call multiple times.
 */

import { registerChartType } from '../../charts/registry.js';
import { FallbackChart } from '../../charts/fallback.js';
import type { ChartInstance, ViewSnapshot } from '../../types.js';

export interface ChartModules {
    fetchMetadata: (signal?: AbortSignal) => Promise<import('../../types.js').DatasetMetadata>;
    fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<import('../../types.js').DataObject>;
    fetchAnomalies: (start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<import('../../types.js').AnomalyResponse>;
    postTransform: (expression: string, outputName: string) => Promise<import('../../types.js').TransformResponse>;
    DataChartCtor: (new (
        containerId: string,
        onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => ChartInstance) | null;
}

let modules: ChartModules | null = null;
let pending: Promise<ChartModules> | null = null;

export interface BootstrapChartCallbacks {
    onZoom: ((view: ViewSnapshot, sourceKind: string) => void) | null;
    onYRange: ((min: number, max: number, sourceKind: string) => void) | null;
    onZoomOut: (() => void) | null;
}

export async function ensureChartModules(): Promise<ChartModules> {
    if (modules) return modules;
    if (pending) return pending;

    pending = (async () => {
        const [dataClient, chartModule] = await Promise.all([
            import('../../services/api/index.js'),
            import('../../chart/DataChart.js'),
        ]);
        const result: ChartModules = {
            fetchMetadata: dataClient.fetchMetadata,
            fetchData: dataClient.fetchData,
            fetchAnomalies: dataClient.fetchAnomalies,
            postTransform: dataClient.postTransform,
            DataChartCtor: chartModule.DataChart,
        };

        const { DataChartCtor } = result;
        registerChartType('line', {
            label: 'Line',
            create: (containerId: string, callbacks: Record<string, unknown>) => {
                if (!DataChartCtor) throw new Error('DataChart module not loaded');
                const cb = callbacks as unknown as BootstrapChartCallbacks;
                return new DataChartCtor(
                    containerId,
                    cb.onZoom ?? null,
                    cb.onYRange ?? null,
                    cb.onZoomOut ?? null,
                );
            },
        });
        registerChartType('fallback', {
            label: 'Fallback (Canvas 2D)',
            create: (containerId: string) => new FallbackChart(containerId),
        });

        modules = result;
        return result;
    })();

    return pending;
}

export function getChartModules(): ChartModules | null {
    return modules;
}
