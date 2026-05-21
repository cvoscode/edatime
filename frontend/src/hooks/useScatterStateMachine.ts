/**
 * Scatter state machine — manages scatter page state transitions for
 * loading correlations and points via a clear state-driven lifecycle.
 */
import { createSignal } from 'solid-js';
import { scatterStore } from '../stores/scatterStore';
import { uiStore } from '../stores/uiStore';
import { fetchScatterCorrelations } from '../services/api';
import { fetchScatterData } from '../services/dataFetch';
import type { SuggestionItem } from '../types';

export type ScatterPageState =
    | { name: 'idle' }
    | { name: 'loading_correlations'; xCol: string }
    | { name: 'correlations_loaded'; xCol: string; correlations: Record<string, { pearson: number | null; spearman: number | null }>; suggestions: SuggestionItem[] }
    | { name: 'loading_points'; xCol: string; yCol: string; colorCol: string | null; sizeCol: string | null }
    | { name: 'points_loaded'; xCol: string; yCol: string; points: [number, number][]; totalPoints: number; colorValues: number[] | null; colorLabels: (string | null)[] | null; colorMin: number | null; colorMax: number | null }
    | { name: 'error'; message: string; previousState: ScatterPageState };

export type ScatterStateInput =
    | { type: 'set_x_col'; col: string }
    | { type: 'set_y_col'; col: string }
    | { type: 'set_color_col'; col: string | null }
    | { type: 'set_size_col'; col: string | null }
    | { type: 'refresh_points' }
    | { type: 'reset' };

interface UseScatterStateMachine {
    state: () => ScatterPageState;
    transition(input: ScatterStateInput): Promise<void>;
    setXCol(col: string): Promise<void>;
    setYCol(col: string): Promise<void>;
    setColorCol(col: string | null): Promise<void>;
    setSizeCol(col: string | null): Promise<void>;
    refreshPoints(): Promise<void>;
    reset(): void;
}

