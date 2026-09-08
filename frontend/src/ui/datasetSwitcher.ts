import type { WorkspaceStore } from '../contracts/workspace.js';
import '../../css/modules/dataset-context.css';

interface DatasetSwitcherDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>;
    showPage: (page: string) => void;
    onDatasetSelected: () => void | Promise<void>;
}

function datasetLabel(deps: DatasetSwitcherDeps): string {
    const snapshot = deps.workspace.getSnapshot();
    const metadata = snapshot.dataset.metadata;
    return metadata?.source_name?.trim()
        || snapshot.dataset.activeSourceVersionId
        || metadata?.source_version_id
        || 'No dataset';
}

/** Header-level selector for retained datasets/versions, available on every page. */
export function initDatasetSwitcher(deps: DatasetSwitcherDeps): () => void {
    const root = document.getElementById('dataset-switcher') as HTMLDetailsElement | null;
    const label = document.getElementById('dataset-switcher-label');
    const menu = document.getElementById('dataset-switcher-menu');
    if (!root || !label || !menu) return () => {};
    const lifetime = new AbortController();
    let loadGeneration = 0;

    const syncLabel = () => {
        const text = datasetLabel(deps);
        label.textContent = text;
        root.setAttribute('aria-label', `Active dataset: ${text}`);
    };

    const loadMenu = async () => {
        const generation = ++loadGeneration;
        menu.replaceChildren();
        const loading = document.createElement('span');
        loading.className = 'dataset-switcher__status';
        loading.textContent = 'Loading datasets…';
        menu.append(loading);
        try {
            const { listDatasetVersions, selectDatasetVersion } = await import('../cleaning/api.js');
            const versions = await listDatasetVersions({ signal: lifetime.signal });
            if (generation !== loadGeneration || lifetime.signal.aborted) return;
            menu.replaceChildren();
            const activeId = deps.workspace.getSnapshot().dataset.activeSourceVersionId;
            for (const version of versions) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'dataset-switcher__item';
                item.setAttribute('role', 'menuitemradio');
                item.setAttribute('aria-checked', version.id === activeId ? 'true' : 'false');
                item.dataset.versionId = version.id;
                const name = version.sourceName?.trim() || version.id;
                item.textContent = `${version.id === activeId ? '✓ ' : ''}${name} · revision ${version.revision}`;
                item.title = version.id;
                item.addEventListener('click', async () => {
                    if (version.id === activeId) { root.open = false; return; }
                    item.disabled = true;
                    item.textContent = `Switching to ${name}…`;
                    try {
                        await selectDatasetVersion(version.id, { signal: lifetime.signal });
                        root.open = false;
                        await deps.onDatasetSelected();
                        syncLabel();
                    } catch (error) {
                        item.disabled = false;
                        item.textContent = `Could not switch · ${error instanceof Error ? error.message : 'try again'}`;
                    }
                }, { signal: lifetime.signal });
                menu.append(item);
            }
            if (versions.length === 0) {
                const empty = document.createElement('span');
                empty.className = 'dataset-switcher__status';
                empty.textContent = 'No retained datasets yet.';
                menu.append(empty);
            }
            const loadNew = document.createElement('button');
            loadNew.type = 'button';
            loadNew.className = 'dataset-switcher__item dataset-switcher__item--load';
            loadNew.setAttribute('role', 'menuitem');
            loadNew.textContent = '+ Load new dataset';
            loadNew.addEventListener('click', () => {
                root.open = false;
                deps.showPage('upload');
            }, { signal: lifetime.signal });
            menu.append(loadNew);
        } catch (error) {
            if (lifetime.signal.aborted) return;
            menu.replaceChildren();
            const failure = document.createElement('span');
            failure.className = 'dataset-switcher__status dataset-switcher__status--error';
            failure.textContent = error instanceof Error ? error.message : 'Could not load datasets.';
            menu.append(failure);
            const loadNew = document.createElement('button');
            loadNew.type = 'button';
            loadNew.className = 'dataset-switcher__item dataset-switcher__item--load';
            loadNew.textContent = '+ Load new dataset';
            loadNew.addEventListener('click', () => deps.showPage('upload'), { signal: lifetime.signal });
            menu.append(loadNew);
        }
    };

    root.addEventListener('toggle', () => { if (root.open) void loadMenu(); }, { signal: lifetime.signal });
    const unsubscribe = deps.workspace.subscribe(syncLabel);
    syncLabel();
    return () => { lifetime.abort(); unsubscribe(); };
}
