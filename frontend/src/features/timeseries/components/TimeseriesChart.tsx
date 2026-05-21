/**
 * domain/timeseries/components/TimeseriesChart.tsx
 *
 * Wraps ChartView with timeseries-specific callbacks and prop mapping.
 * All chart engine logic stays in ChartView; this component maps domain
 * store state to ChartView props and wires up update callbacks.
 */
import { Component, createSignal } from 'solid-js';
import { chartStore } from '../../../stores/chartStore';
import { timeseriesStore } from '../../../domain/timeseries/store';
import { useAdaptiveFilters } from '../hooks/useAdaptiveFilters';
import ChartView from '../../../components/chart/ChartView';
import type { RollingBandData, AnomalyRegionData } from '../../../types';
import type { ChartUpdateFn } from '../types';

interface TimeseriesChartProps {
    onChartReady?: (instance: any) => void;
    onEngineReady?: (name: string) => void;
    rollingBands?: RollingBandData[];
    anomalyRegions?: AnomalyRegionData[];
}

const TimeseriesChart: Component<TimeseriesChartProps> = (props) => {
    const [chartUpdateFn, setChartUpdateFn] = createSignal<ChartUpdateFn | null>(null);
    const [chartReady, setChartReady] = createSignal(false);

    const {
        adaptiveLineFilters,
        pendingAdaptivePoint,
        setPendingAdaptivePoint,
        setPopupScreenPos,
    } = useAdaptiveFilters();

    const handleChartReady = (updateFn: ChartUpdateFn, chartInstance?: any) => {
        setChartUpdateFn(() => updateFn);
        setChartReady(true);
        props.onChartReady?.(chartInstance);
    };

    const handleZoom = (start: number, end: number, yMin?: number, yMax?: number) => {
        chartStore.setYAuto(false);
        const current = chartStore.state.viewport;
        chartStore.setViewport({
            xMin: start,
            xMax: end,
            yMin: yMin ?? current.yMin,
            yMax: yMax ?? current.yMax,
        });
    };

    const handleZoomOut = () => {
        chartStore.stepBackZoom();
    };

    const handleCtrlClick = (dataX: number, dataY: number, clientX: number, clientY: number) => {
        const pending = pendingAdaptivePoint();
        if (!pending) {
            setPendingAdaptivePoint({ x1: dataX, y1: dataY, x2: null, y2: null });
            setPopupScreenPos({ x: clientX, y: clientY });
        } else if (pending.x2 === null) {
            setPendingAdaptivePoint({ ...pending, x2: dataX, y2: dataY });
            setPopupScreenPos({ x: clientX, y: clientY });
        }
    };

    const drawTool = timeseriesStore.getDrawTool();
    const drawColor = timeseriesStore.getDrawColor();
    const drawWidth = timeseriesStore.getDrawWidth();

    return (
        <ChartView
            containerId="timeseries-chart"
            onReady={handleChartReady}
            onChartReady={props.onChartReady}
            onEngineReady={props.onEngineReady}
            onZoom={handleZoom}
            onZoomOut={handleZoomOut}
            onCtrlClick={handleCtrlClick}
            rollingBands={props.rollingBands ?? timeseriesStore.state.rollingBands}
            anomalyRegions={props.anomalyRegions ?? timeseriesStore.state.anomalyRegions}
            drawMode={drawTool() === 'zoom' ? 'zoom' : drawTool() === 'none' ? 'pan' : drawTool() as 'pan'}
            drawColor={drawColor()}
            drawWidth={drawWidth()}
            chartTitle={timeseriesStore.state.chartTitle}
            xAxisLabel={timeseriesStore.state.xAxisLabel}
            yAxisLabel={timeseriesStore.state.yAxisLabel}
            pendingAdaptivePoint={pendingAdaptivePoint()}
            adaptiveLineFilters={adaptiveLineFilters()}
        />
    );
};

export default TimeseriesChart;