export function useScatterStateMachine(): UseScatterStateMachine {
    const [state, setState] = createSignal<ScatterPageState>({ name: 'idle' });

    function toastError(msg: string) {
        uiStore.addToast({ type: 'error', message: msg });
    }

    async function transition(input: ScatterStateInput): Promise<void> {
        const current = state();

        try {
            switch (input.type) {
                case 'set_x_col': {
                    const col = input.col;
                    setState({ name: 'loading_correlations', xCol: col });
                    const resp = await fetchScatterCorrelations(col, 0.7);

                    const corrMap: Record<string, { pearson: number | null; spearman: number | null }> = {};
                    for (const item of resp.correlations) {
                        corrMap[item.column] = { pearson: item.pearson, spearman: item.spearman };
                    }

                    // Backend returns suggestions as SuggestionItem[] with {x, y, correlation}
                    // ScatterStore expects SuggestionItem[] format directly
                    const suggestions = resp.suggestions ?? [];

                    // Update scatterStore
                    scatterStore.setCorrelations(corrMap);
                    scatterStore.setSuggestions(suggestions);
                    scatterStore.setConfig({ xCol: col });

                    setState({ name: 'correlations_loaded', xCol: col, correlations: corrMap, suggestions });
                    break;
                }

                case 'set_y_col': {
                    const col = input.col;
                    const xCol = 'xCol' in current ? (current as { xCol: string }).xCol : scatterStore.state.config.xCol;
                    const colorCol = scatterStore.state.config.colorCol || null;
                    const sizeCol = scatterStore.state.config.sizeCol || null;

                    setState({ name: 'loading_points', xCol, yCol: col, colorCol, sizeCol });

                    const resp = await fetchScatterData(xCol, col, 500000, colorCol, sizeCol);

                    scatterStore.setScatterPoints(resp.points, resp.totalPoints);
                    scatterStore.setColorValues(resp.colorValues, resp.colorMin, resp.colorMax);
                    scatterStore.setColorLabels(resp.colorLabels);
                    scatterStore.setSizeValues(resp.sizeValues, resp.sizeMin, resp.sizeMax);
                    scatterStore.setConfig({ yCol: col });

                    setState({
                        name: 'points_loaded',
                        xCol,
                        yCol: col,
                        points: resp.points,
                        totalPoints: resp.totalPoints,
                        colorValues: resp.colorValues,
                        colorLabels: resp.colorLabels,
                        colorMin: resp.colorMin,
                        colorMax: resp.colorMax,
                    });
                    break;
                }

                case 'set_color_col': {
                    const col = input.col;
                    const xCol = 'xCol' in current ? (current as { xCol: string }).xCol : scatterStore.state.config.xCol;
                    const yCol = 'yCol' in current ? (current as { yCol: string }).yCol : scatterStore.state.config.yCol;
                    const sizeCol = scatterStore.state.config.sizeCol || null;

                    scatterStore.setConfig({ colorCol: col ?? '' });

                    setState({ name: 'loading_points', xCol, yCol, colorCol: col, sizeCol });

                    const resp = await fetchScatterData(xCol, yCol, 500000, col, sizeCol);

                    scatterStore.setScatterPoints(resp.points, resp.totalPoints);
                    scatterStore.setColorValues(resp.colorValues, resp.colorMin, resp.colorMax);
                    scatterStore.setColorLabels(resp.colorLabels);
                    scatterStore.setSizeValues(resp.sizeValues, resp.sizeMin, resp.sizeMax);

                    setState({
                        name: 'points_loaded',
                        xCol,
                        yCol,
                        points: resp.points,
                        totalPoints: resp.totalPoints,
                        colorValues: resp.colorValues,
                        colorLabels: resp.colorLabels,
                        colorMin: resp.colorMin,
                        colorMax: resp.colorMax,
                    });
                    break;
                }

                case 'set_size_col': {
                    const col = input.col;
                    const xCol = 'xCol' in current ? (current as { xCol: string }).xCol : scatterStore.state.config.xCol;
                    const yCol = 'yCol' in current ? (current as { yCol: string }).yCol : scatterStore.state.config.yCol;
                    const colorCol = scatterStore.state.config.colorCol || null;

                    scatterStore.setConfig({ sizeCol: col ?? '' });

                    setState({ name: 'loading_points', xCol, yCol, colorCol, sizeCol: col });

                    const resp = await fetchScatterData(xCol, yCol, 500000, colorCol, col);

                    scatterStore.setScatterPoints(resp.points, resp.totalPoints);
                    scatterStore.setColorValues(resp.colorValues, resp.colorMin, resp.colorMax);
                    scatterStore.setColorLabels(resp.colorLabels);
                    scatterStore.setSizeValues(resp.sizeValues, resp.sizeMin, resp.sizeMax);

                    setState({
                        name: 'points_loaded',
                        xCol,
                        yCol,
                        points: resp.points,
                        totalPoints: resp.totalPoints,
                        colorValues: resp.colorValues,
                        colorLabels: resp.colorLabels,
                        colorMin: resp.colorMin,
                        colorMax: resp.colorMax,
                    });
                    break;
                }

                case 'refresh_points': {
                    const xCol = 'xCol' in current ? (current as { xCol: string }).xCol : scatterStore.state.config.xCol;
                    const yCol = 'yCol' in current ? (current as { yCol: string }).yCol : scatterStore.state.config.yCol;
                    const colorCol = 'colorCol' in current ? (current as { colorCol: string | null }).colorCol : (scatterStore.state.config.colorCol || null);
                    const sizeCol = 'sizeCol' in current ? (current as { sizeCol: string | null }).sizeCol : (scatterStore.state.config.sizeCol || null);

                    setState({ name: 'loading_points', xCol, yCol, colorCol, sizeCol });

                    const resp = await fetchScatterData(xCol, yCol, 500000, colorCol, sizeCol);

                    scatterStore.setScatterPoints(resp.points, resp.totalPoints);
                    scatterStore.setColorValues(resp.colorValues, resp.colorMin, resp.colorMax);
                    scatterStore.setColorLabels(resp.colorLabels);
                    scatterStore.setSizeValues(resp.sizeValues, resp.sizeMin, resp.sizeMax);

                    setState({
                        name: 'points_loaded',
                        xCol,
                        yCol,
                        points: resp.points,
                        totalPoints: resp.totalPoints,
                        colorValues: resp.colorValues,
                        colorLabels: resp.colorLabels,
                        colorMin: resp.colorMin,
                        colorMax: resp.colorMax,
                    });
                    break;
                }

                case 'reset': {
                    scatterStore.reset();
                    setState({ name: 'idle' });
                    break;
                }
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toastError(msg);
            setState({ name: 'error', message: msg, previousState: current });
        }
    }

    async function setXCol(col: string): Promise<void> {
        await transition({ type: 'set_x_col', col });
    }

    async function setYCol(col: string): Promise<void> {
        await transition({ type: 'set_y_col', col });
    }

    async function setColorCol(col: string | null): Promise<void> {
        await transition({ type: 'set_color_col', col });
    }

    async function setSizeCol(col: string | null): Promise<void> {
        await transition({ type: 'set_size_col', col });
    }

    async function refreshPoints(): Promise<void> {
        await transition({ type: 'refresh_points' });
    }

    function reset(): void {
        transition({ type: 'reset' });
    }

    return { state, transition, setXCol, setYCol, setColorCol, setSizeCol, refreshPoints, reset };
}