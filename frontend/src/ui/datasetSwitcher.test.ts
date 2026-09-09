import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initDatasetSwitcher } from './datasetSwitcher.js';
import { makeWorkspaceSnapshot } from '../workspace/workspaceStore.js';

const api = vi.hoisted(() => ({
    listDatasetVersions: vi.fn(),
    selectDatasetVersion: vi.fn(),
}));

vi.mock('../cleaning/api.js', () => api);

function buildDom(): void {
    document.body.innerHTML = `
        <details id="dataset-switcher" aria-expanded="false">
            <summary class="dataset-switcher__summary" aria-expanded="false">
                <span id="dataset-switcher-label">No dataset</span>
            </summary>
            <div id="dataset-switcher-menu"></div>
        </details>
    `;
}

function setup(activeId = 'source-1') {
    let currentId = activeId;
    const listeners = new Set<() => void>();
    const workspace = {
        getSnapshot: vi.fn(() => makeWorkspaceSnapshot({
            dataset: {
                activeSourceVersionId: currentId,
                metadata: currentId ? { source_name: currentId } as any : null,
            },
        })),
        subscribe: vi.fn((listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }),
    };
    const onDatasetSelected = vi.fn(async () => {
        currentId = 'source-2';
        listeners.forEach((listener) => listener());
    });
    const showPage = vi.fn();
    const dispose = initDatasetSwitcher({ workspace, onDatasetSelected, showPage });
    return { dispose, onDatasetSelected, showPage };
}

describe('dataset switcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildDom();
        api.listDatasetVersions.mockResolvedValue([
            { id: 'source-1', sourceName: 'Source one', revision: 1 },
            { id: 'source-2', sourceName: 'Source two', revision: 2 },
        ]);
        api.selectDatasetVersion.mockResolvedValue(undefined);
    });

    it('opens and loads versions from click and keeps aria-expanded in sync', async () => {
        const { dispose } = setup();
        const root = document.getElementById('dataset-switcher') as HTMLDetailsElement;
        const summary = root.querySelector('summary')!;

        summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(root.open).toBe(true);
        expect(root.getAttribute('aria-expanded')).toBe('true');
        expect(summary.getAttribute('aria-expanded')).toBe('true');
        await vi.waitFor(() => expect(document.querySelectorAll('.dataset-switcher__item')).toHaveLength(3));
        dispose();
    });

    it.each(['Enter', ' '])('opens with the %j key', async (key) => {
        const { dispose } = setup();
        const root = document.getElementById('dataset-switcher') as HTMLDetailsElement;

        root.querySelector('summary')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

        expect(root.open).toBe(true);
        await vi.waitFor(() => expect(api.listDatasetVersions).toHaveBeenCalledOnce());
        dispose();
    });

    it('closes without selecting the active version', async () => {
        const { dispose } = setup();
        document.querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(document.querySelector('[data-version-id="source-1"]')).not.toBeNull());

        (document.querySelector('[data-version-id="source-1"]') as HTMLButtonElement).click();

        expect(api.selectDatasetVersion).not.toHaveBeenCalled();
        expect((document.getElementById('dataset-switcher') as HTMLDetailsElement).open).toBe(false);
        expect(document.getElementById('dataset-switcher')?.getAttribute('aria-expanded')).toBe('false');
        dispose();
    });

    it('selects a different version, closes, and refreshes its label', async () => {
        const { dispose, onDatasetSelected } = setup();
        document.querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(document.querySelector('[data-version-id="source-2"]')).not.toBeNull());

        (document.querySelector('[data-version-id="source-2"]') as HTMLButtonElement).click();

        await vi.waitFor(() => expect(onDatasetSelected).toHaveBeenCalledOnce());
        expect(api.selectDatasetVersion).toHaveBeenCalledWith('source-2', expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(document.getElementById('dataset-switcher-label')?.textContent).toBe('source-2');
        expect((document.getElementById('dataset-switcher') as HTMLDetailsElement).open).toBe(false);
        dispose();
    });
});
