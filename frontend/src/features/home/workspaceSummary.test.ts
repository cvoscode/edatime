import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitNavigationChange } from '../../platform/navigationEvents.js';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';
import { initHomeWorkspaceSummary } from './workspaceSummary.js';

vi.mock('../../utils/toast.js', () => ({ toast: vi.fn() }));

describe('home workspace summary', () => {
    beforeEach(() => {
        sessionStorage.clear();
        document.body.innerHTML = `
            <section id="page-home"><div class="page-header__description"></div></section>
            <button id="home-continue-btn"></button>
            <section id="home-active-dataset" hidden><h2 id="home-dataset-name"></h2></section>
            <details id="home-samples-disclosure"><span class="home-samples-summary__label"></span></details>
            <button id="home-primary-cta"></button>
            <span id="home-dataset-rows"></span><span id="home-dataset-columns"></span>
            <span id="home-dataset-time-column"></span><span id="home-dataset-span"></span>
            <span id="home-dataset-plan"></span>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        sessionStorage.clear();
    });

    it('offers to resume from the last analysis page visited this session', () => {
        const snapshot = makeWorkspaceSnapshot({ dataset: { metadata: {
            total_rows: 10,
            columns: [{ name: 'value', dtype: 'float64' }],
            numeric_columns: ['value'],
            time_column: 'time',
            time_range: { min: 1, max: 2 },
        } as any } });
        const showPage = vi.fn();
        const dispose = initHomeWorkspaceSummary({
            workspace: { getSnapshot: () => snapshot, subscribe: () => vi.fn() },
            showPage,
        });

        emitNavigationChange({ page: 'drift', navPage: 'drift' });
        emitNavigationChange({ page: 'home', navPage: 'home' });

        const button = document.getElementById('home-continue-btn') as HTMLButtonElement;
        expect(button.textContent).toBe('Resume from Drift');
        button.click();
        expect(showPage).toHaveBeenCalledWith('drift');
        dispose();
    });
});
