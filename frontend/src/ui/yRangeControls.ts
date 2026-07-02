/**
 * yRangeControls — wires the "Stack from 0" toggle in the timeseries
 * toolbar. The toggle flips `chartState.stackFromZero` (persisted in
 * `localStorage`), calls the chart instance's `setStackFromZero`, and
 * re-fires the chart's render path so the lower bound clamps at 0
 * without a refetch.
 */

import { chartState, setStackFromZero, store } from '../store/index.js';

const Y_RANGE_TOGGLE_ID = 'y-stack-from-zero';

function applyToChartInstance(on: boolean): void {
    const chart = chartState.chart as unknown as {
        setStackFromZero?: (on: boolean) => void;
    } | null;
    if (chart && typeof chart.setStackFromZero === 'function') {
        chart.setStackFromZero(on);
    }
}

function refreshChartRender(): void {
    // The chart instance owns its rendering. We poke `resize()` which
    // calls into the chart's render path, so the y-axis lower bound
    // re-evaluates with the new flag.
    const chart = chartState.chart as unknown as { resize?: () => void } | null;
    if (chart && typeof chart.resize === 'function') {
        chart.resize();
    }
}

export function initYRangeControls(): void {
    const toggle = document.getElementById(Y_RANGE_TOGGLE_ID) as HTMLInputElement | null;
    if (!toggle) return;

    toggle.checked = !!chartState.stackFromZero;
    applyToChartInstance(toggle.checked);

    toggle.addEventListener('change', () => {
        const next = !!toggle.checked;
        setStackFromZero(next);
        applyToChartInstance(next);
        // Defer to the next frame so the chart's resize handler picks
        // up the flag change without racing the input event.
        requestAnimationFrame(() => refreshChartRender());
    });

    // Keep the toggle in sync if a future path mutates the chart state
    // programmatically (e.g. a "Reset chart defaults" command).
    store.subscribe('chart:stackFromZero', ({ next }) => {
        const value = !!next;
        if (toggle.checked !== value) toggle.checked = value;
    });
}
