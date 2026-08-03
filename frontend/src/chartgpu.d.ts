/** Local ChartGPU package augmentation for the Windows adapter policy. */

import 'chartgpu';

declare module 'chartgpu' {
    export interface ChartGPUOptions {
        powerPreference?: 'low-power' | 'high-performance';
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

}
