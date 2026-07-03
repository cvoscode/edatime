import { beforeEach, describe, expect, it, vi } from 'vitest';

const appStateMock: {
    scatter: {
        suggestionThreshold: number;
        lastSuggestions: Array<{ x: string; y: string; correlation: number }>;
        lastTopPairs: Array<{ x: string; y: string; correlation: number; count: number }>;
    };
} = {
    scatter: {
        suggestionThreshold: 0.7,
        lastSuggestions: [],
        lastTopPairs: [],
    },
};

vi.mock('../store/index.js', () => ({
    appState: appStateMock,
}));

vi.mock('../ui/primitives/Dropdown.js', () => ({
    getDropdownValue: vi.fn((id: string) => {
        if (id === 'scatter-x-col') return 'HUFL';
        if (id === 'scatter-y-col') return 'HULL';
        return '';
    }),
    setDropdownOptions: vi.fn(),
    setDropdownValue: vi.fn(),
}));

vi.mock('../utils/settings.js', () => ({
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
        appStateMock.scatter.lastSuggestions = [];
        appStateMock.scatter.lastTopPairs = [];
    });

    it('shows a top-pair fallback when thresholded suggestions are empty', async () => {
        const { renderSuggestions } = await import('./correlationsPanel.js');
        appStateMock.scatter.lastTopPairs = [
            { x: 'HULL', y: 'MULL', correlation: 0.91, count: 256 },
        ];

        renderSuggestions([]);

        const container = document.getElementById('scatter-suggestions')!;
        expect(container.textContent).toContain('Top pair');
        expect(container.textContent).toContain('HULL');
        expect(container.textContent).toContain('MULL');
        expect(container.textContent).toContain('0.70');
        expect(container.querySelector('button')).not.toBeNull();
    });
});
