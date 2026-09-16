import { fetchScatterCorrelations } from '../../services/api/index.js';
import { refreshCorrelationsAndSuggestions } from './correlationsPanel.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { scatterState } from '../../store/scatterState.js';

vi.mock('../../services/api/index.js', () => ({ fetchScatterCorrelations: vi.fn() }));
vi.mock('../../platform/analyticsColumns.js', () => ({ getEffectiveNumericColumns: () => ['HUFL', 'HULL'] }));

vi.mock('../../ui/primitives/Dropdown.js', () => ({
    getDropdownValue: vi.fn((id: string) => {
        if (id === 'scatter-x-col') return 'HUFL';
        if (id === 'scatter-y-col') return 'HULL';
        return '';
    }),
    setDropdownOptions: vi.fn(),
    setDropdownValue: vi.fn(),
}));

vi.mock('../../utils/settings.js', () => ({
    getSetting: vi.fn(() => 'pearson_raw'),
}));

vi.mock('./helpers.js', () => ({
    getEl: (id: string) => document.getElementById(id),
}));

vi.mock('./state.js', () => ({
    ensureOptions: vi.fn((_select: HTMLElement, options: string[], preferred: string) => preferred || options[0] || ''),
}));

vi.mock('./rendering.js', () => ({
    updateCorrelationStats: vi.fn(),
    updateColorbarUI: vi.fn(),
}));

describe('renderSuggestions', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="scatter-suggestions"></div>';
        scatterState.suggestionThreshold = 0.7;
        scatterState.lastSuggestions = [];
        scatterState.lastTopPairs = [];
    });

    it('shows a top-pair fallback when thresholded suggestions are empty', async () => {
        const { renderSuggestions } = await import('./correlationsPanel.js');
        scatterState.lastTopPairs = [
            { x: 'HULL', y: 'MULL', correlation: 0.91, count: 256 },
            { x: 'HUFL', y: 'OT', correlation: 0.67, count: 256 },
        ];

        renderSuggestions([]);

        const container = document.getElementById('scatter-suggestions')!;
        expect(container.textContent).toContain('Showing top');
        expect(container.textContent).toContain('HULL');
        expect(container.textContent).toContain('MULL');
        expect(container.textContent).toContain('HUFL');
        expect(container.textContent).toContain('OT');
        expect(container.querySelectorAll('button')).toHaveLength(2);
        const fallback = container.querySelector('.scatter-suggestion-fallback');
        expect(fallback?.firstElementChild?.classList.contains('scatter-suggestion-empty')).toBe(true);
        expect(fallback?.lastElementChild?.classList.contains('scatter-suggestion-fallback__chips')).toBe(true);
        expect(fallback?.lastElementChild?.querySelectorAll('button')).toHaveLength(2);
    });

    it('uses the explicit apply handler after selecting a suggestion', async () => {
        const { renderSuggestions } = await import('./correlationsPanel.js');
        const onSuggestionApply = vi.fn();

        renderSuggestions([{ x: 'OT', y: 'HUFL', correlation: 0.82 }], onSuggestionApply);
        (document.querySelector('.scatter-suggestion-btn') as HTMLButtonElement).click();

        expect(onSuggestionApply).toHaveBeenCalledWith('OT', 'HUFL');
    });
});


it('ignores an older suggestion response after a newer refresh finishes', async () => {
    document.body.innerHTML = '<div id="scatter-x-col"></div><div id="scatter-y-col"></div><div id="scatter-suggestions"></div>';
    const { fetchScatterCorrelations } = await import('../../services/api/index.js');
    const { refreshCorrelationsAndSuggestions } = await import('./correlationsPanel.js');
    const response = (correlation: number) => ({
        mode: 'pearson_raw' as const, base_column: 'HUFL', threshold: 0.7,
        numeric_columns: ['HUFL', 'HULL'], correlations: [{ column: 'HULL', value: correlation, count: 100 }], top_pairs: [],
        suggestions: [{ x: 'HUFL', y: 'HULL', correlation }],
    });
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetchScatterCorrelations)
        .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
        .mockResolvedValue(response(0.95));
    const oldRequest = refreshCorrelationsAndSuggestions();
    await refreshCorrelationsAndSuggestions();
    resolveOld(response(0.71));
    await oldRequest;
    expect(scatterState.lastSuggestions[0]?.correlation).toBe(0.95);
    expect(document.getElementById('scatter-suggestions')?.textContent).toContain('0.95');
});

it('keeps search hidden for small X and Y option lists', async () => {
    document.body.innerHTML = '<div id="scatter-x-col"></div><div id="scatter-y-col"></div><div id="scatter-suggestions"></div>';
    const { fetchScatterCorrelations } = await import('../../services/api/index.js');
    const { ensureOptions } = await import('./state.js');
    vi.mocked(fetchScatterCorrelations).mockResolvedValue({
        mode: 'pearson_raw', base_column: 'HUFL', threshold: 0.7,
        numeric_columns: ['HUFL', 'HULL'],
        correlations: [{ column: 'HULL', value: 0.95, count: 100 }],
        top_pairs: [], suggestions: [{ x: 'HUFL', y: 'HULL', correlation: 0.95 }],
    });

    await refreshCorrelationsAndSuggestions();

    expect(vi.mocked(ensureOptions)).toHaveBeenCalledWith(
        expect.anything(), ['HUFL', 'HULL'], 'HUFL',
        { searchable: false, deferSearchUntilTyping: true },
    );
    expect(vi.mocked(ensureOptions)).toHaveBeenCalledWith(
        expect.anything(), ['HULL'], 'HULL',
        { searchable: false, deferSearchUntilTyping: true },
    );
});


