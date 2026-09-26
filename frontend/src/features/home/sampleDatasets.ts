import type { WorkspaceStore } from '../../contracts/workspace.js';
import { confirmDatasetReplacement } from '../../ui/datasetReplacement.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const GENERATED_SAMPLE_DATASETS = {
    sinusoidal: {
        id: 'sinusoidal',
        label: 'Sinusoidal Waves',
        start: '2024-01-01T00:00:00Z',
        durationMs: 7 * DAY_MS,
        intervalMs: 15 * 60 * 1000,
        columns: ['timestamp', 'temperature', 'humidity', 'pressure'],
        seed: 120241,
    },
    weather: {
        id: 'weather',
        label: 'Weather Patterns',
        start: '2024-03-01T00:00:00Z',
        durationMs: 7 * DAY_MS,
        intervalMs: 10 * 60 * 1000,
        columns: ['timestamp', 'temperature', 'humidity', 'pressure', 'wind_speed'],
        seed: 320243,
    },
} as const;

type GeneratedSampleId = keyof typeof GENERATED_SAMPLE_DATASETS;
type GeneratedSampleSpec = typeof GENERATED_SAMPLE_DATASETS[GeneratedSampleId];

function sampleRowCount(spec: GeneratedSampleSpec): number {
    return Math.ceil(spec.durationMs / spec.intervalMs);
}

function updateGeneratedSampleCardMetadata(): void {
    for (const spec of Object.values(GENERATED_SAMPLE_DATASETS)) {
        const card = document.querySelector<HTMLElement>(`[data-sample-dataset="${spec.id}"]`);
        const rows = card?.querySelector<HTMLElement>('[data-sample-row-count]');
        const columns = card?.querySelector<HTMLElement>('[data-sample-column-count]');
        if (rows) rows.textContent = `${sampleRowCount(spec).toLocaleString()} rows`;
        if (columns) columns.textContent = `${spec.columns.length} columns`;
    }
}

function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 0x1_0000_0000;
    };
}

export function wireSampleDatasetCards(
    showPage: (page: string) => void,
    refreshDatasetAfterMutation?: () => Promise<void>,
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>,
): () => void {
    const controller = new AbortController();
    updateGeneratedSampleCardMetadata();
    document.querySelectorAll<HTMLElement>('[data-sample-dataset]').forEach((element) => {
        element.addEventListener('click', () => {
            const dataset = element.dataset.sampleDataset;
            if (dataset) {
                void loadSampleDataset(dataset, showPage, refreshDatasetAfterMutation, workspace, element);
            }
        }, { signal: controller.signal });
    });
    return () => controller.abort();
}

async function loadSampleDataset(
    datasetId: string,
    showPage: (pageName: string) => void,
    refreshDatasetAfterMutation?: () => Promise<void>,
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>,
    trigger?: HTMLElement,
): Promise<void> {
    const { toast } = await import('../../utils/toast.js');
    const { fetchSampleDataset, uploadDataset } = await import('../../services/api/index.js');

    const labels: Record<string, string> = {
        ettm2: 'ETTm2',
        sinusoidal: 'Sinusoidal Waves',
        weather: 'Weather Patterns',
    };
    const label = labels[datasetId] || 'Sample';
    if (!confirmDatasetReplacement(workspace, `${label} sample data`)) return;
    const button = trigger instanceof HTMLButtonElement ? trigger : null;
    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    }
    const loadingToast = toast(`Loading ${label} sample dataset…`, 'info', 0);
    const dismissLoading = typeof loadingToast === 'function' ? loadingToast : () => { };

    try {
        let file: File;
        if (datasetId === 'ettm2') {
            const blob = await fetchSampleDataset('ETTm2.csv');
            file = new File([blob], 'ETTm2.csv', { type: 'text/csv' });
        } else if (datasetId === 'sinusoidal') {
            file = new File([generateSinusoidalCsv()], 'sinusoidal.csv', { type: 'text/csv' });
        } else if (datasetId === 'weather') {
            file = new File([generateWeatherCsv()], 'weather.csv', { type: 'text/csv' });
        } else {
            dismissLoading();
            toast(`Unknown sample dataset: ${datasetId}`, 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await uploadDataset(formData);
        const result = await response.json().catch(() => ({}));
        if (refreshDatasetAfterMutation) {
            await refreshDatasetAfterMutation();
        }
        dismissLoading();
        const rows = Number((result as { rows?: number })?.rows || 0);
        toast(rows > 0 ? `${rows.toLocaleString()} rows loaded. Dataset ready.` : `${label} sample dataset loaded.`, 'success', {});
        showPage('timeseries');
    } catch (err) {
        dismissLoading();
        toast(`Could not load ${label}: ${err}`, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }
}

function generateSinusoidalCsv(): string {
    const spec = GENERATED_SAMPLE_DATASETS.sinusoidal;
    const rows = [spec.columns.join(',')];
    const start = new Date(spec.start).getTime();
    const random = createSeededRandom(spec.seed);
    for (let index = 0; index < sampleRowCount(spec); index++) {
        const t = start + index * spec.intervalMs;
        const temp = 20 + 5 * Math.sin((t - start) / (3600 * 1000)) + (random() - 0.5) * 0.5;
        const hum = 50 + 20 * Math.sin((t - start) / (7200 * 1000)) + (random() - 0.5) * 2;
        const pres = 1013 + 5 * Math.sin((t - start) / (5400 * 1000)) + (random() - 0.5) * 0.3;
        rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)}`);
    }
    return rows.join('\n');
}

function generateWeatherCsv(): string {
    const spec = GENERATED_SAMPLE_DATASETS.weather;
    const rows = [spec.columns.join(',')];
    const start = new Date(spec.start).getTime();
    const random = createSeededRandom(spec.seed);
    for (let index = 0; index < sampleRowCount(spec); index++) {
        const t = start + index * spec.intervalMs;
        const hour = new Date(t).getUTCHours();
        const dayFactor = Math.sin((t - start) / DAY_MS);
        const temp = 15 + 8 * dayFactor + 3 * Math.sin(hour * Math.PI / 12) + (random() - 0.5) * 0.5;
        const hum = 60 + 15 * Math.cos((t - start) / (12 * 60 * 60 * 1000)) + (random() - 0.5) * 3;
        const pres = 1010 + 8 * dayFactor + (random() - 0.5) * 0.5;
        const wind = 5 + 3 * Math.abs(Math.sin((t - start) / (6 * 60 * 60 * 1000))) + (random() - 0.5) * 1;
        rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)},${wind.toFixed(3)}`);
    }
    return rows.join('\n');
}
