/** Ambient type declarations for the vendored ChartGPU library. */

declare module '../../libs/chartgpu/dist/index.js' {
    export interface ChartGPUOptions {
        grid?: {
            left?: number;
            right?: number;
            top?: number;
            bottom?: number;
        };
        xAxis?: {
            type?: 'time' | 'value' | 'category';
            min?: number;
            max?: number;
            tickFormatter?: (value: number) => string;
        };
        yAxis?: {
            type?: 'value' | 'category';
            tickFormatter?: (value: number) => string;
        };
        tooltip?: {
            show?: boolean;
            trigger?: 'axis' | 'item';
            formatter?: (params: unknown) => string;
        };
        legend?: {
            show?: boolean;
            position?: string;
        };
        series?: ChartSeriesConfig[];
        annotations?: ChartAnnotation[];
    }

    export interface ChartSeriesConfig {
        type: string;
        name: string;
        color?: string;
        visible?: boolean;
        showInLegend?: boolean;
        data: [number, number][];
    }

    export interface ChartAnnotation {
        type: string;
        x?: number;
        y?: number;
        layer?: string;
        marker?: {
            symbol?: string;
            size?: number;
            style?: { color?: string };
        };
    }

    export interface ChartGPUInstance {
        readonly options: Readonly<ChartGPUOptions>;
        readonly disposed: boolean;
        setOption(options: ChartGPUOptions): void;
        resize(): void;
        dispose(): void;
        on(event: string, callback: (payload: unknown) => void): void;
        getZoomRange?(): { start: number; end: number };
        setZoomRange?(start: number, end: number, source?: string): void;
    }

    export function createChart(
        container: HTMLElement,
        options: ChartGPUOptions,
    ): Promise<ChartGPUInstance>;
}
