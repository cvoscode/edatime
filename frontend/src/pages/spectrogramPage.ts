import { fetchSpectrogram, type SpectrogramResult } from '../dataClient.js';
import { appState } from '../state.js';
import { createEmptyStateController } from '../ui/emptyState.js';
import { exportEChartsPNG, exportEChartsSVG, exportEChartsHTML } from '../utils/chartExport.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

let loaded = false;
let spectrogramChart: any = null;
let spectrogramResizeObserver: ResizeObserver | null = null;
let spectrogramResult: SpectrogramResult | null = null;
let spectrogramSampleCount = 0;
let spectrogramEmptyStateController: ReturnType<typeof createEmptyStateController> | null = null;

function getSpectrogramEmptyStateController() {
    if (!spectrogramEmptyStateController) {
        spectrogramEmptyStateController = createEmptyStateController({ rootId: 'spectrogram-empty-state' });
    }
    return spectrogramEmptyStateController;
}

function syncSpectrogramEmptyState(message?: string): void {
    getSpectrogramEmptyStateController().update({
        visible: !spectrogramResult,
        reason: spectrogramResult ? '' : 'no-columns-selected',
        title: '',
        message: '',
        fallbackText: message || 'Pick a numeric column and click Compute to generate the spectrogram.',
    });
}

