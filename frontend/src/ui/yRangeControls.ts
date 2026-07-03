/**
 * yRangeControls — wires the "Stack from 0" toggle in the timeseries
 * toolbar. The toggle flips `chartState.stackFromZero` (persisted in
 * `localStorage`), calls the chart instance's `setStackFromZero`, and
 * re-fires the chart's render path so the lower bound clamps at 0
 * without a refetch.
 */

import { chartState, setStackFromZero, store } from '../store/index.js';
import type { RobustDisplayRangeOptions } from '../types.js';

const Y_RANGE_TOGGLE_ID = 'y-stack-from-zero';
const ROBUST_TOGGLE_ID = 'y-robust-range-toggle';
const ROBUST_MODE_ID = 'y-robust-range-mode';
const ROBUST_PARAM_ID = 'y-robust-range-param';

function applyToChartInstance(on: boolean): void {
    const chart = chartState.chart as unknown as {
        setStackFromZero?: (on: boolean) => void;
        setRobustDisplayRange?: (options: RobustDisplayRangeOptions | null) => void;
    } | null;
    if (chart && typeof chart.setStackFromZero === 'function') {
        chart.setStackFromZero(on);
    }
}

function applyRobustRangeToChartInstance(options: RobustDisplayRangeOptions | null): void {
    const chart = chartState.chart as unknown as {
        setRobustDisplayRange?: (options: RobustDisplayRangeOptions | null) => void;
    } | null;
    if (chart && typeof chart.setRobustDisplayRange === 'function') {
        chart.setRobustDisplayRange(options);
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

function syncRangeHint(): void {
    const hintEl = document.getElementById('y-range-hint') as HTMLElement | null;
    const robustToggle = document.getElementById(ROBUST_TOGGLE_ID) as HTMLInputElement | null;
    const chart = chartState.chart as unknown as {
        getRobustDisplayRangeSuggestion?: () => RobustDisplayRangeOptions | null;
    } | null;
    const suggested = robustToggle?.checked ? null : (chart?.getRobustDisplayRangeSuggestion?.() ?? null);
    if (!hintEl) return;
    hintEl.hidden = !suggested;
    hintEl.textContent = suggested ? 'Spike-compressed view detected. Try Robust range.' : '';
}

export function initYRangeControls(): void {
    const toggle = document.getElementById(Y_RANGE_TOGGLE_ID) as HTMLInputElement | null;
    if (!toggle) return;
    const robustToggle = document.getElementById(ROBUST_TOGGLE_ID) as HTMLInputElement | null;
    const robustMode = document.getElementById(ROBUST_MODE_ID) as HTMLSelectElement | null;
    const robustParam = document.getElementById(ROBUST_PARAM_ID) as HTMLInputElement | null;

    const readRobustOptions = (): RobustDisplayRangeOptions | null => {
        if (!robustToggle?.checked) return null;
        const mode = robustMode?.value === 'iqr' ? 'iqr' : 'percentile';
        const fallbackParam = mode === 'iqr' ? 1.5 : 1;
        const parsed = Number.parseFloat(robustParam?.value ?? String(fallbackParam));
        return {
            mode,
            param: Number.isFinite(parsed) ? parsed : fallbackParam,
        };
    };

    const syncRobustFieldState = () => {
        const enabled = !!robustToggle?.checked;
        if (robustMode) robustMode.disabled = !enabled;
        if (robustParam) robustParam.disabled = !enabled;
    };

    const applyRobustState = () => {
        syncRobustFieldState();
        applyRobustRangeToChartInstance(readRobustOptions());
    };

    toggle.checked = !!chartState.stackFromZero;
    applyToChartInstance(toggle.checked);
    syncRobustFieldState();
    applyRobustState();
    syncRangeHint();

    toggle.addEventListener('change', () => {
        const next = !!toggle.checked;
        setStackFromZero(next);
        applyToChartInstance(next);
        // Defer to the next frame so the chart's resize handler picks
        // up the flag change without racing the input event.
        requestAnimationFrame(() => refreshChartRender());
    });

    robustToggle?.addEventListener('change', () => {
        applyRobustState();
        syncRangeHint();
        requestAnimationFrame(() => refreshChartRender());
    });
    robustMode?.addEventListener('change', () => {
        applyRobustState();
        syncRangeHint();
        requestAnimationFrame(() => refreshChartRender());
    });
    robustParam?.addEventListener('input', () => {
        applyRobustState();
        syncRangeHint();
        requestAnimationFrame(() => refreshChartRender());
    });

    // Keep the toggle in sync if a future path mutates the chart state
    // programmatically (e.g. a "Reset chart defaults" command).
    store.subscribe('chart:stackFromZero', ({ next }) => {
        const value = !!next;
        if (toggle.checked !== value) toggle.checked = value;
    });
}
