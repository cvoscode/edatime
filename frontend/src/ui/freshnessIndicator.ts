const DATA_UPDATED_EVENT = 'edatime:data-updated';
const DATASET_CHANGED_EVENT = 'edatime:dataset-changed';

export function markDataUpdated(at = Date.now()): void {
    window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT, { detail: { at } }));
}

export function markDatasetChanged(name: string, change: 'loaded' | 'changed', at = Date.now()): void {
    window.dispatchEvent(new CustomEvent(DATASET_CHANGED_EVENT, { detail: { name, change, at } }));
}

/** Keep the shell's freshness label relative without coupling analyses to it. */
export function initDataFreshnessIndicator(): () => void {
    const indicator = document.getElementById('data-freshness-indicator');
    const label = indicator?.querySelector<HTMLElement>('.data-freshness-time');
    const datasetIndicator = document.getElementById('dataset-change-indicator');
    const datasetLabel = datasetIndicator?.querySelector<HTMLElement>('.dataset-freshness-time');
    let updatedAt = 0;
    let datasetChangedAt = 0;
    let datasetDescription = '';

    const render = () => {
        if (!indicator || !label || !updatedAt) return;
        const minutes = Math.floor((Date.now() - updatedAt) / 60_000);
        label.textContent = minutes < 1 ? 'Analysis updated just now' : `Analysis updated ${minutes} min ago`;
        indicator.hidden = false;
        indicator.setAttribute('aria-label', label.textContent);
    };
    const renderDataset = () => {
        if (!datasetIndicator || !datasetLabel || !datasetChangedAt) return;
        const minutes = Math.floor((Date.now() - datasetChangedAt) / 60_000);
        const relative = minutes < 1 ? 'just now' : `${minutes} min ago`;
        datasetLabel.textContent = `${datasetDescription} ${relative}`;
        datasetIndicator.hidden = false;
        datasetIndicator.setAttribute('aria-label', datasetLabel.textContent);
    };
    const onUpdated = (event: Event) => {
        updatedAt = Number((event as CustomEvent<{ at?: number }>).detail?.at) || Date.now();
        render();
    };
    const onDatasetChanged = (event: Event) => {
        const detail = (event as CustomEvent<{ at?: number; name?: string; change?: 'loaded' | 'changed' }>).detail;
        datasetChangedAt = Number(detail?.at) || Date.now();
        const name = detail?.name?.trim() || 'dataset';
        datasetDescription = `${detail?.change === 'loaded' ? 'Dataset loaded' : 'Dataset changed'}: ${name},`;
        renderDataset();
    };
    window.addEventListener(DATA_UPDATED_EVENT, onUpdated);
    window.addEventListener(DATASET_CHANGED_EVENT, onDatasetChanged);
    const interval = window.setInterval(() => { render(); renderDataset(); }, 30_000);
    return () => {
        window.removeEventListener(DATA_UPDATED_EVENT, onUpdated);
        window.removeEventListener(DATASET_CHANGED_EVENT, onDatasetChanged);
        window.clearInterval(interval);
    };
}