function formatSpectrogramTime(timestampMs: number): string {
    return new Date(timestampMs).toLocaleString([], {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function formatSpectrogramFrequency(frequency: number): string {
    if (!Number.isFinite(frequency)) return '—';
    if (frequency >= 1000) return `${(frequency / 1000).toFixed(2)} kHz`;
    if (frequency >= 1) return `${frequency.toFixed(2)} Hz`;
    return `${(frequency * 1000).toFixed(2)} mHz`;
}

export async function initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void> {
    if (loaded) return;
    loaded = true;

    const colSelect = document.getElementById('spectrogram-col-select') as HTMLSelectElement | null;
    const winSelect = document.getElementById('spectrogram-win-size') as HTMLSelectElement | null;
    const logCheck = document.getElementById('spectrogram-log-scale') as HTMLInputElement | null;
    const resetZoomBtn = document.getElementById('spectrogram-zoom-reset-btn') as HTMLButtonElement | null;
    const statusEl = document.getElementById('spectrogram-status') as HTMLElement | null;
    const chartEl = document.getElementById('spectrogram-chart') as HTMLDivElement | null;

    if (!chartEl || !colSelect) return;

    const ensureSpectrogramChartDimensions = () => {
        if (chartEl.clientHeight > 0) return;
        chartEl.style.minHeight = chartEl.style.minHeight || '420px';
        if (!chartEl.style.height || chartEl.style.height === '100%') {
            chartEl.style.height = '420px';
        }
    };

    const isSpectrogramChartReadyForInit = () => {
        const page = document.getElementById('page-spectrogram') as HTMLElement | null;
        ensureSpectrogramChartDimensions();
        return !!chartEl
            && chartEl.clientWidth > 0
            && chartEl.clientHeight > 0
            && (!page || !page.hidden);
    };

    const waitForSpectrogramChartReady = async (attempts = 6) => {
        for (let remaining = attempts; remaining >= 0; remaining -= 1) {
            if (isSpectrogramChartReadyForInit()) return true;
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
        return isSpectrogramChartReadyForInit();
    };

    const ensureSpectrogramChart = async () => {
        if (spectrogramChart) {
            if (isSpectrogramChartReadyForInit()) spectrogramChart.resize?.();
            return spectrogramChart;
        }
        if (!(await waitForSpectrogramChartReady())) {
            throw new Error('Spectrogram chart container is not ready yet.');
        }
        const echarts = await import('echarts');
        spectrogramChart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
        spectrogramResizeObserver?.disconnect();
        spectrogramResizeObserver = new ResizeObserver(() => spectrogramChart?.resize());
        spectrogramResizeObserver.observe(chartEl);

        if (chartEl.style.position === '' || chartEl.style.position === 'static') {
            chartEl.style.position = 'relative';
        }
        const selectionBox = document.createElement('div');
        selectionBox.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;'
            + 'border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);'
            + 'pointer-events:none;display:none;z-index:5';
        chartEl.appendChild(selectionBox);

        let dragStart: { x: number; y: number; pid: number } | null = null;
        let dragEnd = { x: 0, y: 0 };
        const grid = { left: 72, right: 110, top: 24, bottom: 80 };

        chartEl.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0) return;
            const rect = chartEl.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (x > rect.width - grid.right || x < grid.left || y < grid.top || y > rect.height - grid.bottom) return;
            dragStart = { x, y, pid: event.pointerId };
            dragEnd = { x, y };
            try { chartEl.setPointerCapture(event.pointerId); } catch { }
        });

        chartEl.addEventListener('pointermove', (event: PointerEvent) => {
            if (!dragStart || event.pointerId !== dragStart.pid) return;
            const rect = chartEl.getBoundingClientRect();
            dragEnd = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            const left = Math.min(dragStart.x, dragEnd.x);
            const top = Math.min(dragStart.y, dragEnd.y);
            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${Math.abs(dragEnd.x - dragStart.x)}px`;
            selectionBox.style.height = `${Math.abs(dragEnd.y - dragStart.y)}px`;
            selectionBox.style.display = 'block';
        });

        const finishDrag = (event: PointerEvent) => {
            if (!dragStart || event.pointerId !== dragStart.pid) return;
            const start = dragStart;
            dragStart = null;
            selectionBox.style.display = 'none';
            try { chartEl.releasePointerCapture(event.pointerId); } catch { }

            const dx = Math.abs(dragEnd.x - start.x);
            const dy = Math.abs(dragEnd.y - start.y);
            if (dx < 8 || dy < 8) return;
            if (!spectrogramChart || !spectrogramResult) return;

            const p0 = spectrogramChart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [start.x, start.y]) as [number, number] | null;
            const p1 = spectrogramChart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [dragEnd.x, dragEnd.y]) as [number, number] | null;
            if (!p0 || !p1) return;

            const xLen = spectrogramResult.times_ms.length;
            const yLen = spectrogramResult.frequencies.length;
            const xStartPct = Math.max(0, Math.min(100, (Math.min(p0[0], p1[0]) / (xLen - 1)) * 100));
            const xEndPct = Math.max(0, Math.min(100, (Math.max(p0[0], p1[0]) / (xLen - 1)) * 100));
            const yStartPct = Math.max(0, Math.min(100, (Math.min(p0[1], p1[1]) / (yLen - 1)) * 100));
            const yEndPct = Math.max(0, Math.min(100, (Math.max(p0[1], p1[1]) / (yLen - 1)) * 100));
            if (xEndPct <= xStartPct || yEndPct <= yStartPct) return;

            spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: xStartPct, end: xEndPct });
            spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: yStartPct, end: yEndPct });
        };

        chartEl.addEventListener('pointerup', finishDrag);
        chartEl.addEventListener('pointercancel', (event: PointerEvent) => {
            if (dragStart?.pid === event.pointerId) {
                dragStart = null;
                selectionBox.style.display = 'none';
            }
        });
        chartEl.addEventListener('dblclick', () => {
            if (!spectrogramChart) return;
            spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
            spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
        });

        return spectrogramChart;
    };

    const renderSpectrogramChart = async () => {
        if (!spectrogramResult) return;
        const chart = await ensureSpectrogramChart();
        const logScale = logCheck?.checked ?? true;
        const points: [number, number, number, number, number, number][] = [];
        const timeAxis = spectrogramResult.times_ms;
        const freqAxis = spectrogramResult.frequencies;
        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;

        for (let timeIndex = 0; timeIndex < timeAxis.length; timeIndex++) {
            const timeMs = timeAxis[timeIndex];
            const row = spectrogramResult.magnitudes[timeIndex] || [];
            for (let freqIndex = 0; freqIndex < freqAxis.length; freqIndex++) {
                const freq = freqAxis[freqIndex];
                const rawMagnitude = Number(row[freqIndex] ?? 0);
                const displayMagnitude = logScale ? Math.log10(Math.max(rawMagnitude, 1e-30)) : rawMagnitude;
                if (!Number.isFinite(displayMagnitude)) continue;
                minValue = Math.min(minValue, displayMagnitude);
                maxValue = Math.max(maxValue, displayMagnitude);
                points.push([timeIndex, freqIndex, displayMagnitude, timeMs, freq, rawMagnitude]);
            }
        }

        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
            minValue = 0;
            maxValue = 1;
        }

        const xTickInterval = Math.max(0, Math.floor(timeAxis.length / 10) - 1);
        const yTickInterval = Math.max(0, Math.floor(freqAxis.length / 10) - 1);

        chart.setOption({
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 72, right: 110, top: 24, bottom: 80 },
            toolbox: {
                right: 12,
                feature: {
                    restore: { title: 'Reset zoom' },
                    saveAsImage: { title: 'Save image' },
                },
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(8, 12, 20, 0.94)',
                borderColor: 'rgba(126, 158, 212, 0.28)',
                textStyle: { color: '#eef4ff' },
                formatter: (params: any) => {
                    const value = params?.value || [];
                    const timeMs = Number(value[3]);
                    const freq = Number(value[4]);
                    const displayMagnitude = Number(value[2]);
                    const rawMagnitude = Number(value[5]);
                    return [
                        `<strong>${spectrogramResult?.column || 'Spectrogram'}</strong>`,
                        `Time: ${formatSpectrogramTime(timeMs)}`,
                        `Frequency: ${formatSpectrogramFrequency(freq)}`,
                        `Intensity: ${displayMagnitude.toFixed(4)}${logScale ? ' log10' : ''}`,
                        `Raw magnitude: ${rawMagnitude.toExponential(4)}`,
                    ].join('<br>');
                },
            },
            xAxis: {
                type: 'category',
                data: timeAxis,
                name: 'Time',
                nameLocation: 'middle',
                nameGap: 48,
                axisLabel: {
                    color: '#9fb1d1',
                    rotate: 30,
                    interval: xTickInterval,
                    formatter: (value: string | number) => {
                        const date = new Date(Number(value));
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}\n${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    },
                },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'category',
                data: freqAxis,
                name: 'Frequency (Hz)',
                nameLocation: 'middle',
                nameGap: 56,
                axisLabel: {
                    color: '#9fb1d1',
                    interval: yTickInterval,
                    formatter: (value: string | number) => formatSpectrogramFrequency(Number(value)),
                },
                splitLine: { show: false },
            },
            visualMap: {
                min: minValue,
                max: maxValue,
                calculable: true,
                orient: 'vertical',
                right: 18,
                top: 'middle',
                text: [logScale ? 'High log10' : 'High', logScale ? 'Low log10' : 'Low'],
                textStyle: { color: '#9fb1d1' },
                inRange: {
                    color: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
                },
            },
            dataZoom: [
                {
                    type: 'inside', xAxisIndex: 0, filterMode: 'none',
                    zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
                },
                {
                    type: 'inside', yAxisIndex: 0, filterMode: 'none',
                    zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
                },
            ],
            series: [{
                name: spectrogramResult.column,
                type: 'heatmap',
                progressive: 0,
                emphasis: { itemStyle: { borderColor: '#ffffff', borderWidth: 1 } },
                data: points,
            }],
        });

        if (statusEl) {
            statusEl.textContent = `${spectrogramResult.column} · ${spectrogramResult.times_ms.length} windows × ${spectrogramResult.frequencies.length} bins · ${spectrogramSampleCount} samples`;
        }
        syncSpectrogramEmptyState();
    };

    if (appState.metadata) {
        for (const column of appState.metadata.numeric_columns) {
            const option = document.createElement('option');
            option.value = column;
            option.textContent = column;
            colSelect.appendChild(option);
        }
    }
    syncSpectrogramEmptyState();

    document.getElementById('spectrogram-compute-btn')?.addEventListener('click', async () => {
        const column = colSelect.value;
        if (!column) {
            if (statusEl) statusEl.textContent = 'Select a column.';
            syncSpectrogramEmptyState('Pick a numeric column and click Compute to generate the spectrogram.');
            return;
        }
        if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) {
            if (statusEl) statusEl.textContent = 'No time range available.';
            return;
        }

        const winSize = Number.parseInt(winSelect?.value || '256', 10);
        try {
            deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', true);
            if (statusEl) statusEl.textContent = 'Fetching spectrogram…';

            const startMs = appState.currentStart;
            const endMs = appState.currentEnd;
            if (startMs == null || endMs == null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
                throw new Error('No time range available.');
            }
            const startIso = new Date(startMs).toISOString();
            const endIso = new Date(endMs).toISOString();
            const response = await fetchSpectrogram(startIso, endIso, column, winSize);

            spectrogramResult = response.result;
            spectrogramSampleCount = response.sample_count;
            await renderSpectrogramChart();
        } catch (error: any) {
            spectrogramResult = null;
            syncSpectrogramEmptyState('Spectrogram generation failed. Choose a column and try again.');
            if (statusEl) statusEl.textContent = `Error: ${error?.message || 'failed'}`;
        } finally {
            deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', false);
        }
    });

    logCheck?.addEventListener('change', () => {
        if (spectrogramResult) void renderSpectrogramChart();
    });
    resetZoomBtn?.addEventListener('click', () => {
        if (!spectrogramChart) return;
        spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    });

    document.getElementById('spectrogram-export-png-btn')?.addEventListener('click', () => {
        exportEChartsPNG(spectrogramChart, 'edatime_spectrogram.png');
    });
    document.getElementById('spectrogram-export-svg-btn')?.addEventListener('click', () => {
        exportEChartsSVG(spectrogramChart, 'edatime_spectrogram.svg');
    });
    document.getElementById('spectrogram-export-html-btn')?.addEventListener('click', () => {
        exportEChartsHTML(spectrogramChart, 'edatime_spectrogram.html');
    });

    window.addEventListener('edatime:page-change', (event: Event) => {
        const detail = (event as CustomEvent<{ page?: string }>).detail;
        if (detail?.page === 'spectrogram' && appState.metadata) {
            const currentOptions = new Set(Array.from(colSelect.options).map((option) => option.value));
            for (const column of appState.metadata.numeric_columns) {
                if (!currentOptions.has(column)) {
                    const option = document.createElement('option');
                    option.value = column;
                    option.textContent = column;
                    colSelect.appendChild(option);
                }
            }
            if (isSpectrogramChartReadyForInit()) {
                spectrogramChart?.resize?.();
            } else {
                void waitForSpectrogramChartReady().then((ready) => {
                    if (ready) spectrogramChart?.resize?.();
                });
            }
        }
    });
}