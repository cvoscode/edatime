/** Chart renderer contracts and data projections. */

import type { DataFetchMeta } from './api.js';
import type { AdaptiveLineFilter } from './store.js';

export interface SeriesData {
    x: Float64Array;
    y: Float64Array;
}

export interface FilteredDataObject {
    ts?: Float64Array;
    values?: Record<string, Float64Array>;
    color?: (number | string | null)[] | null;
    color_column?: string | null;
    _meta?: DataFetchMeta;
    series: Record<string, SeriesData>;
    colorByColumn: Record<string, (number | string | null)[]>;
}

export interface ChartTextOverlays {
    title: string;
    xLabel: string;
    yLabel: string;
}

export interface ZoomEntry {
    start: number;
    end: number;
}

export interface ViewSnapshot {
    xMin: number | null;
    xMax: number | null;
    yMin: number | null;
    yMax: number | null;
}

export type YMode = 'fit' | 'lock' | 'restore';

export interface ChartInstance {
    init(): Promise<void>;
    updateDataMulti(
        dataObj: FilteredDataObject,
        columns: string[],
        colorColumn?: string | null,
        adaptiveLines?: readonly AdaptiveLineFilter[],
    ): void;
    setXRange(min: number, max: number): void;
    setYRange(min: number, max: number): void;
    resetYRange?(): void;
    setStackFromZero?(on: boolean): void;
    setRobustDisplayRange?(options: RobustDisplayRangeOptions | null): void;
    setChartText(title: string, xLabel: string, yLabel: string): void;
    onCrosshairMove(callback: (data: CrosshairData) => void): void;
    onClick(callback: (data: unknown) => void): void;
    supportsZoomControls(): boolean;
    getXDomain(): { min: number; max: number } | null;
    getYRange(): { min: number; max: number } | null;
    fitYToData(): void;
    setDrawMode(mode: string, color: string, width: number): void;
    clearDrawings(): void;
    exportPNG(): void;
    exportSVG(): void;
    exportHTML(): void;
    requestOverlayRender?(): void;
    setVisibleColumns?(columns: readonly string[]): boolean;
    setColumnColor?(column: string, color: string): boolean;
    cssPointToData?(clientX: number, clientY: number): { x: number; y: number } | null;
    destroy?(): void;
}

export interface RobustDisplayRangeOptions {
    mode: 'percentile' | 'iqr';
    param: number;
}

export interface ChartAdapter {
    label?: string;
    create(containerId: string, callbacks?: Record<string, unknown>): ChartInstance;
}

export interface CrosshairData {
    x: number | null;
    y?: number;
    seriesValues?: Record<string, number>;
}

export interface ClickData {
    x: number;
    y: number;
    seriesValues?: Record<string, number>;
}

declare global {
    interface Navigator {
        gpu?: {
            requestAdapter(): Promise<any | null>;
        };
    }
}
