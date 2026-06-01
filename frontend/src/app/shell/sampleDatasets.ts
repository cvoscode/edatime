export function wireSampleDatasetCards(showPage: (page: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-sample-dataset]').forEach((element) => {
        element.addEventListener('click', () => {
            const dataset = element.dataset.sampleDataset;
            if (dataset) {
                void loadSampleDataset(dataset, showPage);
            }
        });
    });
}

async function loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void> {
    const { toast } = await import('../../utils/toast.js');
    const { fetchSampleDataset } = await import('../../services/api/index.js');

    if (datasetId === 'ettm2') {
        const dismissLoading = toast('Loading ETTm2 sample dataset…', 'info', 0);

        let file: File;
        try {
            const blob = await fetchSampleDataset('ETTm2.csv');
            file = new File([blob], 'ETTm2.csv', { type: 'text/csv' });
        } catch (err) {
            dismissLoading();
            toast(`Could not load ETTm2: ${err}`, 'error');
            return;
        }

        const homePage = document.getElementById('page-home');
        if (homePage) homePage.hidden = true;
        showPage('upload');

        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            dismissLoading();
        } else {
            dismissLoading();
            toast('Upload panel not ready. Please navigate to Upload and drop the file manually.', 'error');
        }
    } else if (datasetId === 'sinusoidal') {
        const dismissLoading = toast('Loading Sinusoidal Waves sample dataset…', 'info', 0);
        const file = new File([generateSinusoidalCsv()], 'sinusoidal.csv', { type: 'text/csv' });
        const homePage = document.getElementById('page-home');
        if (homePage) homePage.hidden = true;
        showPage('upload');
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            dismissLoading();
        } else {
            dismissLoading();
            toast('Upload panel not ready.', 'error');
        }
    } else if (datasetId === 'weather') {
        const dismissLoading = toast('Loading Weather Patterns sample dataset…', 'info', 0);
        const file = new File([generateWeatherCsv()], 'weather.csv', { type: 'text/csv' });
        const homePage = document.getElementById('page-home');
        if (homePage) homePage.hidden = true;
        showPage('upload');
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            dismissLoading();
        } else {
            dismissLoading();
            toast('Upload panel not ready.', 'error');
        }
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
