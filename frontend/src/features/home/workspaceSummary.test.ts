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
            <p id="home-dataset-status" role="status" aria-live="polite" hidden></p>
            <button id="home-dataset-retry" hidden>Retry dataset check</button>
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


describe('home metadata bootstrap state', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-home"><div class="page-header__description"></div></section>
            <button id="home-continue-btn"></button>
            <p id="home-dataset-status" role="status" aria-live="polite" hidden></p>
            <button id="home-dataset-retry" hidden>Retry dataset check</button>
            <section id="home-active-dataset" hidden><h2 id="home-dataset-name"></h2></section>
            <details id="home-samples-disclosure"><span class="home-samples-summary__label"></span></details>
            <button id="home-primary-cta"></button>
            <span id="home-dataset-rows"></span><span id="home-dataset-columns"></span>
            <span id="home-dataset-time-column"></span><span id="home-dataset-span"></span>
            <span id="home-dataset-plan"></span>
        `;
    });
    it('shows a distinct loading state and then reveals the recovered active dataset', async () => {
        let resolveCheck!: (value: 'ready' | 'empty') => void;
        let snapshot = makeWorkspaceSnapshot();
        const listeners = new Set<() => void>();
        const ensureDatasetMetadata = vi.fn(() => new Promise<'ready' | 'empty'>((resolve) => { resolveCheck = resolve; }));
        const dispose = initHomeWorkspaceSummary({
            workspace: {
                getSnapshot: () => snapshot,
                subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
            } as any,
            showPage: vi.fn(),
            ensureDatasetMetadata,
        });

        expect(document.getElementById('home-dataset-status')?.textContent).toContain('Checking');
        expect((document.getElementById('home-primary-cta') as HTMLButtonElement).textContent).toBe('Load a dataset');

        snapshot = makeWorkspaceSnapshot({ dataset: { metadata: {
            source_name: 'ETTm2.csv', total_rows: 69_680,
            columns: [{ name: 'ts', dtype: 'datetime' }, { name: 'OT', dtype: 'float64' }],
            numeric_columns: ['OT'], time_column: 'ts', time_range: { min: 1, max: 2 },
        } as any } });
        listeners.forEach((listener) => listener());
        resolveCheck('ready');
        await vi.waitFor(() => expect(document.getElementById('home-active-dataset')?.hidden).toBe(false));
        expect(document.getElementById('home-dataset-status')?.hidden).toBe(true);
        expect(document.getElementById('home-dataset-rows')?.textContent).toBe('69,680');
        dispose();
    });

    it('shows metadata failures separately and retries without classifying them as an empty server', async () => {
        let attempts = 0;
        const ensureDatasetMetadata = vi.fn(async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('service unavailable');
            return 'empty' as const;
        });
        const dispose = initHomeWorkspaceSummary({
            workspace: { getSnapshot: () => makeWorkspaceSnapshot(), subscribe: () => vi.fn() },
            showPage: vi.fn(),
            ensureDatasetMetadata,
        });
        await vi.waitFor(() => expect(document.getElementById('home-dataset-retry')?.hidden).toBe(false));
        expect(document.getElementById('home-dataset-status')?.textContent).toBe('Could not check for an active dataset.');
        expect(document.getElementById('home-active-dataset')?.hidden).toBe(true);

        document.getElementById('home-dataset-retry')!.click();
        await vi.waitFor(() => expect(document.getElementById('home-dataset-retry')?.hidden).toBe(true));
        expect(ensureDatasetMetadata).toHaveBeenCalledTimes(2);
        dispose();
    });
});