describe('correlations with an active working plan', () => {
    beforeEach(() => {
        vi.mocked(fetchScatterCorrelations).mockReset();
        cleaningPlanStore.resetForDataset({
            sourceVersionId: 'source-1', datasetRevision: 1,
            datasetFingerprint: 'dataset-1', schemaFingerprint: 'schema-1', timeColumn: 'ts',
        });
        document.body.innerHTML = '<div id="scatter-x-col"></div><div id="scatter-y-col"></div><div id="scatter-suggestions"></div>';
        scatterState.lastSuggestions = [];
        scatterState.currentPairStats = null;
    });

    const response = {
        mode: 'pearson_raw' as const, base_column: 'HUFL', threshold: 0.7,
        numeric_columns: ['HUFL', 'HULL'],
        correlations: [{ column: 'HULL', value: 0.95, count: 100 }], top_pairs: [],
        suggestions: [{ x: 'HUFL', y: 'HULL', correlation: 0.95 }],
    };

    it('publishes correlations and suggestions when unchanged snapshots are cloned', async () => {
        const first = cleaningPlanStore.getSnapshot();
        expect(cleaningPlanStore.getSnapshot()).not.toBe(first);
        expect(cleaningPlanStore.getSnapshot()).toEqual(first);
        vi.mocked(fetchScatterCorrelations).mockResolvedValue(response);
        await refreshCorrelationsAndSuggestions();
        await vi.waitFor(() => expect(scatterState.currentPairStats).toMatchObject({ pearsonRaw: 0.95, spearmanRaw: 0.95, count: 100 }));
        expect(document.getElementById('scatter-suggestions')?.textContent).toContain('0.95');
    });

    it('discards results when the working filters change during the request', async () => {
        let resolve!: (value: typeof response) => void;
        vi.mocked(fetchScatterCorrelations).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
        const pending = refreshCorrelationsAndSuggestions();
        cleaningPlanStore.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row',
            enabled: true, sourcePage: 'timeseries', label: 'Range',
            column: 'HUFL', from: 0, to: 10, mode: 'keepInside',
        });
        resolve(response);
        await pending;
        expect(scatterState.currentPairStats).toBeNull();
        expect(scatterState.lastSuggestions).toEqual([]);
    });

    it('publishes the selected metric while a secondary metric is still pending', async () => {
        let resolveSecondary!: (value: typeof response) => void;
        vi.mocked(fetchScatterCorrelations)
            .mockResolvedValueOnce(response)
            .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondary = resolve; }));
        await refreshCorrelationsAndSuggestions();
        expect(scatterState.currentPairStats).toMatchObject({ pearsonRaw: 0.95, spearmanRaw: null });
        expect(document.getElementById('scatter-suggestions')?.textContent).toContain('0.95');
        resolveSecondary({ ...response, correlations: [{ column: 'HULL', value: 0.85, count: 100 }] });
        await vi.waitFor(() => expect(scatterState.currentPairStats).toMatchObject({ pearsonRaw: 0.95, spearmanRaw: 0.85 }));
    });

    it('discards secondary statistics from an older working plan', async () => {
        let resolveSecondary!: (value: typeof response) => void;
        vi.mocked(fetchScatterCorrelations)
            .mockResolvedValueOnce(response)
            .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondary = resolve; }));
        await refreshCorrelationsAndSuggestions();
        cleaningPlanStore.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row',
            enabled: true, sourcePage: 'timeseries', label: 'Range',
            column: 'HUFL', from: 0, to: 10, mode: 'keepInside',
        });
        vi.mocked(fetchScatterCorrelations).mockResolvedValue({
            ...response, correlations: [{ column: 'HULL', value: 0.4, count: 10 }],
        });
        await refreshCorrelationsAndSuggestions();
        await vi.waitFor(() => expect(scatterState.currentPairStats).toMatchObject({ pearsonRaw: 0.4, spearmanRaw: 0.4 }));
        resolveSecondary(response);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(scatterState.currentPairStats).toMatchObject({ pearsonRaw: 0.4, spearmanRaw: 0.4, count: 10 });
    });
});


it('filters cached correlations immediately in both threshold directions without fetching', async () => {
    const { renderSuggestionsFromCache } = await import('./correlationsPanel.js');
    document.body.innerHTML = '<div id="scatter-suggestions"></div>';
    vi.mocked(fetchScatterCorrelations).mockClear();
    scatterState.correlationsByColumn = new Map([
        ['HULL', { column: 'HULL', value: -0.9, count: 100 }],
        ['OT', { column: 'OT', value: 0.4, count: 100 }],
    ]);
    scatterState.suggestionThreshold = 0.7;
    renderSuggestionsFromCache();
    expect(scatterState.lastSuggestions.map((pair) => pair.y)).toEqual(['HULL']);
    scatterState.suggestionThreshold = 0.3;
    renderSuggestionsFromCache();
    expect(scatterState.lastSuggestions.map((pair) => pair.y)).toEqual(['HULL', 'OT']);
    expect(fetchScatterCorrelations).not.toHaveBeenCalled();
});
