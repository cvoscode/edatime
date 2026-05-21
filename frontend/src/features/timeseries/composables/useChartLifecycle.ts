/**
 * useChartLifecycle — composable that manages ChartView lifecycle state.
 *
 * Encapsulates: chartReady, chartInstance, chartEngine, updateChartFn signals,
 * and the handleChartReady/handleEngineReady callbacks used by ChartView.
 *
 * This replaces the pattern where TimeseriesPage had 5+ signals and callbacks
 * for managing chart lifecycle, making the component's chart wiring declarative.
 *
 * @example
 * const lifecycle = useChartLifecycle();
 *
 * return (
 *   <ChartView
 *     onChartReady={lifecycle.onChartReady}
 *     onEngineReady={lifecycle.onEngineReady}
 *     ...
 *   />
 * );
 */
import { createSignal, Accessor } from 'solid-js';

export type ChartUpdateFn = (
    series: any[],
    xMin?: number,
    xMax?: number,
    yMin?: number,
    yMax?: number
) => void;

export interface UseChartLifecycleReturn {
    /** Signal: true once ChartView calls onChartReady */
    chartReady: Accessor<boolean>;
    /** Signal: the chart instance (ECharts or ChartGPU) */
    chartInstance: Accessor<any>;
    /** Signal: engine name ('ChartGPU' | 'ECharts') */
    chartEngine: Accessor<string>;
    /** Signal: the update function returned by ChartView's onChartReady */
    updateChartFn: Accessor<ChartUpdateFn | null>;

    /** Pass to ChartView's onChartReady prop */
    onChartReady: (updateFn: ChartUpdateFn, chartInstance?: any) => void;
    /** Pass to ChartView's onEngineReady prop */
    onEngineReady: (engineName: string) => void;
}

export function useChartLifecycle(): UseChartLifecycleReturn {
    const [chartReady, setChartReady] = createSignal(false);
    const [chartInstance, setChartInstance] = createSignal<any>(null);
    const [chartEngine, setChartEngine] = createSignal<string>('');
    const [updateChartFn, setUpdateChartFn] = createSignal<ChartUpdateFn | null>(null);

    const onChartReady = (updateFn: ChartUpdateFn, instance?: any) => {
        setUpdateChartFn(() => updateFn);
        setChartReady(true);
        if (instance) setChartInstance(instance);
    };

    const onEngineReady = (engineName: string) => {
        setChartEngine(engineName);
    };

    return {
        chartReady,
        chartInstance,
        chartEngine,
        updateChartFn,
        onChartReady,
        onEngineReady,
    };
}