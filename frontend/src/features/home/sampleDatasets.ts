export function wireSampleDatasetCards(
    showPage: (page: string) => void,
    refreshDatasetAfterMutation?: () => Promise<void>,
): void {
    document.querySelectorAll<HTMLElement>('[data-sample-dataset]').forEach((element) => {
        element.addEventListener('click', () => {
            const dataset = element.dataset.sampleDataset;
            if (dataset) {
                void loadSampleDataset(dataset, showPage, refreshDatasetAfterMutation);
            }
        });
    });
}

async function loadSampleDataset(
    datasetId: string,
    showPage: (pageName: string) => void,
    refreshDatasetAfterMutation?: () => Promise<void>,
): Promise<void> {
    const { toast } = await import('../../utils/toast.js');
    const { fetchSampleDataset, uploadDataset } = await import('../../services/api/index.js');

    const labels: Record<string, string> = {
        ettm2: 'ETTm2',
        sinusoidal: 'Sinusoidal Waves',
        weather: 'Weather Patterns',
    };
    const label = labels[datasetId] || 'Sample';
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
    }
}

function generateSinusoidalCsv(): string {
    const rows = ['timestamp,temperature,humidity,pressure'];
    const start = new Date('2024-01-01T00:00:00Z').getTime();
    const end = new Date('2024-01-08T00:00:00Z').getTime();
    const interval = 15 * 60 * 1000;
    for (let t = start; t < end; t += interval) {
        const temp = 20 + 5 * Math.sin((t - start) / (3600 * 1000)) + (Math.random() - 0.5) * 0.5;
        const hum = 50 + 20 * Math.sin((t - start) / (7200 * 1000)) + (Math.random() - 0.5) * 2;
        const pres = 1013 + 5 * Math.sin((t - start) / (5400 * 1000)) + (Math.random() - 0.5) * 0.3;
        rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)}`);
    }
    return rows.join('\n');
}

function generateWeatherCsv(): string {
    const rows = ['timestamp,temperature,humidity,pressure,wind_speed'];
    const start = new Date('2024-03-01T00:00:00Z').getTime();
    const end = new Date('2024-03-08T00:00:00Z').getTime();
    const interval = 10 * 60 * 1000;
    for (let t = start; t < end; t += interval) {
        const hour = new Date(t).getUTCHours();
        const dayFactor = Math.sin((t - start) / (86400 * 1000));
        const temp = 15 + 8 * dayFactor + 3 * Math.sin(hour * Math.PI / 12) + (Math.random() - 0.5) * 0.5;
        const hum = 60 + 15 * Math.cos((t - start) / (43200 * 1000)) + (Math.random() - 0.5) * 3;
        const pres = 1010 + 8 * dayFactor + (Math.random() - 0.5) * 0.5;
        const wind = 5 + 3 * Math.abs(Math.sin((t - start) / (21600 * 1000))) + (Math.random() - 0.5) * 1;
        rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)},${wind.toFixed(3)}`);
    }
    return rows.join('\n');
}
