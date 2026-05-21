/**
 * useTimeseriesData - fetches and caches timeseries data for the current viewport.
 *
 * Orchestrates:
 * - Arrow IPC fetch for the current viewport window
 * - Color column extraction
 * - Error handling with AbortError filtering
 *
 * @param viewport - current ChartViewport signal
 * @param columns - selected series columns signal
 * @param xCol - time/x-axis column
 * @param options - { signal, colorColumn, width }
 */
import { createSignal, type Accessor } from 'solid-js';
import { fetchTimeseriesData } from '../api/client';
import type { ChartViewport } from '../domain/types';
import type { TimeseriesData } from '../domain/types';

export interface UseTimeseriesDataOptions {
    signal?: Accessor<AbortSignal | undefined>;
    colorColumn?: Accessor<string | null>;
    width?: number;
}

export interface UseTimeseriesDataResult {
    data: Accessor<TimeseriesData | null>;
    isLoading: Accessor<boolean>;
    isDownsampled: Accessor<boolean>;
    error: Accessor<string | null>;
    refetch: () => void;
}

export function useTimeseriesData(
    viewport: Accessor<ChartViewport>,
    columns: Accessor<string[]>,
    xCol: Accessor<string | null>,
    options: UseTimeseriesDataOptions = {}
): UseTimeseriesDataResult {
    const { signal, colorColumn, width = 1200 } = options;

    const [data, setData] = createSignal<TimeseriesData | null>(null);
    const [isLoading, setIsLoading] = createSignal(false);
    const [isDownsampled, setIsDownsampled] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const fetch = async () => {
        const cols = columns();
        const x = xCol();
        if (!cols.length || !x) {
            setData(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const vp = viewport();
            const start = new Date(vp.xMin).toISOString();
            const end = new Date(vp.xMax).toISOString();

            const result = await fetchTimeseriesData({
                start,
                end,
                width,
                xCol: x,
                columns: cols,
                signal: signal?.(),
                colorColumn: colorColumn?.(),
            });

            setData(result);
            setIsDownsampled(result.downsampled);
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
            setError(e instanceof Error ? e.message : String(e));
            setData(null);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        data,
        isLoading,
        isDownsampled,
        error,
        refetch: fetch,
    };
}
