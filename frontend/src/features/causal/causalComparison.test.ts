import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
}));

vi.mock('../../utils/toast.js', () => ({
    toast: mocks.toast,
}));

describe('causal comparison graph state', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
            <select id="causal-method-select"><option value="pcmci" selected>PCMCI</option></select>
            <select id="causal-test-select"><option value="par_corr" selected>ParCorr</option></select>
            <input id="causal-tau-max" value="3" />
            <input id="causal-alpha" value="0.05" />
            <button id="causal-save-run-btn" type="button">Save Run</button>
            <select id="causal-compare-run-a"></select>
            <select id="causal-compare-run-b"></select>
            <button id="causal-compare-run-btn" type="button">Compare</button>
            <button id="causal-compare-clear-btn" type="button">Clear All</button>
            <div id="causal-saved-runs-list"></div>
            <div id="causal-compare-results"></div>
        `;
        localStorage.clear();
        mocks.toast.mockReset();
        const { __resetCausalComparisonForTests } = await import('./causalComparison.js');
        __resetCausalComparisonForTests();
    });

    it('saves the latest notified graph without publishing a window global', async () => {
        const {
            getCurrentCausalGraph,
            initCausalComparison,
            loadSavedRuns,
            notifyCausalGraphUpdated,
        } = await import('./causalComparison.js');

        notifyCausalGraphUpdated(['HUFL', 'OT'], [
            { source: 'HUFL', target: 'OT', lag: 1, type: '-->', value: 0.42, pvalue: 0.01 },
        ]);

        initCausalComparison();
        (document.getElementById('causal-save-run-btn') as HTMLButtonElement).click();

        expect(getCurrentCausalGraph()).toEqual({
            columns: ['HUFL', 'OT'],
            links: [{ source: 'HUFL', target: 'OT', lag: 1, type: '-->', value: 0.42, pvalue: 0.01 }],
        });
        expect((window as any).__edatimeCausalGraph).toBeUndefined();
        expect(loadSavedRuns()).toHaveLength(1);
        expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Saved run'), 'success');
    });
});
